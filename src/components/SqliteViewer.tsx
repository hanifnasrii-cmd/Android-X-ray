import { useEffect, useState } from 'react';
import { Database as SqliteDb } from 'sql.js';
import { Download, Play, Table } from 'lucide-react';
import { ApkEntry, SqliteTableSummary } from '../types/xray';
import {
  exportQueryAsCsv,
  inspectSqliteSchema,
  openReadOnlyDatabase,
  runReadOnlyQuery,
} from '../engines/sqliteEngine';
import { downloadBlob } from '../engines/reportExporter';

export function SqliteViewer({ entry }: { entry: ApkEntry }) {
  const [db, setDb] = useState<SqliteDb | null>(null);
  const [tables, setTables] = useState<SqliteTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [sqlInput, setSqlInput] = useState<string>('');
  const [result, setResult] = useState<{ columns: string[]; rows: unknown[][]; error?: string }>({
    columns: [],
    rows: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let openedDb: SqliteDb | null = null;
    setLoading(true);
    setLoadError(null);

    openReadOnlyDatabase(entry.bytes)
      .then((instance) => {
        if (!mounted) {
          instance.close();
          return;
        }
        openedDb = instance;
        setDb(instance);
        const schema = inspectSqliteSchema(instance);
        setTables(schema);
        const firstTable = schema.find((t) => t.type === 'table')?.name || '';
        setSelectedTable(firstTable);
        if (firstTable) {
          const initialQuery = `SELECT * FROM "${firstTable.replace(/"/g, '""')}" LIMIT 100;`;
          setSqlInput(initialQuery);
          setResult(runReadOnlyQuery(instance, initialQuery));
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      mounted = false;
      openedDb?.close();
    };
  }, [entry]);

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    if (!db) return;
    const q = `SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 100;`;
    setSqlInput(q);
    setResult(runReadOnlyQuery(db, q));
  };

  const handleRunQuery = () => {
    if (!db) return;
    setResult(runReadOnlyQuery(db, sqlInput));
  };

  if (loading) {
    return <div className="p-6 text-xs text-[#8E9580]">Initializing WebAssembly SQLite engine (read-only)…</div>;
  }

  if (loadError) {
    return (
      <div className="p-6 text-xs text-rose-400">
        Unable to open SQLite database (may be encrypted with SQLCipher or corrupted): {loadError}
      </div>
    );
  }

  const activeSummary = tables.find((t) => t.name === selectedTable);

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Schema Sidebar */}
      <div className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-black/10 dark:border-white/[0.08] overflow-y-auto p-3 space-y-2 bg-[#ECEFE6] dark:bg-[#191C15]">
        <div className="text-xs font-semibold text-[#5A6050] dark:text-[#9CA38F]">
          Schema Objects ({tables.length})
        </div>
        <div className="space-y-1">
          {tables.map((t) => (
            <button
              key={`${t.type}-${t.name}`}
              type="button"
              onClick={() => (t.type === 'table' || t.type === 'view') && handleSelectTable(t.name)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between gap-2 ${
                selectedTable === t.name
                  ? 'bg-[#465D18]/20 text-[#181A14] dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                  : 'hover:bg-black/5 dark:hover:bg-white/5 text-[#282B22] dark:text-[#D5D8CD]'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <Table className="w-3.5 h-3.5 shrink-0 text-[#9BB848]" />
                <span className="truncate">{t.name}</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums text-[#7A816E] shrink-0">
                {t.type === 'table' ? t.rowCount : t.type}
              </span>
            </button>
          ))}
        </div>

        {activeSummary && activeSummary.columns.length > 0 && (
          <div className="pt-3 border-t border-black/10 dark:border-white/10 space-y-1.5">
            <div className="text-xs font-semibold text-[#5A6050] dark:text-[#9CA38F]">Columns</div>
            {activeSummary.columns.map((c) => (
              <div key={c.cid} className="flex items-center justify-between text-[11px] font-mono">
                <span className="truncate text-[#181A14] dark:text-[#E4E6DD]">
                  {c.pk ? 'PK ' : ''}
                  {c.name}
                </span>
                <span className="text-[#7A816E] shrink-0">{c.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Query & Data Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b border-black/10 dark:border-white/[0.08] flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={sqlInput}
            onChange={(e) => setSqlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunQuery()}
            placeholder="SELECT * FROM table LIMIT 100;"
            className="flex-1 min-w-[200px] px-3 py-1.5 text-xs font-mono rounded-md bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10"
          />
          <button
            type="button"
            onClick={handleRunQuery}
            className="px-3 py-1.5 rounded-md bg-[#465D18] text-white text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" /> Run Read-Only
          </button>
          <button
            type="button"
            disabled={result.columns.length === 0}
            onClick={() =>
              downloadBlob(`${selectedTable || 'query'}.csv`, exportQueryAsCsv(result.columns, result.rows), 'text/csv')
            }
            className="px-2.5 py-1.5 rounded-md border border-black/10 dark:border-white/10 text-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            disabled={result.columns.length === 0}
            onClick={() =>
              downloadBlob(
                `${selectedTable || 'query'}.json`,
                JSON.stringify(
                  result.rows.map((r) => Object.fromEntries(result.columns.map((c, idx) => [c, r[idx]]))),
                  null,
                  2
                ),
                'application/json'
              )
            }
            className="px-2.5 py-1.5 rounded-md border border-black/10 dark:border-white/10 text-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
        </div>

        {result.error ? (
          <div className="p-4 text-xs text-rose-400 font-mono">{result.error}</div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="sticky top-0 bg-[#ECEFE6] dark:bg-[#1E2219] border-b border-black/10 dark:border-white/10">
                <tr>
                  {result.columns.map((col, idx) => (
                    <th key={idx} className="px-3 py-2 font-semibold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/[0.05]">
                {result.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 max-w-[320px] truncate">
                        {cell === null ? <span className="text-[#7A816E] italic">NULL</span> : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
