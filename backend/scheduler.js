require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { upsertContracts } = require('./db');
const { scrapeContractsFinderUK } = require('./scrapers/contractsFinderUK');
const { scrapeTedEU } = require('./scrapers/tedEU');
const { scrapeSamGov } = require('./scrapers/samGov');
const { scrapeWorldBank } = require('./scrapers/worldBank');
const { scrapeAuTender } = require('./scrapers/auTender');
const { scrapeUkFindTender } = require('./scrapers/ukFindTender');
const { scrapeUndp } = require('./scrapers/undp');
const { scrapeCdb } = require('./scrapers/cdb');
const { scrapeGuyanaEprocure } = require('./scrapers/guyanaEprocure');
const { scrapeTtProcureTT } = require('./scrapers/ttProcureTT');
const { scrapeColombiaSecop } = require('./scrapers/colombiaSecop');
const { scrapeBrazilCompras } = require('./scrapers/brazilCompras');
const { scrapeDominicanRepublic } = require('./scrapers/dominicanRepublic');
const { scrapeSouthAfricaEtenders } = require('./scrapers/southAfricaEtenders');
const { scrapeKenyaPpip } = require('./scrapers/kenyaPpip');
const { scrapeGhanaGhaneps } = require('./scrapers/ghanaGhaneps');
const { scrapePeruSeace } = require('./scrapers/peruSeace');
const { scrapeGenericRSS } = require('./scrapers/genericRSS');

function loadFeedsConfig() {
  const p = path.join(__dirname, 'feeds.config.json');
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.warn('feeds.config.json is invalid JSON, skipping RSS sources:', err.message);
    return [];
  }
}

async function runAllScrapers() {
  const started = Date.now();
  console.log(`[scheduler] run started ${new Date().toISOString()}`);

  const jobs = [
    { name: 'uk_contracts_finder', fn: () => scrapeContractsFinderUK({ daysBack: 14 }) },
    { name: 'ted_eu', fn: () => scrapeTedEU({ daysBack: 14 }) },
    { name: 'sam_gov', fn: () => scrapeSamGov({ daysBack: 7 }) },
    { name: 'world_bank', fn: () => scrapeWorldBank({ rows: 200 }) },
    { name: 'au_tender', fn: () => scrapeAuTender({ daysBack: 14 }) },
    { name: 'uk_find_tender', fn: () => scrapeUkFindTender({ daysBack: 7 }) },
    { name: 'undp', fn: () => scrapeUndp() },
    { name: 'cdb', fn: () => scrapeCdb() },
    { name: 'guyana_eprocure', fn: () => scrapeGuyanaEprocure() },
    { name: 'tt_procurett', fn: () => scrapeTtProcureTT() },
    { name: 'colombia_secop', fn: () => scrapeColombiaSecop({ limit: 100 }) },
    { name: 'brazil_compras', fn: () => scrapeBrazilCompras({ daysBack: 21 }) },
    { name: 'dominican_republic', fn: () => scrapeDominicanRepublic({ daysBack: 75 }) },
    { name: 'south_africa_etenders', fn: () => scrapeSouthAfricaEtenders({ daysBack: 14 }) },
    { name: 'kenya_ppip', fn: () => scrapeKenyaPpip({ daysBack: 14 }) },
    { name: 'ghana_ghaneps', fn: () => scrapeGhanaGhaneps() },
    { name: 'peru_seace', fn: () => scrapePeruSeace() },
    { name: 'rss_feeds', fn: () => scrapeGenericRSS(loadFeedsConfig()) },
  ];

  let totalUpserted = 0;
  for (const job of jobs) {
    try {
      const rows = await job.fn();
      if (rows.length) upsertContracts(rows);
      totalUpserted += rows.length;
      console.log(`[scheduler] ${job.name}: ${rows.length} notices`);
    } catch (err) {
      console.error(`[scheduler] ${job.name} FAILED: ${err.message}`);
    }
  }

  console.log(`[scheduler] run finished in ${((Date.now() - started) / 1000).toFixed(1)}s, ${totalUpserted} notices processed`);
}

function startScheduler() {
  // Every 6 hours by default. Override with CRON_SCHEDULE env var (standard cron syntax).
  const schedule = process.env.CRON_SCHEDULE || '0 */6 * * *';
  console.log(`[scheduler] scheduled with cron "${schedule}"`);
  cron.schedule(schedule, runAllScrapers);
}

if (require.main === module) {
  // Allows `node scheduler.js --once` for a manual one-off run (used by `npm run scrape`)
  if (process.argv.includes('--once')) {
    runAllScrapers().then(() => process.exit(0));
  } else {
    runAllScrapers();
    startScheduler();
    // keep process alive
    setInterval(() => {}, 1 << 30);
  }
}

module.exports = { runAllScrapers, startScheduler };
