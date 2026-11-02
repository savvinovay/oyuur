// Made-up events for a dev server's base (OYUUR-27): ~40 installs over the last 30 days.
// node design/oyuur-27/seed-events.mjs server/dev.db [installs]   — never on the real server.
import { createAnalytics } from '../../server/src/analytics.js';
import { openDb } from '../../server/src/db.js';

const file = process.argv[2];
const count = Number(process.argv[3] ?? 40);
if (!file) throw new Error('usage: node seed-events.mjs <db file> [installs]');
const db = openDb(file);
createAnalytics({ db, now: Date.now, fail: () => {}, limit: () => {} });

let r = 27;
const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
const DAY = 86_400_000;
const today = Math.floor(Date.now() / DAY);
const dayKey = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const ins = db.prepare('INSERT OR IGNORE INTO events (install, id, name, at, day, day_n, tz, mode, version, lang, props, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const id = () => Math.floor(rand() * 2 ** 48).toString(36).padStart(10, '0');

db.exec('BEGIN');
let total = 0;
for (let i = 0; i < count; i++) {
  const install = `seed${i}`.padEnd(22, String.fromCharCode(97 + (i % 26)));
  const start = today - Math.floor(rand() * 30);
  const mode = ['browser', 'browser', 'standalone', 'standalone', 'android'][Math.floor(rand() * 5)];
  const tz = rand() < 0.8 ? 'Asia/Yakutsk' : 'Europe/Moscow';
  const old = rand() < 0.1;
  const add = (n, name, props = null) => {
    const day = start + n;
    if (day > today) return;
    ins.run(install, id(), name, day * DAY + Math.floor(rand() * 14 + 2) * 3_600_000, dayKey(day), n, tz, mode, '1.2', 'ru', props && JSON.stringify(props), Date.now());
    total++;
  };
  add(0, 'first_launch', old ? { existing: true } : null);
  add(0, 'app_open');
  if (mode === 'browser' && rand() < 0.6) add(0, 'install_card_shown');
  if (rand() < 0.85) add(0, 'plant', { seed: false, generation: 1 });
  else continue;
  if (rand() < 0.75) add(0, 'water');
  if (rand() < 0.3) add(0, 'signup');
  // Each next day: comes back less and less often, waters when it does; some make friends.
  let keep = 0.75 + rand() * 0.2;
  for (let n = 1; n <= 30; n++) {
    if (rand() > keep) break;
    keep *= 0.97;
    if (rand() < 0.15) continue; // a missed day
    add(n, 'app_open');
    if (rand() < 0.85) add(n, 'water');
    if (rand() < 0.04) add(n, 'friend_added');
    if (rand() < 0.03) add(n, 'chance_used', { days: 1 });
  }
}
db.exec('COMMIT');
console.log(`${count} installs, ${total} events → ${file}`);
