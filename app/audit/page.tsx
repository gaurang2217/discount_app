"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  id: number;
  change_type: string;
  manufacture_name: string;
  item_id: string | null;
  item_name: string | null;
  old_rate_pct: number | null;
  new_rate_pct: number | null;
  old_effective_from: string | null;
  new_effective_from: string | null;
  changed_at: string;
}

function fmt(n: number | null) {
  if (n === null) return "—";
  return `${n}%`;
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function AuditPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/audit")
      .then(r => r.json())
      .then(d => { setLogs(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  const filtered = logs.filter(l =>
    !search ||
    l.manufacture_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.item_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Rate Change Audit Log</h1>
        <input
          type="text"
          placeholder="Search manufacturer or item..."
          className="border rounded px-3 py-2 text-sm w-72"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No rate changes recorded yet.</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Date & Time</th>
                <th className="px-4 py-3 text-left">Manufacturer</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-right">Old Rate</th>
                <th className="px-4 py-3 text-right">New Rate</th>
                <th className="px-4 py-3 text-center">Effective From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(log => {
                const increased = log.new_rate_pct !== null && (log.old_rate_pct ?? 0) < log.new_rate_pct;
                const decreased = log.new_rate_pct !== null && (log.old_rate_pct ?? 0) > log.new_rate_pct;
                const isNew = log.old_rate_pct === null;
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(log.changed_at)}</td>
                    <td className="px-4 py-3 font-medium">
                      <a href={`/manufacturers/${encodeURIComponent(log.manufacture_name)}`}
                        className="text-blue-600 hover:underline">
                        {log.manufacture_name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.item_name ?? <span className="text-gray-400 italic">Company-wide</span>}
                      {log.item_id && <div className="text-xs text-gray-400">{log.item_id}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {log.change_type === 'company_rate'
                        ? <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">Company</span>
                        : <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Item</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{fmt(log.old_rate_pct)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={isNew ? "text-green-600" : increased ? "text-green-600" : decreased ? "text-red-600" : "text-gray-700"}>
                        {fmt(log.new_rate_pct)}
                        {isNew && <span className="ml-1 text-xs font-normal">(new)</span>}
                        {increased && !isNew && <span className="ml-1 text-xs">↑</span>}
                        {decreased && <span className="ml-1 text-xs">↓</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      {log.new_effective_from ?? "—"}
                      {log.old_effective_from && log.old_effective_from !== log.new_effective_from && (
                        <div className="text-gray-400 line-through">{log.old_effective_from}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
