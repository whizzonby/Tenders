// UK Contracts Finder — public OCDS Search API, no API key required.
// Docs: https://www.contractsfinder.service.gov.uk/apidocumentation
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('uk_contracts_finder:' + sourceId).digest('hex');
}

function isoDate(d) {
  if (!d) return null;
  return String(d).slice(0, 10);
}

// Pulls notices published in the last `daysBack` days, stage = tender (open opportunities)
async function scrapeContractsFinderUK({ daysBack = 14 } = {}) {
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    publishedFrom: from.toISOString().slice(0, 19),
    publishedTo: to.toISOString().slice(0, 19),
    stages: 'tender',
  });

  const url = `${BASE}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`Contracts Finder UK: HTTP ${res.status}`);
  }
  const data = await res.json();
  const releases = data.releases || [];

  return releases.map((rel) => {
    const tender = rel.tender || {};
    const classification = tender.classification || {};
    const value = tender.value || {};
    const buyer = (rel.buyer && rel.buyer.name) || (rel.parties && rel.parties[0] && rel.parties[0].name) || null;
    const country =
      (tender.items && tender.items[0] && tender.items[0].deliveryAddresses &&
        tender.items[0].deliveryAddresses[0] && tender.items[0].deliveryAddresses[0].countryName) ||
      'United Kingdom';

    return {
      id: makeId(rel.id || rel.ocid),
      source: 'uk_contracts_finder',
      source_id: rel.id || rel.ocid,
      title: tender.title || '(untitled notice)',
      description: tender.description || null,
      buyer,
      country,
      sector: classification.id || null,
      sector_label: classification.description || null,
      value_amount: value.amount ?? null,
      value_currency: value.currency ?? null,
      published_date: isoDate(tender.datePublished || rel.date),
      deadline_date: isoDate(tender.tenderPeriod && tender.tenderPeriod.endDate),
      url: `https://www.contractsfinder.service.gov.uk/Notice/${(rel.id || '').split('-').pop()}`,
      raw_json: JSON.stringify(rel).slice(0, 20000),
    };
  });
}

module.exports = { scrapeContractsFinderUK };
