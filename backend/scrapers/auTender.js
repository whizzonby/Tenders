// Australia AusTender — public OCDS API, no API key required.
// Docs: https://github.com/austender/austender-ocds-api
// Note: this endpoint returns published *contract* releases (awards/signed contracts),
// not open calls for bids — same shape as the "Contract Award" notices World Bank returns.
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://api.tenders.gov.au/ocds/findByDates/contractPublished';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('au_tender:' + sourceId).digest('hex');
}

function isoZ(date) {
  return date.toISOString().replace(/\.\d+Z$/, 'Z');
}

async function scrapeAuTender({ daysBack = 14 } = {}) {
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const to = new Date();
  const url = `${BASE}/${isoZ(from)}/${isoZ(to)}`;

  const res = await fetch(url, { timeout: 20000 });
  if (!res.ok) {
    throw new Error(`AusTender: HTTP ${res.status}`);
  }
  const data = await res.json();
  const releases = data.releases || [];

  return releases.map((r) => {
    const contract = (r.contracts && r.contracts[0]) || {};
    const parties = r.parties || [];
    const buyerParty = parties.find((p) => (p.roles || []).includes('procuringEntity'));
    const contractId = contract.id || r.id;

    return {
      id: makeId(r.id),
      source: 'au_tender',
      source_id: r.id,
      title: contract.description || contract.title || '(untitled notice)',
      description: null,
      buyer: (buyerParty && buyerParty.name) || null,
      country: 'Australia',
      sector: (contract.items && contract.items[0] && contract.items[0].classification && contract.items[0].classification.id) || null,
      sector_label: (r.tender && r.tender.procurementMethodDetails) || null,
      value_amount: contract.value ? Number(contract.value.amount) : null,
      value_currency: (contract.value && contract.value.currency) || null,
      published_date: (r.date || '').slice(0, 10) || null,
      deadline_date: null,
      url: contractId ? `https://www.tenders.gov.au/Cn/Show/${contractId}` : 'https://www.tenders.gov.au/',
      raw_json: JSON.stringify(r).slice(0, 20000),
    };
  });
}

module.exports = { scrapeAuTender };
