const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'contracts.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,           -- stable hash: source + source_id
  source TEXT NOT NULL,          -- e.g. 'uk_contracts_finder', 'sam_gov', 'ted_eu', 'rss:<feedname>'
  source_id TEXT,                -- id/reference from the source system
  title TEXT NOT NULL,
  description TEXT,
  buyer TEXT,                    -- issuing organization
  country TEXT,
  sector TEXT,                   -- CPV code / category / classification code
  sector_label TEXT,
  value_amount REAL,
  value_currency TEXT,
  published_date TEXT,           -- ISO date
  deadline_date TEXT,            -- ISO date, closing date to apply
  url TEXT NOT NULL,             -- link to apply / view full notice
  raw_json TEXT,                 -- original payload for debugging
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contracts_deadline ON contracts(deadline_date);
CREATE INDEX IF NOT EXISTS idx_contracts_country ON contracts(country);
CREATE INDEX IF NOT EXISTS idx_contracts_source ON contracts(source);
CREATE INDEX IF NOT EXISTS idx_contracts_published ON contracts(published_date);

CREATE VIRTUAL TABLE IF NOT EXISTS contracts_fts USING fts5(
  id UNINDEXED, title, description, buyer, content='contracts', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS contracts_ai AFTER INSERT ON contracts BEGIN
  INSERT INTO contracts_fts(rowid, id, title, description, buyer)
  VALUES (new.rowid, new.id, new.title, new.description, new.buyer);
END;

CREATE TRIGGER IF NOT EXISTS contracts_ad AFTER DELETE ON contracts BEGIN
  INSERT INTO contracts_fts(contracts_fts, rowid, id, title, description, buyer)
  VALUES('delete', old.rowid, old.id, old.title, old.description, old.buyer);
END;

CREATE TRIGGER IF NOT EXISTS contracts_au AFTER UPDATE ON contracts BEGIN
  INSERT INTO contracts_fts(contracts_fts, rowid, id, title, description, buyer)
  VALUES('delete', old.rowid, old.id, old.title, old.description, old.buyer);
  INSERT INTO contracts_fts(rowid, id, title, description, buyer)
  VALUES (new.rowid, new.id, new.title, new.description, new.buyer);
END;
`);

const upsertStmt = db.prepare(`
INSERT INTO contracts (id, source, source_id, title, description, buyer, country, sector, sector_label,
  value_amount, value_currency, published_date, deadline_date, url, raw_json, last_seen_at)
VALUES (@id, @source, @source_id, @title, @description, @buyer, @country, @sector, @sector_label,
  @value_amount, @value_currency, @published_date, @deadline_date, @url, @raw_json, datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, description=excluded.description, buyer=excluded.buyer, country=excluded.country,
  sector=excluded.sector, sector_label=excluded.sector_label, value_amount=excluded.value_amount,
  value_currency=excluded.value_currency, published_date=excluded.published_date,
  deadline_date=excluded.deadline_date, url=excluded.url, raw_json=excluded.raw_json,
  last_seen_at=datetime('now');
`);

function upsertContracts(rows) {
  const tx = db.transaction((items) => {
    for (const item of items) upsertStmt.run(item);
  });
  tx(rows);
}

module.exports = { db, upsertContracts };
