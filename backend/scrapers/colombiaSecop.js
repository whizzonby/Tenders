// Colombia SECOP II — no API on the procurement site itself, but Colombia Compra
// Eficiente publishes it on the national Socrata open-data portal, no key required.
// Note: sorting by publish date DESC surfaces NULLs first by default, so an explicit
// "IS NOT NULL" filter is required to get real, recent records.
// https://www.datos.gov.co/resource/p6dx-8zbt.json
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://www.datos.gov.co/resource/p6dx-8zbt.json';

function makeId(sourceId) {
  return crypto.createHash('sha1').update('colombia_secop:' + sourceId).digest('hex');
}

async function scrapeColombiaSecop({ limit = 100 } = {}) {
  const params = new URLSearchParams({
    $where: "fecha_de_publicacion_del IS NOT NULL AND estado_de_apertura_del_proceso = 'Abierto'",
    $order: 'fecha_de_publicacion_del DESC',
    $limit: String(limit),
  });

  const res = await fetch(`${BASE}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  if (!res.ok) {
    throw new Error(`Colombia SECOP: HTTP ${res.status}`);
  }
  const rows = await res.json();

  return rows.map((r) => ({
    id: makeId(r.id_del_proceso),
    source: 'colombia_secop',
    source_id: r.id_del_proceso,
    title: r.descripci_n_del_procedimiento || r.nombre_del_procedimiento || '(untitled notice)',
    description: null,
    buyer: r.entidad || null,
    country: 'Colombia',
    sector: r.codigo_principal_de_categoria || null,
    sector_label: r.modalidad_de_contratacion || null,
    value_amount: r.precio_base ? Number(r.precio_base) : null,
    value_currency: r.precio_base ? 'COP' : null,
    published_date: r.fecha_de_publicacion_del ? r.fecha_de_publicacion_del.slice(0, 10) : null,
    deadline_date: null,
    url: (r.urlproceso && r.urlproceso.url) || 'https://www.colombiacompra.gov.co/secop',
    raw_json: JSON.stringify(r).slice(0, 20000),
  }));
}

module.exports = { scrapeColombiaSecop };
