"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

interface ItemRow {
  item_id: string;
  item_name: string;
  item_category: string;
  item_sub_category: string;
  manufacture_name: string;
  grn_count: number;
  total_rec_qty: number;
  total_purchase_value: number;
  first_date: string;
  last_date: string;
  sponsorship_pct: number;
}

function fmt(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function ItemsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [remapping, setRemapping] = useState<ItemRow | null>(null);
  const [newMfr, setNewMfr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    const res = await fetch(`/api/items?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data);
    // Collect unique manufacturers for the remap dropdown
    const mfrs = [...new Set((data as ItemRow[]).map(r => r.manufacture_name))].sort();
    setManufacturers(mfrs);
    setLoading(false);
  }, []);

  // Load all on mount
  useEffect(() => { search(""); }, [search]);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  }

  async function doRemap() {
    if (!remapping || !newMfr) return;
    setSaving(true);
    setSaveMsg("");
    const res = await fetch("/api/items/remap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: remapping.item_id,
        old_manufacture_name: remapping.manufacture_name,
        new_manufacture_name: newMfr,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setSaveMsg(`Updated ${data.rows_updated} record(s) successfully.`);
      setTimeout(() => {
        setRemapping(null);
        setSaveMsg("");
        search(query);
      }, 1200);
    } else {
      setSaveMsg(data.error || "Error updating");
    }
  }

  // Fetch all manufacturers for the remap dropdown (not just from search results)
  useEffect(() => {
    fetch("/api/manufacturers").then(r => r.json()).then(d => {
      setManufacturers(d.map((m: { manufacture_name: string }) => m.manufacture_name).sort());
    });
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Item Search</h1>
        <div className="text-sm text-gray-500">{results.length} result{results.length !== 1 ? "s" : ""}</div>
      </div>

      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Search by item name, item ID, or manufacturer..."
          className="w-full border rounded-lg px-4 py-3 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          autoFocus
        />
        {loading && (
          <span className="absolute right-4 top-3 text-xs text-gray-400">Searching...</span>
        )}
      </div>

      {results.length === 0 && !loading ? (
        <div className="text-center py-16 text-gray-400">
          {query ? "No items found." : "No data yet. Upload a GRN file first."}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Manufacturer</th>
                <th className="px-4 py-3 text-right">Total Qty</th>
                <th className="px-4 py-3 text-right">Purchase Value</th>
                <th className="px-4 py-3 text-right">Disc. %</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.item_name}</div>
                    <div className="text-xs text-gray-400">ID: {row.item_id}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {row.item_category}
                    {row.item_sub_category && <span className="block text-gray-400">{row.item_sub_category}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/manufacturers/${encodeURIComponent(row.manufacture_name)}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {row.manufacture_name}
                    </Link>
                    <div className="text-xs text-gray-400">{row.grn_count} GRN(s) · {row.first_date} → {row.last_date}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{row.total_rec_qty}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(row.total_purchase_value)}</td>
                  <td className="px-4 py-3 text-right">
                    {row.sponsorship_pct > 0
                      ? <span className="text-blue-600 font-medium">{row.sponsorship_pct}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => { setRemapping(row); setNewMfr(""); setSaveMsg(""); }}
                      className="text-xs bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600"
                    >
                      Remap
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Remap modal */}
      {remapping && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-1">Remap Manufacturer</h2>
            <p className="text-sm text-gray-500 mb-4">
              Moving <strong>{remapping.item_name}</strong> ({remapping.item_id})
            </p>

            <div className="bg-gray-50 rounded p-3 mb-4 text-sm">
              <div className="text-xs text-gray-500 mb-1">Current manufacturer</div>
              <div className="font-medium text-gray-800">{remapping.manufacture_name}</div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Move to manufacturer</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm bg-white"
                value={newMfr}
                onChange={e => setNewMfr(e.target.value)}
              >
                <option value="">Select manufacturer...</option>
                {manufacturers
                  .filter(m => m !== remapping.manufacture_name)
                  .map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {saveMsg && (
              <p className={`text-sm mb-3 ${saveMsg.includes("success") || saveMsg.includes("Updated") ? "text-green-600" : "text-red-600"}`}>
                {saveMsg}
              </p>
            )}

            <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded p-2 mb-4">
              This will reassign all {remapping.grn_count} GRN record(s) of this item from the current manufacturer to the selected one. Discount rates will also be moved.
            </div>

            <div className="flex gap-3">
              <button
                onClick={doRemap}
                disabled={saving || !newMfr}
                className="flex-1 bg-orange-500 text-white py-2 rounded font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Confirm Remap"}
              </button>
              <button
                onClick={() => setRemapping(null)}
                className="flex-1 border py-2 rounded font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
