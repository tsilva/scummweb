import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const directory of ['src', 'test']) {
  for (const name of await readdir(new URL(`./${directory}/`, import.meta.url))) {
    if (name.endsWith('.js')) execFileSync(process.execPath,
      ['--check', new URL(`./${directory}/${name}`, import.meta.url).pathname], { stdio: 'pipe' });
  }
}
console.log('ScummWEB agent backbone syntax checks passed.');
