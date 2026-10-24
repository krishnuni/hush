import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Only the official, ungated fixed-voice repository. No account token is read.
const revision = 'a7056f505a4a8ca72d8b5fb1440071d6f1a35739';
const base = `https://huggingface.co/kyutai/pocket-tts-without-voice-cloning/resolve/${revision}/languages/english_2026-04/`;
const assets = [
  {
    file: 'model.safetensors',
    remote: 'model.safetensors',
    sha256: 'be9c6b4876d3f30740a8225dfcaa2e43dc4aeb753c15272735bee16bbb4abb0a',
  },
  {
    file: 'tokenizer.json',
    remote: 'tokenizer.json',
    sha256: 'f498428e1eafee50492f7be13dc9bfafcfc12e508cd0eb1b01c92ecd5d8c6687',
  },
  {
    file: 'alba.safetensors',
    remote: 'embeddings/alba.safetensors',
    sha256: '1b704240aa9da36ab32ac05c46a8a9172031c82bc07dbab9df834f0063b24985',
  },
];
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = resolve(process.argv[2] ?? resolve(root, 'runtime/voice'));
await mkdir(destination, { recursive: true });
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
for (const asset of assets) {
  const path = resolve(destination, asset.file);
  if ((await digest(path).catch(() => null)) === asset.sha256) {
    console.log(`Verified ${asset.file}`);
    continue;
  }
  console.log(`Downloading ${asset.file} from the official fixed-voice repository…`);
  const response = await fetch(base + asset.remote);
  if (!response.ok || !response.body)
    throw new Error(`Download failed (${response.status}) for ${asset.file}`);
  const temporary = path + '.part';
  const hash = createHash('sha256');
  let size = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > 230 * 1024 * 1024) {
            callback(new Error('The voice asset exceeds its download budget.'));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(temporary),
    );
    if (hash.digest('hex') !== asset.sha256)
      throw new Error(`Checksum mismatch for ${asset.file}; the asset was not installed.`);
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
let config = await readFile(resolve(root, 'vendor/pocket-runtime/english-2026-04.yaml'), 'utf8');
config = config
  .replace(/^weights_path:.*$/m, `weights_path: ${JSON.stringify('model.safetensors')}`)
  .replace(/^weights_path_without_voice_cloning:.*\n/m, '')
  .replace(/^    tokenizer_path:.*$/m, `    tokenizer_path: ${JSON.stringify('tokenizer.json')}`);
await writeFile(resolve(destination, 'config.yaml'), config);
await writeFile(
  resolve(destination, 'manifest.json'),
  JSON.stringify(
    {
      engine: 'Pocket TTS',
      runtimeCommit: 'a922b912dfa366975294afb568d815b305acde5d',
      modelRepository: 'kyutai/pocket-tts-without-voice-cloning',
      revision,
      language: 'english_2026-04',
      voice: 'Alba MacKenna',
      modelLicense: 'CC-BY-4.0',
      voiceLicense: 'CC-BY-4.0',
      assets,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(destination, 'ATTRIBUTION.txt'),
  'Pocket TTS model by Kyutai. English 2026-04 fixed-voice model.\nModel: https://huggingface.co/kyutai/pocket-tts-without-voice-cloning\nVoice: Alba MacKenna, distributed by Kyutai, https://huggingface.co/kyutai/tts-voices\nModel and voice: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/\nVoice embedding supplied by Kyutai; no recording or cloning by Hush.\nRuntime code: MIT, see vendor/pocket-runtime/LICENSE.\nThis pack is optional and separately downloaded. Inference uses local files.\n',
);
console.log(`Voice pack verified at ${destination}`);
