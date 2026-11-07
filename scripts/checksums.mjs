import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release');
const files = (await readdir(release)).filter((name) =>
  (name.startsWith(`RIDEN-Desktop-${version}-windows-`) && name.endsWith('-setup.exe')) ||
  (name.startsWith(`riden-desktop-${version}-`) && name.endsWith('.pkg.tar.zst')),
).sort();
const sums = [];
for (const file of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(release, file))) hash.update(chunk);
  sums.push(`${hash.digest('hex')}  ${file}`);
}
await writeFile(path.join(release, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`SHA256SUMS: ${files.length} release artifacts`);
