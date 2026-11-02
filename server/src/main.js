// Starts the server: the API under /api and the web version of the app from ./public.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { backupsDir, scheduleDailyBackups } from './backup.js';
import { backupBeforeStart, openDb } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? '/data/oyuur.db';
mkdirSync(dirname(dbPath), { recursive: true });
// Every start is a deploy (or a restart): a copy of the base as it was, before this version touches it.
backupBeforeStart(dbPath);
const db = openDb(dbPath);
// And a copy a day (after 4:00, 14 kept) in a worker thread; the owner downloads the latest, encrypted.
scheduleDailyBackups(dbPath);
const port = Number(process.env.PORT ?? 8080);

// OWNER_TOKEN: the owner's key for /owner (reports). Not set — the page doesn't exist.
const ownerToken = process.env.OWNER_TOKEN || null;
if (ownerToken && ownerToken.length < 16) console.warn('OWNER_TOKEN is shorter than 16 characters: the owner page is off');

createApp({ db, publicDir: process.env.PUBLIC_DIR ?? join(here, '..', 'public'), ownerToken, backupDir: backupsDir(dbPath) }).listen(port, '0.0.0.0', () => {
  console.log(`oyuur server on :${port}, db ${dbPath}, owner page ${ownerToken && ownerToken.length >= 16 ? 'on' : 'off'}`);
});
