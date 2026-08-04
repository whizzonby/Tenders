// UNDP Procurement Notices — public RSS feed, no key required.
// The feed rejects requests with no User-Agent (406), and rss-parser doesn't reliably
// pass a custom UA through parseURL, so we fetch the raw XML ourselves and hand it to
// parseString instead.
// https://procurement-notices.undp.org/rss_feeds/rss.xml
const fetch = require('node-fetch');
const Parser = require('rss-parser');
const crypto = require('crypto');

const FEED_URL = 'https://procurement-notices.undp.org/rss_feeds/rss.xml';

const parser = new Parser({
  customFields: {
    item: [
      ['undpprocnot:deadline', 'undpDeadline'],
      ['undpprocnot:duty_station_cty', 'undpCountry'],
      ['undpprocnot:area_desc', 'undpArea'],
      ['undpprocnot:duty_station', 'undpDutyStation'],
    ],
  },
});

function makeId(sourceId) {
  return crypto.createHash('sha1').update('undp:' + sourceId).digest('hex');
}

async function scrapeUndp() {
  const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`UNDP: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const feed = await parser.parseString(xml);

  return (feed.items || []).map((item) => {
    const sourceId = item.link || item['rdf:about'] || item.title;
    return {
      id: makeId(sourceId),
      source: 'undp',
      source_id: sourceId,
      title: item.title || '(untitled notice)',
      description: null,
      buyer: item.undpDutyStation || 'UNDP',
      country: item.undpCountry || null,
      sector: null,
      sector_label: item.undpArea || null,
      value_amount: null,
      value_currency: null,
      published_date: item.isoDate ? item.isoDate.slice(0, 10) : null,
      deadline_date: item.undpDeadline ? item.undpDeadline.slice(0, 10) : null,
      url: item.link || FEED_URL,
      raw_json: JSON.stringify(item).slice(0, 20000),
    };
  });
}

module.exports = { scrapeUndp };
