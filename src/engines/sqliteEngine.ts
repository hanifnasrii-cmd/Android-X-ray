import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { SqliteTableSummary } from '../types/xray';

let sqlPromise: Promise<SqlJsStatic> | null = null;

export async function getSqlEngine(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const isBrowser = typeof window !== 'undefined';
    sqlPromise = initSqlJs({
      locateFile: (file: string) =>
        isBrowser ? `/${file}` : `node_modules/sql.js/dist/${file}`,
    });
  }
  return sqlPromise;
}

export async function openReadOnlyDatabase(bytes: Uint8Array): Promise<Database> {
  const SQL = await getSqlEngine();
  return new SQL.Database(bytes);
}

export function inspectSqliteSchema(db: Database): SqliteTableSummary[] {
  const masterRes = db.exec(
    `SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;`
  );
  if (!masterRes.length) return [];

  const rows = masterRes[0].values;
  const summaries: SqliteTableSummary[] = [];

  for (const row of rows) {
    const name = String(row[0] ?? '');
    const type = String(row[1] ?? 'table') as SqliteTableSummary['type'];
    const sql = String(row[2] ?? '');

    let rowCount = 0;
    const columns: SqliteTableSummary['columns'] = [];

    if (type === 'table' || type === 'view') {
      try {
        const escaped = name.replace(/"/g, '""');
        const cntRes = db.exec(`SELECT COUNT(*) FROM "${escaped}";`);
        if (cntRes[0]?.values[0]?.[0] !== undefined) {
          rowCount = Number(cntRes[0].values[0][0]);
        }
        const infoRes = db.exec(`PRAGMA table_info("${escaped}");`);
        if (infoRes[0]) {
          for (const colRow of infoRes[0].values) {
            columns.push({
              cid: Number(colRow[0]),
              name: String(colRow[1]),
              type: String(colRow[2] || 'ANY'),
              notnull: Number(colRow[3]) === 1,
              pk: Number(colRow[5]) > 0,
            });
          }
        }
      } catch {
        // Ignore locked/virtual tables
      }
    }

    summaries.push({ name, type, sql, rowCount, columns });
  }

  return summaries;
}

export function runReadOnlyQuery(
  db: Database,
  sql: string
): { columns: string[]; rows: unknown[][]; error?: string } {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('PRAGMA') && !upper.startsWith('EXPLAIN')) {
    return {
      columns: [],
      rows: [],
      error: 'Read-only inspection mode: only SELECT, PRAGMA, and EXPLAIN statements are permitted.',
    };
  }
  try {
    const res = db.exec(trimmed);
    if (!res.length) return { columns: [], rows: [] };
    return {
      columns: res[0].columns,
      rows: res[0].values,
    };
  } catch (err) {
    return {
      columns: [],
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function exportQueryAsCsv(columns: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}
