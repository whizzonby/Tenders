// South Africa eTenders — public OCDS API, no key required.
// https://ocds-api.etenders.gov.za/swagger/index.html
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://ocds-api.etenders.gov.za/api/OCDSReleases';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('south_africa_etenders:' + sourceId).digest('hex');
}

async function scrapeSouthAfricaEtenders({ daysBack = 14, pageSize = 100 } = {}) {
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    PageNumber: '1',
    PageSize: String(pageSize),
    dateFrom: fmt(from),
    dateTo: fmt(to),
  });

  const res = await fetch(`${BASE}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`South Africa eTenders: HTTP ${res.status}`);
  }
  const data = await res.json();
  const releases = data.releases || [];

  return releases.map((r) => {
    const tender = r.tender || {};
    return {
      id: makeId(r.ocid),
      source: 'south_africa_etenders',
      source_id: r.ocid,
      title: tender.title || '(untitled notice)',
      description: tender.description || null,
      buyer: (tender.procuringEntity && tender.procuringEntity.name) || null,
      country: 'South Africa',
      sector: null,
      sector_label: tender.category || null,
      value_amount: (tender.value && tender.value.amount) || null,
      value_currency: (tender.value && tender.value.currency) || null,
      published_date: (r.date || '').slice(0, 10) || null,
      deadline_date: (tender.tenderPeriod && tender.tenderPeriod.endDate) ? tender.tenderPeriod.endDate.slice(0, 10) : null,
      url: tender.id ? `https://www.etenders.gov.za/Home/opportunities?id=${tender.id}` : 'https://www.etenders.gov.za/',
      raw_json: JSON.stringify(r).slice(0, 20000),
    };
  });
}

module.exports = { scrapeSouthAfricaEtenders };
