"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Suggestion {
  legacy_name: string;
  suggested_name: string;
  confidence: 'exact' | 'high' | 'low' | 'none';
  record_count: number;
  first_date: string;
  last_date: string;
}

interface Discrepancy {
  id: number;
  upload_batch: string;
  item_id: string;
  item_name: string;
  grn_no: string;
  grn_date: string;
  uploaded_manufacture_name: string;
  existing_manufacture_name: string;
  status: string;
  resolved_to: string | null;
  created_at: string;
}

const CONF_LABEL: Record<string, { label: string; color: string }> = {
  exact:  { label: 'Exact match',    color: 'bg-green-100 text-green-700' },
  high:   { label: 'High confidence', color: 'bg-blue-100 text-blue-700' },
  low:    { label: 'Low confidence',  color: 'bg-yellow-100 text-yellow-700' },
  none:   { label: 'No match',        color: 'bg-gray-100 text-gray-500' },
};

export default function MergePage() {
  const [tab, setTab] = useState<'legacy' | 'discrepancies'>('legacy');

  // Legacy merge state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [newNames, setNewNames] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ records_updated: number } | null>(null);
  const [filter, setFilter] = useState<'all' | 'action_needed' | 'exact'>('action_needed');

  // Discrepancy state
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [discLoading, setDiscLoading] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const [discFilter, setDiscFilter] = useState<'pending' | 'resolved' | 'all'>('pending');

  const loadLegacy = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/manufacturer-merge');
    const d = await res.json();
    setSuggestions(d.suggestions || []);
    setNewNames(d.new_names || []);
    const m: Record<string, string> = {};
    for (const s of d.suggestions || []) {
      m[s.legacy_name] = s.suggested_name || '';
    }
    setMappings(m);
    setLoading(false);
  }, []);

  const loadDiscrepancies = useCallback(async () => {
    setDiscLoading(true);
    const res = await fetch('/api/upload-discrepancies');
    const d = await res.json();
    setDiscrepancies(d.discrepancies || []);
    setDiscLoading(false);
  }, []);

  useEffect(() => { loadLegacy(); loadDiscrepancies(); }, [loadLegacy, loadDiscrepancies]);

  const filtered = suggestions.filter(s => {
    if (filter === 'exact') return s.confidence === 'exact';
    if (filter === 'action_needed') return s.confidence !== 'exact';
    return true;
  });

  const exactCount = suggestions.filter(s => s.confidence === 'exact').length;
  const actionCount = suggestions.filter(s => s.confidence !== 'exact').length;
  const mappedCount = Object.values(mappings).filter(v => v !== '').length;
  const pendingDiscCount = discrepancies.filter(d => d.status === 'pending').length;

  const filteredDisc = discrepancies.filter(d => {
    if (discFilter === 'pending') return d.status === 'pending';
    if (discFilter === 'resolved') return d.status === 'resolved';
    return true;
  });

  async function applyMappings() {
    const toApply = Object.entries(mappings)
      .filter(([legacy, newName]) => newName && legacy !== newName)
      .map(([legacy_name, new_name]) => ({ legacy_name, new_name }));

    if (!toApply.length) return;
    setApplying(true);
    const res = await fetch('/api/manufacturer-merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: toApply }),
    });
    const d = await res.json();
    setResult(d);
    setApplying(false);
  }

  async function resolveDiscrepancy(id: number, action: string) {
    setResolving(id);
    await fetch('/api/upload-discrepancies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    await loadDiscrepancies();
    setResolving(null);
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/manufacturers" className="text-blue-600 hover:underline text-sm">← Manufacturers</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-800">Manufacturer Remapping</h1>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setTab('legacy')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'legacy' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Legacy Name Mapping
        </button>
        <button
          onClick={() => setTab('discrepancies')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'discrepancies' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload Discrepancies
          {pendingDiscCount > 0 && (
            <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingDiscCount}</span>
          )}
        </button>
      </div>

      {/* ── Legacy Mapping Tab ── */}
      {tab === 'legacy' && (
        <>
          {loading ? (
            <div className="text-center py-16 text-gray-400">Analysing manufacturer names...</div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
                Legacy records (GRN numbers starting with <strong>G.</strong>) may use different manufacturer names
                than the new system. Map them here to merge the histories under one name.
                Exact matches are auto-filled — review the rest and apply.
              </div>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white border rounded-lg p-3 text-center shadow-sm">
                  <div className="text-2xl font-bold text-gray-800">{suggestions.length}</div>
                  <div className="text-xs text-gray-500 mt-1">Legacy Manufacturers</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{exactCount}</div>
                  <div className="text-xs text-green-600 mt-1">Exact Matches (no action)</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-700">{actionCount}</div>
                  <div className="text-xs text-yellow-600 mt-1">Need Review</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{mappedCount}</div>
                  <div className="text-xs text-blue-600 mt-1">Mapped (ready to apply)</div>
                </div>
              </div>

              {result && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-800 text-sm font-medium">
                  ✓ Done — {result.records_updated} records updated. <Link href="/manufacturers" className="underline">Go to Manufacturers</Link>
                </div>
              )}

              <div className="flex gap-2 mb-4">
                {([
                  ['action_needed', `Needs Review (${actionCount})`],
                  ['exact', `Exact Matches (${exactCount})`],
                  ['all', `All (${suggestions.length})`],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      filter === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Legacy Name</th>
                      <th className="px-4 py-3 text-center">Records</th>
                      <th className="px-4 py-3 text-center">Confidence</th>
                      <th className="px-4 py-3 text-left">Map to (New System Name)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No items in this category.</td></tr>
                    )}
                    {filtered.map(s => {
                      const conf = CONF_LABEL[s.confidence];
                      const currentMapping = mappings[s.legacy_name] ?? '';
                      const isUnchanged = currentMapping === s.legacy_name || currentMapping === '';
                      return (
                        <tr key={s.legacy_name} className={`hover:bg-gray-50 ${!isUnchanged ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{s.legacy_name}</div>
                            <div className="text-xs text-gray-400">{s.first_date} → {s.last_date}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{s.record_count}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${conf.color}`}>{conf.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            {s.confidence === 'exact' ? (
                              <span className="text-green-600 text-sm">✓ {s.legacy_name}</span>
                            ) : (
                              <div className="flex gap-2 items-center">
                                <select
                                  className="flex-1 border rounded px-2 py-1.5 text-sm bg-white"
                                  value={currentMapping}
                                  onChange={e => setMappings({ ...mappings, [s.legacy_name]: e.target.value })}
                                >
                                  <option value="">— keep as legacy name —</option>
                                  {newNames.map(n => (
                                    <option key={n} value={n}>{n}</option>
                                  ))}
                                </select>
                                {currentMapping && currentMapping !== s.legacy_name && (
                                  <span className="text-xs text-blue-600 whitespace-nowrap">→ will remap</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="sticky bottom-6 flex justify-end">
                <button
                  onClick={applyMappings}
                  disabled={applying || mappedCount === 0}
                  className="bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {applying ? 'Applying...' : `Apply ${Object.values(mappings).filter((v, i) => v && v !== Object.keys(mappings)[i]).length || mappedCount} Mappings`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Discrepancies Tab ── */}
      {tab === 'discrepancies' && (
        <>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6 text-sm text-orange-800">
            When uploaded data assigns an item to a different manufacturer than what is already stored,
            it is flagged here instead of overwriting automatically. Review each discrepancy and decide which
            manufacturer name to keep.
          </div>

          <div className="flex gap-2 mb-4">
            {([
              ['pending', `Pending (${discrepancies.filter(d => d.status === 'pending').length})`],
              ['resolved', `Resolved (${discrepancies.filter(d => d.status === 'resolved').length})`],
              ['all', `All (${discrepancies.length})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDiscFilter(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  discFilter === key ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {discLoading ? (
            <div className="text-center py-16 text-gray-400">Loading discrepancies...</div>
          ) : filteredDisc.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              {discFilter === 'pending' ? 'No pending discrepancies — all uploads matched existing manufacturers.' : 'No items in this category.'}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-left">GRN / Date</th>
                    <th className="px-4 py-3 text-left">Existing Manufacturer</th>
                    <th className="px-4 py-3 text-left">Uploaded As</th>
                    <th className="px-4 py-3 text-left">Status / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDisc.map(d => (
                    <tr key={d.id} className={d.status === 'pending' ? 'bg-orange-50/40' : ''}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{d.item_name || d.item_id}</div>
                        <div className="text-xs text-gray-400">ID: {d.item_id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{d.grn_no}</div>
                        <div className="text-xs text-gray-400">{d.grn_date}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-700 font-medium">{d.existing_manufacture_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-blue-700 font-medium">{d.uploaded_manufacture_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        {d.status === 'resolved' ? (
                          <div>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Resolved</span>
                            <div className="text-xs text-gray-400 mt-1">→ {d.resolved_to}</div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => resolveDiscrepancy(d.id, 'approve_existing')}
                              disabled={resolving === d.id}
                              className="text-xs px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-left"
                            >
                              Keep: <strong>{d.existing_manufacture_name}</strong>
                            </button>
                            <button
                              onClick={() => resolveDiscrepancy(d.id, 'approve_uploaded')}
                              disabled={resolving === d.id}
                              className="text-xs px-3 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-left"
                            >
                              Use uploaded: <strong>{d.uploaded_manufacture_name}</strong>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
