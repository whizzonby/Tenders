// EU TED (Tenders Electronic Daily) — public Search API v3, no API key required for search.
// Docs: https://docs.ted.europa.eu/api/latest/search.html
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://api.ted.europa.eu/v3/notices/search';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('ted_eu:' + sourceId).digest('hex');
}

function firstOf(val) {
  return Array.isArray(val) ? val[0] : val;
}

function firstLang(multilingual) {
  if (!multilingual) return null;
  if (typeof multilingual === 'string') return multilingual;
  if (multilingual.eng) return Array.isArray(multilingual.eng) ? multilingual.eng[0] : multilingual.eng;
  const firstKey = Object.keys(multilingual)[0];
  const val = firstKey ? multilingual[firstKey] : null;
  return Array.isArray(val) ? val[0] : val;
}

// keyword is optional; pass '' for "everything published recently"
async function scrapeTedEU({ keyword = '', daysBack = 14, limit = 100 } = {}) {
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const pd = from.toISOString().slice(0, 10).replace(/-/g, '');

  let query = `PD>=${pd}`;
  if (keyword) query = `FT~"${keyword}" AND ${query}`;
  query += ' SORT BY publication-date DESC';

  const body = {
    query,
    fields: [
      'publication-number', 'notice-title', 'notice-type', 'contract-nature',
      'buyer-name', 'buyer-country', 'classification-cpv',
      'total-value', 'total-value-cur', 'publication-date', 'deadline',
      'description-proc', 'description-lot',
    ],
    limit,
    scope: 'ACTIVE',
    paginationMode: 'ITERATION',
    page: 1,
  };

  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`TED EU: HTTP ${res.status}`);
  }
  const data = await res.json();
  const notices = data.notices || data.results || [];

  return notices.map((n) => {
    const pubNumber = n['publication-number'];
    const cpv = n['classification-cpv'];
    const cpvId = Array.isArray(cpv) ? cpv[0] : cpv;
    return {
      id: makeId(pubNumber),
      source: 'ted_eu',
      source_id: pubNumber,
      title: firstLang(n['notice-title']) || '(untitled notice)',
      description: firstLang(n['description-proc']) || firstLang(n['description-lot']) || null,
      buyer: firstLang(n['buyer-name']),
      country: firstOf(n['buyer-country']) || null,
      sector: cpvId || null,
      sector_label: firstOf(n['contract-nature']) || null,
      value_amount: n['total-value'] ?? null,
      value_currency: firstOf(n['total-value-cur']) ?? null,
      published_date: (firstOf(n['publication-date']) || '').slice(0, 10) || null,
      deadline_date: (firstOf(n['deadline']) || '').slice(0, 10) || null,
      url: pubNumber ? `https://ted.europa.eu/en/notice/-/detail/${pubNumber}` : 'https://ted.europa.eu/',
      raw_json: JSON.stringify(n).slice(0, 20000),
    };
  });
}

module.exports = { scrapeTedEU };
