const express = require('express');
const { db } = require('../db');
const router = express.Router();

// GET /api/contracts?keyword=&country=&source=&sector=&minValue=&maxValue=&deadlineBefore=&deadlineAfter=&page=1&pageSize=25&sort=deadline_asc
router.get('/', (req, res) => {
  const {
    keyword, country, source, sector,
    minValue, maxValue, deadlineBefore, deadlineAfter, publishedAfter,
    page = '1', pageSize = '25', sort = 'published_desc',
  } = req.query;

  const where = [];
  const params = {};

  let baseTable = 'contracts';
  let joinFts = '';
  if (keyword && keyword.trim()) {
    joinFts = 'JOIN contracts_fts ON contracts_fts.rowid = contracts.rowid';
    where.push('contracts_fts MATCH @keyword');
    params.keyword = keyword.trim().split(/\s+/).map((w) => `${w}*`).join(' ');
  }
  if (country) { where.push('country = @country'); params.country = country; }
  if (source) { where.push('source = @source'); params.source = source; }
  if (sector) { where.push('(sector = @sector OR sector_label LIKE @sectorLike)'); params.sector = sector; params.sectorLike = `%${sector}%`; }
  if (minValue) { where.push('value_amount >= @minValue'); params.minValue = Number(minValue); }
  if (maxValue) { where.push('value_amount <= @maxValue'); params.maxValue = Number(maxValue); }
  if (deadlineBefore) { where.push('deadline_date <= @deadlineBefore'); params.deadlineBefore = deadlineBefore; }
  if (deadlineAfter) { where.push('deadline_date >= @deadlineAfter'); params.deadlineAfter = deadlineAfter; }
  if (publishedAfter) { where.push('published_date >= @publishedAfter'); params.publishedAfter = publishedAfter; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortMap = {
    published_desc: 'published_date DESC',
    published_asc: 'published_date ASC',
    deadline_asc: 'deadline_date ASC',
    deadline_desc: 'deadline_date DESC',
    value_desc: 'value_amount DESC',
    value_asc: 'value_amount ASC',
  };
  const orderSql = sortMap[sort] || sortMap.published_desc;

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const sql = `
    SELECT contracts.* FROM ${baseTable}
    ${joinFts}
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT @limit OFFSET @offset
  `;
  const countSql = `SELECT COUNT(*) as total FROM ${baseTable} ${joinFts} ${whereSql}`;

  try {
    const rows = db.prepare(sql).all({ ...params, limit, offset });
    const { total } = db.prepare(countSql).get(params);
    res.json({ results: rows, total, page: Number(page), pageSize: limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Query failed', detail: err.message });
  }
});

// GET /api/contracts/facets — distinct values for filter dropdowns
router.get('/facets', (req, res) => {
  const countries = db.prepare(`SELECT country, COUNT(*) c FROM contracts WHERE country IS NOT NULL GROUP BY country ORDER BY c DESC LIMIT 100`).all();
  const sources = db.prepare(`SELECT source, COUNT(*) c FROM contracts GROUP BY source ORDER BY c DESC`).all();
  const sectors = db.prepare(`SELECT sector_label, COUNT(*) c FROM contracts WHERE sector_label IS NOT NULL GROUP BY sector_label ORDER BY c DESC LIMIT 100`).all();
  res.json({ countries, sources, sectors });
});

// GET /api/contracts/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

module.exports = router;
