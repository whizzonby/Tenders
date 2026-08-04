// Kenya PPIP — public OCDS bulk file per financial year, no key required.
// The human-facing /ocds page is a JS shell; the real data lives in a per-year
// static JSON file discoverable via the index API.
// https://tenders.go.ke/api/ocds/index
const fetch = require('node-fetch');
const crypto = require('crypto');

const INDEX_URL = 'https://tenders.go.ke/api/ocds/index?search=&perpage=5&page=1';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('kenya_ppip:' + sourceId).digest('hex');
}

async function scrapeKenyaPpip({ daysBack = 14 } = {}) {
  const indexRes = await fetch(INDEX_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 25000 });
  if (!indexRes.ok) {
    throw new Error(`Kenya PPIP index: HTTP ${indexRes.status}`);
  }
  const indexData = await indexRes.json();
  const entries = indexData.data || [];
  const current = entries.find((e) => e.financial_year && e.financial_year.is_current_year) || entries[0];
  if (!current) return [];

  const fileUrl = `https://tenders.go.ke/storage/${current.src.replace(/^public\//, '')}`;
  const fileRes = await fetch(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 25000 });
  if (!fileRes.ok) {
    throw new Error(`Kenya PPIP data file: HTTP ${fileRes.status}`);
  }
  const data = await fileRes.json();
  const releases = data.releases || [];
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;

  return releases
    .filter((r) => r.date && new Date(r.date).getTime() >= cutoff)
    .map((r) => {
      const tender = r.tender || {};
      const idPart = (r.ocid || '').split('-')[2] || '';
      return {
        id: makeId(r.ocid),
        source: 'kenya_ppip',
        source_id: r.ocid,
        title: tender.title || '(untitled notice)',
        description: null,
        buyer: (r.buyer && r.buyer.name) || null,
        country: 'Kenya',
        sector: null,
        sector_label: tender.mainProcurementCategory || null,
        value_amount: null,
        value_currency: null,
        published_date: (r.date || '').slice(0, 10) || null,
        deadline_date: (tender.tenderPeriod && tender.tenderPeriod.endDate) ? tender.tenderPeriod.endDate.slice(0, 10) : null,
        url: idPart ? `https://tenders.go.ke/tenders/${idPart}` : 'https://tenders.go.ke/',
        raw_json: JSON.stringify(r).slice(0, 20000),
      };
    });
}

module.exports = { scrapeKenyaPpip };
