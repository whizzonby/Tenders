// Dominican Republic — the live portal (portal.comprasdominicana.gob.do) sits behind
// a bot-detection WAF that returns 401 to any non-browser request, so there's no way
// to query it directly. DGCP instead publishes official OCDS data as yearly bulk
// files via the Open Contracting Partnership's own data registry — no key required.
// https://data.open-contracting.org/en/publication/22
const fetch = require('node-fetch');
const zlib = require('zlib');
const crypto = require('crypto');

function makeId(sourceId) {
  return crypto.createHash('sha1').update('dominican_republic:' + sourceId).digest('hex');
}

// This mirror runs roughly 6-7 weeks behind real time (observed: data available
// through mid-June while live-tested in early August) — daysBack needs to be wide
// enough to actually catch anything, not a sign of a broken query.
async function scrapeDominicanRepublic({ daysBack = 75 } = {}) {
  const year = new Date().getFullYear();
  const url = `https://data.open-contracting.org/en/publication/22/download?name=${year}.jsonl.gz`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) {
    throw new Error(`Dominican Republic: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const text = zlib.gunzipSync(buf).toString('utf8');
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;

  const rows = [];
  for (const line of text.trim().split('\n')) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const tender = record.tender;
    if (!tender || !tender.title) continue;
    const recordDate = record.date ? new Date(record.date).getTime() : 0;
    if (recordDate < cutoff) continue;

    const doc = (tender.documents && tender.documents[0]) || {};
    rows.push({
      id: makeId(record.ocid),
      source: 'dominican_republic',
      source_id: record.ocid,
      title: tender.title,
      description: tender.description || null,
      buyer: (tender.procuringEntity && tender.procuringEntity.name) || null,
      country: 'Dominican Republic',
      sector: null,
      sector_label: null,
      value_amount: (tender.value && tender.value.amount) ?? null,
      value_currency: (tender.value && tender.value.currency) || null,
      published_date: record.date ? record.date.slice(0, 10) : null,
      deadline_date: (tender.tenderPeriod && tender.tenderPeriod.endDate) ? tender.tenderPeriod.endDate.slice(0, 10) : null,
      url: doc.url || 'https://portal.comprasdominicana.gob.do/',
      raw_json: JSON.stringify(record).slice(0, 20000),
    });
  }

  return rows;
}

module.exports = { scrapeDominicanRepublic };
