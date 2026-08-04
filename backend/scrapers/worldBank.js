// World Bank procurement notices — public search API, no key required.
// v2 returns notices ordered by recency by default; the old undocumented v1 endpoint
// used here previously had no sort/date filter and mostly returned decade-old,
// often-cancelled notices with no live detail page.
// https://search.worldbank.org/api/v2/procnotices
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://search.worldbank.org/api/v2/procnotices';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('world_bank:' + sourceId).digest('hex');
}

// API returns dates as "02-Aug-2026" rather than ISO.
function parseNoticeDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function scrapeWorldBank({ rows = 200 } = {}) {
  const params = new URLSearchParams({
    format: 'json',
    rows: String(rows),
    os: '0',
  });
  const res = await fetch(`${BASE}?${params.toString()}`, { headers: { Accept: 'application/json' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`World Bank: HTTP ${res.status}`);
  }
  const data = await res.json();
  const docs = Array.isArray(data.procnotices) ? data.procnotices : (data.docs || []);

  return docs.map((n) => {
    const id = n.id;
    return {
      id: makeId(id),
      source: 'world_bank',
      source_id: id,
      title: n.bid_description || n.project_name || '(untitled notice)',
      description: n.notice_text ? n.notice_text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null,
      buyer: n.contact_organization || n.project_name || 'World Bank financed project',
      country: n.project_ctry_name || n.contact_ctry_name || null,
      sector: n.procurement_group || null,
      sector_label: n.procurement_method_name || null,
      value_amount: null,
      value_currency: null,
      published_date: parseNoticeDate(n.noticedate),
      deadline_date: n.submission_deadline_date ? String(n.submission_deadline_date).slice(0, 10) : null,
      url: id ? `https://projects.worldbank.org/en/projects-operations/procurement-detail/${id}` : 'https://projects.worldbank.org/en/projects-operations/procurement',
      raw_json: JSON.stringify(n).slice(0, 20000),
    };
  });
}

module.exports = { scrapeWorldBank };
