// Generic RSS/Atom scraper — add ANY tender/procurement portal that publishes a feed.
// Many national procurement portals (e.g. Canada's CanadaBuys, Australia's AusTender,
// state-level US portals, industry RFP boards) publish RSS/Atom feeds. Add them to
// backend/feeds.config.json (see feeds.config.example.json) — no code changes needed.
const Parser = require('rss-parser');
const crypto = require('crypto');
const parser = new Parser({ timeout: 15000 });

function makeId(feedName, sourceId) {
  return crypto.createHash('sha1').update(`rss:${feedName}:` + sourceId).digest('hex');
}

// feeds: [{ name, url, country, sector_label }]
async function scrapeGenericRSS(feeds = []) {
  const all = [];
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items || []) {
        const sourceId = item.guid || item.link || item.title;
        all.push({
          id: makeId(feed.name, sourceId),
          source: `rss:${feed.name}`,
          source_id: sourceId,
          title: item.title || '(untitled notice)',
          description: item.contentSnippet || item.content || null,
          buyer: feed.buyer || feed.name,
          country: feed.country || null,
          sector: null,
          sector_label: feed.sector_label || null,
          value_amount: null,
          value_currency: null,
          published_date: item.isoDate ? item.isoDate.slice(0, 10) : null,
          deadline_date: null,
          url: item.link || feed.url,
          raw_json: JSON.stringify(item).slice(0, 20000),
        });
      }
    } catch (err) {
      console.warn(`[rss:${feed.name}] failed: ${err.message}`);
    }
  }
  return all;
}

module.exports = { scrapeGenericRSS };
