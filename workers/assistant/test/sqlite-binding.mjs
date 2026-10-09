// Test-only adapter: executes the production SQL against real SQLite. This is
// not Cloudflare D1/workerd evidence. Separate threads use separate connections.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function sqliteBinding(path = ':memory:', migrate = true) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA busy_timeout=10000');
  if (path !== ':memory:') sqlite.exec('PRAGMA journal_mode=WAL');
  if (migrate) sqlite.exec(readFileSync(new URL('../migrations/0001_quotas.sql', import.meta.url), 'utf8'));
  const execute = statement => {
    const rows = sqlite.prepare(statement.sql).all(...statement.args);
    return { success: true, results: rows };
  };
  const db = {
    prepare(sql) {
      return { bind(...args) { return { sql, args,
        async run() { return execute({ sql, args }); }, async all() { return execute({ sql, args }); } }; } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(execute); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, sqlite, close: () => sqlite.close() };
}
