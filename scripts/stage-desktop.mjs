import { mkdir, readFile, copyFile, writeFile, chmod } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const voice = resolve(root, 'runtime/voice'),
  resources = resolve(root, 'src-tauri/resources');
const manifest = JSON.parse(await readFile(resolve(voice, 'manifest.json'), 'utf8'));
if (
  manifest.modelRepository !== 'kyutai/pocket-tts-without-voice-cloning' ||
  manifest.revision !== 'a7056f505a4a8ca72d8b5fb1440071d6f1a35739'
)
  throw new Error('Run voice:setup to prepare the pinned official voice pack.');
await mkdir(resolve(resources, 'voice'), { recursive: true });
await mkdir(resolve(resources, 'worker'), { recursive: true });
for (const asset of manifest.assets) {
  if (!['model.safetensors', 'tokenizer.json', 'alba.safetensors'].includes(asset.file))
    throw new Error('Invalid voice pack manifest.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolve(voice, asset.file))) hash.update(chunk);
  if (hash.digest('hex') !== asset.sha256)
    throw new Error('Voice pack checksum mismatch. Run voice:setup.');
  await copyFile(resolve(voice, asset.file), resolve(resources, 'voice', asset.file));
}
for (const file of ['config.yaml', 'manifest.json', 'ATTRIBUTION.txt'])
  await copyFile(resolve(voice, file), resolve(resources, 'voice', file));
const config = await readFile(resolve(resources, 'voice/config.yaml'), 'utf8');
if (config.includes(root))
  throw new Error('Voice config contains a machine-specific path. Run voice:setup again.');
const binary = process.platform === 'win32' ? 'hush-voice-worker.exe' : 'hush-voice-worker';
await copyFile(resolve(root, 'target/release', binary), resolve(resources, 'worker', binary));
if (process.platform !== 'win32') await chmod(resolve(resources, 'worker', binary), 0o755);
await copyFile(
  resolve(root, 'vendor/pocket-runtime/LICENSE'),
  resolve(resources, 'voice/RUNTIME-LICENSE.txt'),
);
await writeFile(
  resolve(root, 'src-tauri/tauri.voice.conf.json'),
  JSON.stringify(
    { bundle: { resources: { 'resources/voice/': 'voice/', 'resources/worker/': 'worker/' } } },
    null,
    2,
  ) + '\n',
);
console.log(
  'Staged verified local voice pack and worker. Build with: npm run tauri -- build --config src-tauri/tauri.voice.conf.json',
);
