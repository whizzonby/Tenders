// Caribbean Development Bank — no public API/RSS exists, so this parses the public
// procurement notices page directly. Verified against the live page: server-rendered
// Drupal Views table (no JS required), no ToS restriction on automated access, and
// robots.txt permits this path.
// https://www.caribank.org/work-with-us/procurement/procurement-notices
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const crypto = require('crypto');

const URL = 'https://www.caribank.org/work-with-us/procurement/procurement-notices';
const ORIGIN = 'https://www.caribank.org';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('cdb:' + sourceId).digest('hex');
}

async function scrapeCdb() {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LedgerTenderBot/1.0)' } });
  if (!res.ok) {
    throw new Error(`CDB: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = [];

  $('table.table-hover tbody tr').each((_, el) => {
    const row = $(el);
    const titleLink = row.find('td.views-field-field-cdb-role-service a').first();
    const title = titleLink.text().trim();
    const href = titleLink.attr('href');
    if (!title || !href) return;

    const url = href.startsWith('http') ? href : `${ORIGIN}${href}`;
    const country = row.find('td.views-field-field-cdb-country-tag span').first().text().trim() || null;
    const sector = row.find('td.views-field-field-sector-tag span').first().text().trim() || null;
    const type = row.find('td.views-field-field-cdb-contract-awards-type span').first().text().trim() || null;
    const deadlineAttr = row.find('td.views-field-field-date-of-approval time').attr('datetime');

    rows.push({
      id: makeId(url),
      source: 'cdb',
      source_id: url,
      title,
      description: null,
      buyer: 'Caribbean Development Bank',
      country,
      sector: null,
      sector_label: [type, sector].filter(Boolean).join(' — ') || null,
      value_amount: null,
      value_currency: null,
      published_date: null,
      deadline_date: deadlineAttr ? deadlineAttr.slice(0, 10) : null,
      url,
      raw_json: JSON.stringify({ title, country, sector, type, deadlineAttr }).slice(0, 20000),
    });
  });

  return rows;
}

module.exports = { scrapeCdb };
