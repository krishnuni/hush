import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';

/** Local development only. Production calls the Rust host over Tauri IPC. */
export function voiceBridge(): Plugin {
  let worker: ChildProcessWithoutNullStreams | undefined;
  let ready = false;
  let engineKey: string | undefined;
  let reason = 'Local neural narration needs a voice pack and the desktop engine.';
  let buffer = '';
  let pending:
    | {
        id: string;
        resolve: (bytes: Buffer) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  const reject = (message: string) => {
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      pending = undefined;
    }
  };
  const send = (value: unknown) => worker?.stdin.write(JSON.stringify(value) + '\n');
  return {
    name: 'hush-local-voice',
    apply: 'serve',
    configureServer(server) {
      const binary = process.env.HUSH_VOICE_WORKER;
      const config = process.env.HUSH_VOICE_CONFIG;
      const voice = process.env.HUSH_VOICE_EMBEDDING;
      if (binary && config && voice) {
        reason = 'The local neural voice is warming up.';
        worker = spawn(binary, [config, voice], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        worker.stdout.setEncoding('utf8');
        worker.stdout.on('data', (chunk: string) => {
          buffer += chunk;
          if (buffer.length > 10 * 1024 * 1024) {
            worker?.kill();
            reject('The voice exceeded its audio memory budget.');
            return;
          }
          let end: number;
          while ((end = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            try {
              const event = JSON.parse(line);
              if (event.type === 'ready') {
                ready = true;
                engineKey = event.engineKey;
                reason =
                  'Local Pocket TTS voice connected. Audio uses your browser’s output device.';
              } else if (event.type === 'fatal') {
                ready = false;
                reason = event.error;
                reject(reason);
              } else if (event.id === pending?.id) {
                if (event.type === 'audio') {
                  const job = pending!;
                  clearTimeout(job.timer);
                  pending = undefined;
                  const bytes = Buffer.from(event.wav, 'base64');
                  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF') {
                    job.reject(new Error('The voice returned invalid audio.'));
                  } else job.resolve(bytes);
                } else if (event.type === 'error') reject(event.error);
              }
            } catch {
              ready = false;
              reason = 'The local voice returned an invalid message.';
              reject(reason);
            }
          }
        });
        worker.stderr.on('data', () => {
          /* Do not put book text or machine paths in browser responses. */
        });
        worker.on('error', () => {
          ready = false;
          reason = 'The local voice worker could not be started. Check its configured path.';
          reject(reason);
        });
        worker.on('exit', () => {
          ready = false;
          reason = 'The local voice stopped. Restart Hush to reconnect it.';
          reject(reason);
        });
        server.httpServer?.once('close', () => {
          reject('Hush is closing.');
          worker?.stdin.end();
          worker?.kill();
        });
      }
      server.middlewares.use('/__hush/voice', async (req, res, next) => {
        const json = (code: number, value: unknown) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(value));
        };
        if (req.url === '/status' && req.method === 'GET') {
          json(200, { available: ready, engine: 'Pocket TTS', reason, engineKey });
          return;
        }
        if (req.url !== '/synthesize') {
          next();
          return;
        }
        // A custom header plus same-origin checks prevents cross-site form requests.
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (
          req.method !== 'POST' ||
          req.headers['x-hush-voice'] !== '1' ||
          (origin && origin !== `http://${host}`)
        ) {
          json(403, { error: 'Open narration from Hush.' });
          return;
        }
        if (!ready) {
          json(503, { error: reason });
          return;
        }
        let raw = '';
        try {
          for await (const chunk of req) {
            raw += chunk;
            if (Buffer.byteLength(raw) > 8192) {
              json(413, { error: 'This passage is too long.' });
              return;
            }
          }
          const { text } = JSON.parse(raw);
          if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 1200) {
            json(400, { error: 'Choose a passage up to 1,200 characters.' });
            return;
          }
          const id = randomUUID();
          if (pending) {
            send({ type: 'cancel', id: pending.id });
            reject('A newer narration request replaced this passage.');
          }
          const audio = new Promise<Buffer>((resolve, rejectJob) => {
            pending = {
              id,
              resolve,
              reject: rejectJob,
              timer: setTimeout(() => {
                send({ type: 'cancel', id });
                reject('The voice took too long. Retry this passage.');
              }, 60000),
            };
          });
          res.once('close', () => {
            if (pending?.id === id) {
              send({ type: 'cancel', id });
              reject('Narration cancelled.');
            }
          });
          send({ type: 'synthesize', id, text });
          const bytes = await audio;
          if (!res.destroyed) {
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Cache-Control', 'no-store');
            res.end(bytes);
          }
        } catch (error) {
          if (!res.destroyed)
            json(500, {
              error:
                error instanceof Error
                  ? error.message
                  : 'The local voice could not read this passage.',
            });
        }
      });
    },
  };
}
