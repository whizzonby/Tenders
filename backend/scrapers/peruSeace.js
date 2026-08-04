// Peru SEACE (via OECE's "Contrataciones Abiertas" OCDS portal) — public monthly
// bulk ZIP files, no key required. The documented "contratacionesabiertas.osce.gob.pe"
// domain is dead (OSCE renamed to OECE); URL format requires a zero-padded month and
// a trailing slash (".../json/2026/07/", not ".../json/2026/7").
// https://contratacionesabiertas.oece.gob.pe/api/v1/files
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

const FILES_URL = 'https://contratacionesabiertas.oece.gob.pe/api/v1/files?source=seace_v3&page=1';
const SEACE_HOME = 'https://prod1.seace.gob.pe/';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('peru_seace:' + sourceId).digest('hex');
}

async function fetchWithTimeout(url, ms = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function scrapePeruSeace() {
  const listRes = await fetchWithTimeout(FILES_URL);
  if (!listRes.ok) {
    throw new Error(`Peru SEACE files list: HTTP ${listRes.status}`);
  }
  const listData = await listRes.json();
  const latest = (listData.results || [])[0];
  if (!latest || !latest.files || !latest.files.json) return [];

  const zipRes = await fetchWithTimeout(latest.files.json);
  if (!zipRes.ok) {
    throw new Error(`Peru SEACE data file: HTTP ${zipRes.status}`);
  }
  const buf = Buffer.from(await zipRes.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith('.json'));
  if (!entry) return [];
  const content = JSON.parse(zip.readAsText(entry));
  const records = content.records || [];

  const rows = [];
  for (const record of records) {
    const release = record.compiledRelease;
    const tender = release && release.tender;
    if (!tender || !tender.title) continue;
    const doc = (tender.documents && tender.documents[0]) || {};

    rows.push({
      id: makeId(release.ocid),
      source: 'peru_seace',
      source_id: release.ocid,
      title: tender.description || tender.title,
      description: null,
      buyer: (tender.procuringEntity && tender.procuringEntity.name) || null,
      country: 'Peru',
      sector: null,
      sector_label: tender.procurementMethodDetails || null,
      value_amount: (tender.value && tender.value.amount) || null,
      value_currency: (tender.value && tender.value.currency) || null,
      published_date: tender.datePublished ? tender.datePublished.slice(0, 10) : null,
      deadline_date: (tender.enquiryPeriod && tender.enquiryPeriod.endDate) ? tender.enquiryPeriod.endDate.slice(0, 10) : null,
      url: doc.url || SEACE_HOME,
      raw_json: JSON.stringify(record).slice(0, 20000),
    });
  }
  return rows;
}

module.exports = { scrapePeruSeace };
