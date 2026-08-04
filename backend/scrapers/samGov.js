// US SAM.gov — Get Opportunities Public API. Requires a FREE API key.
// Get one at https://sam.gov (Account Details > Request API Key). Non-federal accounts get
// ~10 requests/day, which is plenty for a daily sync of a manageable date window.
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://api.sam.gov/opportunities/v2/search';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('sam_gov:' + sourceId).digest('hex');
}

function mmddyyyy(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

async function scrapeSamGov({ daysBack = 7, limit = 100 } = {}) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    console.warn('[sam_gov] SAM_GOV_API_KEY not set — skipping this source. Get a free key at https://sam.gov');
    return [];
  }

  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: mmddyyyy(from),
    postedTo: mmddyyyy(to),
    ptype: 'o', // solicitations (open opportunities)
    limit: String(limit),
  });

  const res = await fetch(`${BASE}?${params.toString()}`, { headers: { Accept: 'application/json' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`SAM.gov: HTTP ${res.status}`);
  }
  const data = await res.json();
  const items = data.opportunitiesData || [];

  return items.map((n) => ({
    id: makeId(n.noticeId),
    source: 'sam_gov',
    source_id: n.noticeId,
    title: n.title || '(untitled notice)',
    description: null, // full description requires a second authenticated call per notice
    buyer: n.fullParentPathName || n.department || null,
    country: 'United States',
    sector: n.naicsCode || null,
    sector_label: n.classificationCode || null,
    value_amount: null,
    value_currency: 'USD',
    published_date: n.postedDate || null,
    deadline_date: n.responseDeadLine ? n.responseDeadLine.slice(0, 10) : null,
    url: n.uiLink || `https://sam.gov/opp/${n.noticeId}/view`,
    raw_json: JSON.stringify(n).slice(0, 20000),
  }));
}

module.exports = { scrapeSamGov };
