import { mkdir, readdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Each contender publishes a unique claim BEFORE inspecting other claims.
// Concurrent contenders may both refuse, but cannot both acquire ownership.
// Dead claims have unique filenames, so removing one cannot erase a new owner.
export async function claimDataDir(dataDir) {
  const directory = path.join(dataDir, '.owners');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `${process.pid}-${randomUUID()}.lock`;
  const file = path.join(directory, name);
  await writeFile(file, '', { flag: 'wx', mode: 0o600 });
  const release = () => unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  try {
    for (const other of await readdir(directory)) {
      if (other === name) continue;
      const match = /^(\d+)-[0-9a-f-]{36}\.lock$/.exec(other);
      if (!match) throw new Error('Unrecognized instance ownership record; inspect the data directory before reuse');
      try {
        process.kill(Number(match[1]), 0);
      } catch (error) {
        if (error.code === 'ESRCH') {
          await unlink(path.join(directory, other)).catch(error => { if (error.code !== 'ENOENT') throw error; });
          continue;
        }
        throw error;
      }
      throw new Error('Browser profile is already in use. Choose a different --instance or --data-dir, or omit both for an isolated instance.');
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}
