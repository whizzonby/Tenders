// Brazil Compras.gov.br / PNCP — no key required. The old "modulo-legado" endpoint
// (Law 8.666) has been fully superseded — it returns zero results for any 2026 date,
// since Brazil now runs procurement under Law 14.133 via PNCP (modulo-contratacoes).
// That endpoint requires a "codigoModalidade" filter per request; we query only the
// two modalities that represent genuinely competitive open tenders (3 = Concorrência
// Eletrônica, 5 = Pregão Eletrônico) — the others (Dispensa, Inexigibilidade) are
// non-competitive/sole-source awards, not open opportunities to bid on.
// Also: this mirror runs roughly 10 days behind real time, so daysBack needs enough
// slack to reliably catch anything.
// https://dadosabertos.compras.gov.br/swagger-ui/index.html
const fetch = require('node-fetch');
const crypto = require('crypto');

const BASE = 'https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133';
const OPEN_MODALITIES = [3, 5]; // Concorrência Eletrônica, Pregão Eletrônico

function makeId(sourceId) {
  return crypto.createHash('sha1').update('brazil_compras:' + sourceId).digest('hex');
}

async function scrapeBrazilCompras({ daysBack = 21, pageSize = 50 } = {}) {
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const all = [];
  for (const codigoModalidade of OPEN_MODALITIES) {
    const params = new URLSearchParams({
      dataPublicacaoPncpInicial: fmt(from),
      dataPublicacaoPncpFinal: fmt(to),
      codigoModalidade: String(codigoModalidade),
      tamanhoPagina: String(pageSize),
      pagina: '1',
    });
    const res = await fetch(`${BASE}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
    if (!res.ok) {
      throw new Error(`Brazil Compras (modalidade ${codigoModalidade}): HTTP ${res.status}`);
    }
    const data = await res.json();
    all.push(...(data.resultado || []));
  }

  return all.map((r) => ({
    id: makeId(r.numeroControlePNCP),
    source: 'brazil_compras',
    source_id: r.numeroControlePNCP,
    title: r.objetoCompra || '(untitled notice)',
    description: null,
    buyer: r.orgaoEntidadeRazaoSocial || null,
    country: 'Brazil',
    sector: null,
    sector_label: r.modalidadeNome || null,
    value_amount: r.valorTotalEstimado ?? null,
    value_currency: r.valorTotalEstimado ? 'BRL' : null,
    published_date: r.dataPublicacaoPncp ? r.dataPublicacaoPncp.slice(0, 10) : null,
    deadline_date: r.dataEncerramentoPropostaPncp ? r.dataEncerramentoPropostaPncp.slice(0, 10) : null,
    url: `https://pncp.gov.br/app/editais/${r.orgaoEntidadeCnpj}/${r.anoCompraPncp}/${r.sequencialCompraPncp}`,
    raw_json: JSON.stringify(r).slice(0, 20000),
  }));
}

module.exports = { scrapeBrazilCompras };
