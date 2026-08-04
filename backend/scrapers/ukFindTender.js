// UK Find a Tender Service — higher-value UK/NI procurement (separate from Contracts Finder,
// which covers lower-value England notices). Public OCDS API, no key required for reads
// (the CDP-Api-Key header mentioned in docs is only for publishers submitting notices).
// Docs: https://www.find-tender.service.gov.uk/apidocumentation
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('uk_find_tender:' + sourceId).digest('hex');
}

async function scrapeUkFindTender({ daysBack = 7, limit = 100 } = {}) {
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    updatedFrom: from.toISOString(),
    updatedTo: to.toISOString(),
    limit: String(limit),
  });

  const res = await fetch(`${BASE}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`UK Find a Tender: HTTP ${res.status}`);
  }
  const data = await res.json();
  const releases = data.releases || [];

  return releases.map((r) => {
    const tender = r.tender || {};
    const contract = (r.contracts && r.contracts[0]) || {};
    const item = (tender.items && tender.items[0]) || {};
    const classification = (item.additionalClassifications && item.additionalClassifications[0]) || {};
    const buyerParty = (r.parties || []).find((p) => (p.roles || []).includes('buyer'));
    const deliveryCountry = (item.deliveryAddresses && item.deliveryAddresses[0] && item.deliveryAddresses[0].countryName) || null;
    const doc = (contract.documents && contract.documents[0]) || {};
    const value = tender.value || contract.value || {};

    return {
      id: makeId(r.id),
      source: 'uk_find_tender',
      source_id: r.id,
      title: tender.title || '(untitled notice)',
      description: tender.description || null,
      buyer: (r.buyer && r.buyer.name) || (buyerParty && buyerParty.name) || null,
      country: deliveryCountry || (buyerParty && buyerParty.address && buyerParty.address.countryName) || 'United Kingdom',
      sector: classification.id || null,
      sector_label: classification.description || null,
      value_amount: value.amount ?? null,
      value_currency: value.currency ?? null,
      published_date: (r.date || '').slice(0, 10) || null,
      deadline_date: (tender.tenderPeriod && tender.tenderPeriod.endDate) ? tender.tenderPeriod.endDate.slice(0, 10) : null,
      url: doc.url || `https://www.find-tender.service.gov.uk/Notice/${r.id}`,
      raw_json: JSON.stringify(r).slice(0, 20000),
    };
  });
}

module.exports = { scrapeUkFindTender };
