// Checks every stored contract's URL and reports/removes dead links.
//
// A plain 404/410 from the origin means the notice really is gone — safe to delete.
// Anything else (403, 429, timeouts, connection resets) is usually a source's bot
// protection reacting to a script, not proof the link is dead (AusTender, for example,
// 403s a bare request but works fine with a normal browser UA) — those are only
// reported, never auto-deleted.
//
// Usage:
//   node scripts/checkLinks.js            # report only
//   node scripts/checkLinks.js --delete   # also delete rows whose URL is confirmed dead
const fetch = require('node-fetch');
const { db } = require('../db');

const CONCURRENCY = 8;
const TIMEOUT_MS = 10000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function checkOne(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    });
    // Some servers don't implement HEAD correctly (405, or a false 200) — confirm with GET.
    if (res.status === 405 || res.status >= 500) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': UA },
      });
    }
    return { status: res.status };
  } catch (err) {
    return { status: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  const rows = db.prepare('SELECT id, source, title, url FROM contracts').all();
  console.log(`Checking ${rows.length} contract URLs (concurrency ${CONCURRENCY})...`);

  const results = await runPool(rows, async (row, i) => {
    const r = await checkOne(row.url);
    if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${rows.length}`);
    return r;
  }, CONCURRENCY);

  const dead = []; // confirmed 404/410
  const blocked = []; // ambiguous — reported only
  const ok = [];

  rows.forEach((row, i) => {
    const { status, error } = results[i];
    if (status === 404 || status === 410) {
      dead.push({ ...row, status });
    } else if (status === null || status === 403 || status === 429 || status >= 500) {
      blocked.push({ ...row, status, error });
    } else {
      ok.push(row);
    }
  });

  console.log(`\nOK: ${ok.length}`);

  console.log(`\nConfirmed dead (404/410): ${dead.length}`);
  const bySource = {};
  for (const d of dead) bySource[d.source] = (bySource[d.source] || 0) + 1;
  for (const [source, count] of Object.entries(bySource)) console.log(`  ${source}: ${count}`);
  for (const d of dead.slice(0, 20)) console.log(`  [${d.status}] ${d.source} — ${d.title} — ${d.url}`);
  if (dead.length > 20) console.log(`  ...and ${dead.length - 20} more`);

  console.log(`\nBlocked/unreachable (not auto-deleted — may be bot protection, not a dead link): ${blocked.length}`);
  const byBlockedSource = {};
  for (const b of blocked) byBlockedSource[b.source] = (byBlockedSource[b.source] || 0) + 1;
  for (const [source, count] of Object.entries(byBlockedSource)) console.log(`  ${source}: ${count}`);

  if (shouldDelete && dead.length) {
    const del = db.prepare('DELETE FROM contracts WHERE id = ?');
    const tx = db.transaction((items) => { for (const item of items) del.run(item.id); });
    tx(dead);
    console.log(`\nDeleted ${dead.length} confirmed-dead rows.`);
  } else if (dead.length) {
    console.log('\nRun with --delete to remove the confirmed-dead rows above.');
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
