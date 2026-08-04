// CARICOM Secretariat procurement notices — https://caricom.org/procurement-notices/
//
// CARICOM has no public JSON API or RSS feed for this page, so this scraper
// parses the notices table directly.
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const crypto = require('crypto');

const NOTICES_URL = 'https://caricom.org/procurement-notices/';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('caricom:' + sourceId).digest('hex');
}

// "July 20, 2026" -> "2026-07-20". Returns null if unparseable.
function parseHumanDate(str) {
  if (!str) return null;
  const cleaned = str.trim();
  if (!cleaned) return null;
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function scrapeCaricom({ url = NOTICES_URL } = {}) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 (compatible; ContractTrackerBot/1.0)',
    },
    timeout: 20000,
  });
  if (!res.ok) {
    throw new Error(`CARICOM: HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = [];

  // Scan every table row rather than relying on WordPress theme class names.
  $('table tr').each((_, el) => {
    const cells = $(el).find('td');
    if (cells.length < 2) return;

    const titleCell = cells.eq(0);
    const link = titleCell.find('a').first();
    const title = link.text().trim() || titleCell.text().trim();
    const href = link.attr('href');
    if (!title || !href) return;

    const cellTexts = cells.toArray().map((cell) => $(cell).text().trim());
    let published = null;
    let closing = null;
    for (let i = 1; i < cellTexts.length; i += 1) {
      const parsed = parseHumanDate(cellTexts[i]);
      if (parsed && !published) published = parsed;
      else if (parsed && !closing) closing = parsed;
    }

    const absoluteUrl = href.startsWith('http') ? href : new URL(href, url).toString();
    rows.push({
      id: makeId(absoluteUrl),
      source: 'caricom',
      source_id: absoluteUrl,
      title,
      description: null,
      buyer: 'CARICOM Secretariat',
      country: 'Caribbean Community (CARICOM)',
      sector: null,
      sector_label: null,
      value_amount: null,
      value_currency: null,
      published_date: published,
      deadline_date: closing,
      url: absoluteUrl,
      raw_json: JSON.stringify({ title, href, cellTexts }).slice(0, 20000),
    });
  });

  return rows;
}

module.exports = { scrapeCaricom };
