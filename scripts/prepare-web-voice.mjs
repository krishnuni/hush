import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, copyFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = resolve(root, 'public/narration');
const revision = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const model = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const source = `https://huggingface.co/${model}/resolve/${revision}/`;
const remote = [
  ['config.json', '790faf216e7e3f490e71e8bc80df79ed8941101c', 44],
  ['tokenizer.json', '4280f55fc1c32211bc9bb4d55545759a00054ecd', 3497],
  ['tokenizer_config.json', '5c81e9a3a06db9139900d6ee5b60e8bb701ccb0b', 113],
  [
    'onnx/model_quantized.onnx',
    'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478',
    92361116,
  ],
];
async function digest(path, size, expected) {
  const hash = createHash(expected.length === 40 ? 'sha1' : 'sha256');
  if (expected.length === 40) hash.update(`blob ${size}\0`);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
for (const [name, expected, size] of remote) {
  const path = resolve(destination, 'model/kokoro', name);
  await mkdir(dirname(path), { recursive: true });
  if ((await digest(path, size, expected).catch(() => '')) === expected) {
    await unlink(path + '.part').catch(() => {});
    continue;
  }
  console.log(`Preparing browser voice: ${name} (${size} bytes)`);
  const response = await fetch(source + name, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body)
    throw new Error(`Voice download failed: ${name} (${response.status})`);
  let received = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, next) {
          received += chunk.length;
          next(received > size ? new Error('Voice download exceeds pinned size') : null, chunk);
        },
      }),
      createWriteStream(path + '.part'),
    );
    if (received !== size || (await digest(path + '.part', size, expected)) !== expected)
      throw new Error(`Pinned voice checksum mismatch: ${name}`);
    await rename(path + '.part', path);
  } catch (error) {
    await unlink(path + '.part').catch(() => {});
    throw error;
  }
}
await mkdir(resolve(destination, 'ort'), { recursive: true });
for (const name of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'])
  await copyFile(
    resolve(root, 'node_modules/@huggingface/transformers/dist', name),
    resolve(destination, 'ort', name),
  );
await copyFile(
  resolve(root, 'node_modules/kokoro-js/voices/af_heart.bin'),
  resolve(destination, 'af_heart.bin'),
);
if (
  (await digest(
    resolve(destination, 'af_heart.bin'),
    522240,
    'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b',
  )) !== 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b'
)
  throw new Error('Bundled voice does not match the pinned upstream voice.');
const names = [
  ...remote.map(([name]) => 'model/kokoro/' + name),
  'af_heart.bin',
  'ort/ort-wasm-simd-threaded.jsep.mjs',
  'ort/ort-wasm-simd-threaded.jsep.wasm',
];
const files = [];
for (const name of names) {
  const data = await readFile(resolve(destination, name));
  files.push({
    path: name,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}
await writeFile(
  resolve(destination, 'manifest.json'),
  JSON.stringify(
    {
      version: 'hush-kokoro-q8-v1',
      model,
      revision,
      voice: 'af_heart',
      runtime: 'kokoro-js@1.2.1+transformers@3.8.1',
      license: 'Apache-2.0',
      files,
      bytes: files.reduce((n, f) => n + f.bytes, 0),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Browser voice staged: ${Math.ceil(files.reduce((n, f) => n + f.bytes, 0) / 1e6)} MB, downloaded only after the reader chooses Enable.`,
);
