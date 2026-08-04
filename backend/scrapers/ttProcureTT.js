// Trinidad and Tobago — ProcureTT (Office of Procurement Regulation). No public API;
// the OPR's own site (oprtt.org) has no tender data at all — the actual national
// tender repository lives at procurett.oprtt.org, a WordPress/GravityView site with
// a server-rendered results table (no JS needed). Verified: no ToS restriction,
// robots.txt permits this path.
// https://procurett.oprtt.org/tenders/
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const crypto = require('crypto');

const URL = 'https://procurett.oprtt.org/tenders/';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('tt_procurett:' + sourceId).digest('hex');
}

// Site renders dates as DD/MM/YYYY.
function parseDate(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((str || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function scrapeTtProcureTT() {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`T&T ProcureTT: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = [];

  $('table.gv-table-view tbody tr').each((_, el) => {
    const row = $(el);
    const buyer = row.find('td[data-label="Public Body"]').first().text().trim() || null;
    const refLink = row.find('td[data-label="Tender Reference No."] a').first();
    const reference = refLink.text().trim();
    const entryUrl = refLink.attr('href');
    if (!reference || !entryUrl) return;

    const status = row.find('td[data-label="Status"]').first().text().trim() || null;
    const deadline = parseDate(row.find('td[data-label="Submission Deadline Date"]').first().text());
    const description = row.find('td[data-label="Description"] p').first().text().trim()
      || row.find('td[data-label="Description"]').first().text().trim();
    const linesOfBusiness = row.find('td[data-label="Lines of Business (Level 3)"] li')
      .map((__, li) => $(li).text().trim()).get().join('; ') || null;

    rows.push({
      id: makeId(reference),
      source: 'tt_procurett',
      source_id: reference,
      title: description || reference,
      description: null,
      buyer,
      country: 'Trinidad and Tobago',
      sector: null,
      sector_label: [status, linesOfBusiness].filter(Boolean).join(' — ') || null,
      value_amount: null,
      value_currency: null,
      published_date: null,
      deadline_date: deadline,
      url: entryUrl,
      raw_json: JSON.stringify({ buyer, reference, status, deadline, description, linesOfBusiness }).slice(0, 20000),
    });
  });

  return rows;
}

module.exports = { scrapeTtProcureTT };
