// Opens an owner's copy of the base (.oyuurbak, format in server/src/backup.js) and checks it.
//   node restore.mjs <copy.oyuurbak> [<out.db>]   — the key from OYUUR_OWNER_KEY (never in the command line)
// Without <out.db> it only checks: unpacks to a temporary file, checks it, deletes it.
// Exit code 0 — the copy is whole (seal, checksum, PRAGMA integrity_check), 1 — it is not.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The same code as the server's: a copy next to this file (schedule.ps1 installs one), or the project's.
const here = dirname(fileURLToPath(import.meta.url));
const lib = existsSync(join(here, 'backup.mjs')) ? join(here, 'backup.mjs') : join(here, '..', '..', 'server', 'src', 'backup.js');
const { openSealed } = await import(pathToFileURL(lib).href);

const [inFile, outArg] = process.argv.slice(2);
const key = process.env.OYUUR_OWNER_KEY ?? '';
const say = (text) => console.log(text);
const WHY = {
  not_a_backup: 'это не копия Oyuur',
  wrong_key_or_damaged: 'не тот ключ или файл повреждён',
  checksum: 'контрольная сумма не сошлась — файл повреждён',
};

if (!inFile || !key) {
  say('Как: OYUUR_OWNER_KEY=<ключ> node restore.mjs <копия.oyuurbak> [<база.db>]');
  process.exit(2);
}
const tmp = outArg ? null : mkdtempSync(join(tmpdir(), 'oyuur-check-'));
const out = outArg ? resolve(outArg) : join(tmp, 'check.db');
try {
  if (outArg && existsSync(out)) throw new Error(`${out} уже есть`);
  await openSealed(resolve(inFile), key, out);
  const db = new DatabaseSync(out, { readOnly: true });
  let check;
  let users;
  try {
    check = db.prepare('PRAGMA integrity_check').all().map((r) => r.integrity_check).join('; ');
    users = db.prepare('SELECT count(*) AS n FROM users').get().n;
  } finally {
    db.close();
  }
  if (check !== 'ok') {
    say(`Проверка базы: ${check}`);
    process.exitCode = 1;
  } else {
    say(`Проверка: ок, аккаунтов ${users}.`);
  }
} catch (error) {
  say(`Не открылась: ${WHY[error.message] ?? error.message}`);
  process.exitCode = 1;
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
