// Ghana GHANEPS — public OCDS record packages, no key required. Published as a
// zipped JSON file per month; the per-tender detail page requires a buyer login
// (redirects to the portal homepage), so notices link to the general portal instead.
// https://www.ghaneps.gov.gh/ocds/services/recordpackage/getrecordpackagelist
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

const LIST_URL = 'https://www.ghaneps.gov.gh/ocds/services/recordpackage/getrecordpackagelist';
const PORTAL_URL = 'https://www.ghaneps.gov.gh/epps/home.do';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('ghana_ghaneps:' + sourceId).digest('hex');
}

async function fetchWithTimeout(url, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeGhanaGhaneps() {
  const listRes = await fetchWithTimeout(LIST_URL);
  if (!listRes.ok) {
    throw new Error(`Ghana GHANEPS list: HTTP ${listRes.status}`);
  }
  const listData = await listRes.json();
  const urls = (listData.packagesPerMonth || []).slice(-1); // most recent month only
  if (!urls.length) return [];

  const zipRes = await fetchWithTimeout(urls[0]);
  if (!zipRes.ok) {
    throw new Error(`Ghana GHANEPS package: HTTP ${zipRes.status}`);
  }
  const buf = Buffer.from(await zipRes.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith('.json'));
  if (!entry) return [];
  const content = JSON.parse(zip.readAsText(entry));
  const records = content.records || [];

  const rows = [];
  for (const record of records) {
    const release = (record.releases && record.releases[0]) || {};
    const tender = release.tender;
    if (!tender || !tender.title) continue;
    const item = (tender.items && tender.items[0]) || {};

    rows.push({
      id: makeId(record.ocid),
      source: 'ghana_ghaneps',
      source_id: record.ocid,
      title: tender.title,
      description: tender.description && tender.description !== tender.title ? tender.description : null,
      buyer: (tender.procuringEntity && tender.procuringEntity.name) || null,
      country: 'Ghana',
      sector: (item.classification && item.classification.id) || null,
      sector_label: tender.procurementMethodDetails || null,
      value_amount: (tender.value && tender.value.amount) ?? null,
      value_currency: (tender.value && tender.value.currency) || null,
      published_date: release.date ? release.date.slice(0, 10) : null,
      deadline_date: (tender.tenderPeriod && tender.tenderPeriod.endDate) ? tender.tenderPeriod.endDate.slice(0, 10) : null,
      url: PORTAL_URL,
      raw_json: JSON.stringify(record).slice(0, 20000),
    });
  }
  return rows;
}

module.exports = { scrapeGhanaGhaneps };
