import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const fallback = await readFile('third-party/licenses/isarray-MIT.txt', 'utf8');
const mitTerms = fallback
  .split('\n')
  .filter((line) => !line.startsWith('Copyright (c)'))
  .join('\n');
const inherited = {
  '@types/localforage': 'node_modules/localforage/LICENSE',
};
const parts = [
  'Hush third-party notices\n\nApplication dependencies retain their upstream licenses. This document collects package notices and the bundled font license. Optional desktop neural model/voice attribution is distributed with its separate voice pack.\n',
];
let count = 0;
for (const [path, metadata] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!path.startsWith('node_modules/') || path.split('/').includes('..') || metadata.dev) continue;
  const root = resolve(path);
  const pkg = await readFile(resolve(root, 'package.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (!pkg) continue;
  const files = (await readdir(root)).filter((name) =>
    /^(licen[cs]e|copying|copyright|notice)(\.|$|-)/i.test(name),
  );
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  parts.push(
    `\n${'='.repeat(64)}\n${pkg.name} ${pkg.version}\nDeclared license: ${pkg.license ?? 'See included terms'}\nSource: ${repository ?? pkg.homepage ?? 'See npm package metadata'}\n`,
  );
  if (files.length) {
    for (const name of files.sort())
      parts.push(`\n${name}\n${await readFile(resolve(root, name), 'utf8')}`);
  } else if (pkg.name.startsWith('@napi-rs/canvas-'))
    parts.push(await readFile('node_modules/@napi-rs/canvas/LICENSE', 'utf8'));
  else if (inherited[pkg.name]) parts.push(await readFile(inherited[pkg.name], 'utf8'));
  else if (pkg.name === 'isarray') parts.push(fallback);
  else if (pkg.license === 'MIT') {
    const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
    parts.push(
      `Upstream package declares MIT but supplies no separate license text or copyright year.\nDeclared author: ${author ?? 'See upstream source'}.\nStandard MIT terms follow; no copyright holder/year is inferred.\n\n${mitTerms}`,
    );
  } else throw new Error(`Missing distribution notice for ${pkg.name}.`);
  count++;
}
parts.push(`\n${'='.repeat(64)}\nNoto fonts\n${await readFile('public/fonts/OFL.txt', 'utf8')}`);
await writeFile('public/THIRD_PARTY_NOTICES.txt', parts.join('\n'));
console.log(`Collected notices for ${count} installed runtime packages and the bundled fonts.`);
