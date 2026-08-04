// Guyana eProcure — public bid opportunities API, no key required.
// The site itself is a single live dashboard page with no per-notice detail URL,
// so notices link straight to their advertisement PDF instead.
// https://eprocure.gov.gy/
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://eprocure.gov.gy/api/method/doctracker.api.powerbi.get_public_bid_opportunities';
const ORIGIN = 'https://eprocure.gov.gy';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('guyana_eprocure:' + sourceId).digest('hex');
}

async function scrapeGuyanaEprocure() {
  const res = await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`Guyana eProcure: HTTP ${res.status}`);
  }
  const data = await res.json();
  const rows = data.message || [];

  return rows.map((r) => {
    const doc = (r.advertisement_documents && r.advertisement_documents[0]) || {};
    const docUrl = doc.document_file ? encodeURI(`${ORIGIN}${doc.document_file}`) : ORIGIN;

    return {
      id: makeId(r.project_id),
      source: 'guyana_eprocure',
      source_id: r.project_id,
      title: (r.project_name || '(untitled notice)').replace(/\s+/g, ' ').trim(),
      description: null,
      buyer: r.agency || null,
      country: 'Guyana',
      sector: null,
      sector_label: [r.procurement_nature, r.procurement_sub_nature].filter(Boolean).join(' — ') || null,
      value_amount: r.estimated_value ? r.estimated_value : null,
      value_currency: r.estimated_value ? 'GYD' : null,
      published_date: r.advertisement_date || null,
      deadline_date: r.actual_bid_opening_date || r.projected_bid_opening_date || null,
      url: docUrl,
      raw_json: JSON.stringify(r).slice(0, 20000),
    };
  });
}

module.exports = { scrapeGuyanaEprocure };
