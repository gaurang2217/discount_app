"use client";

import { useEffect, useState, useCallback } from "react";

interface DashboardRow {
  manufacture_name: string;
  month: string;
  purchase_value: number;
  sponsorship_due: number;
  amount_received: number | null;
  received_date: string | null;
  notes: string | null;
}

interface ReceiptForm {
  manufacture_name: string;
  month: string;
  amount_received: string;
  received_date: string;
  notes: string;
}

function fmt(n: number | null) {
  if (n === null || n === undefined) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(mo) - 1]} ${y}`;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<ReceiptForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterMonth, setFilterMonth] = useState("");
  const [filterMfr, setFilterMfr] = useState("");
  const [sortBy, setSortBy] = useState<"pending" | "discount_due" | "purchase_value" | "name">("pending");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/dashboard");
    const d = await res.json();
    setData(Array.isArray(d) ? d : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const months = [...new Set(data.map(r => r.month))].sort((a, b) => b.localeCompare(a));

  // Breakdown: when a month is selected, only show manufacturers with a discount deal (sponsorship_due > 0)
  const breakdownBase = data.filter(r =>
    (!filterMonth || r.month === filterMonth) &&
    (filterMonth ? r.sponsorship_due > 0 : true) &&
    (!filterMfr || r.manufacture_name === filterMfr)
  );
  // Manufacturers list for dropdown: only those with discount deals (sponsorship_due > 0) in selected month
  const manufacturers = [...new Set(
    data.filter(r => (!filterMonth || r.month === filterMonth) && r.sponsorship_due > 0)
      .map(r => r.manufacture_name)
  )].sort();
  const filtered = [...breakdownBase].sort((a, b) => {
    let diff = 0;
    if (sortBy === "pending") diff = (a.sponsorship_due - (a.amount_received || 0)) - (b.sponsorship_due - (b.amount_received || 0));
    else if (sortBy === "discount_due") diff = a.sponsorship_due - b.sponsorship_due;
    else if (sortBy === "purchase_value") diff = a.purchase_value - b.purchase_value;
    else if (sortBy === "name") diff = a.manufacture_name.localeCompare(b.manufacture_name);
    return sortDir === "desc" ? -diff : diff;
  });

  // Overall totals (filtered)
  const totalPurchase = filtered.reduce((s, r) => s + (r.purchase_value || 0), 0);
  const totalDue = filtered.reduce((s, r) => s + (r.sponsorship_due || 0), 0);
  const totalReceived = filtered.reduce((s, r) => s + (r.amount_received || 0), 0);
  const totalPending = totalDue - totalReceived;

  // Monthly projections (always from full unfiltered data)
  const monthlyProjections = months.map(month => {
    const rows = data.filter(r => r.month === month);
    const purchase_value = rows.reduce((s, r) => s + r.purchase_value, 0);
    const discount_due = rows.reduce((s, r) => s + (r.sponsorship_due || 0), 0);
    const received = rows.reduce((s, r) => s + (r.amount_received || 0), 0);
    const pending = discount_due - received;
    const manufacturers_count = rows.length;
    return { month, purchase_value, discount_due, received, pending, manufacturers_count };
  });

  async function saveReceipt() {
    if (!editRow) return;
    setSaving(true);
    const discount_due = data.find(
      r => r.manufacture_name === editRow.manufacture_name && r.month === editRow.month
    )?.sponsorship_due || 0;

    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manufacture_name: editRow.manufacture_name,
        month: editRow.month,
        amount_due: discount_due,
        amount_received: editRow.amount_received,
        received_date: editRow.received_date,
        notes: editRow.notes,
      }),
    });
    setSaving(false);
    setEditRow(null);
    if (res.ok) {
      setData(prev => prev.map(r =>
        r.manufacture_name === editRow.manufacture_name && r.month === editRow.month
          ? {
              ...r,
              amount_received: editRow.amount_received !== "" ? Number(editRow.amount_received) : null,
              received_date: editRow.received_date || null,
              notes: editRow.notes || null,
            }
          : r
      ));
    } else {
      load();
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Discount Dashboard</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 font-medium">Total Purchase Value</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{fmt(totalPurchase)}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-600 font-medium">Total Discount Due</div>
          <div className="text-2xl font-bold text-blue-800 mt-1">{fmt(totalDue)}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-600 font-medium">Total Received</div>
          <div className="text-2xl font-bold text-green-800 mt-1">{fmt(totalReceived)}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-orange-600 font-medium">Pending Collection</div>
          <div className="text-2xl font-bold text-orange-800 mt-1">{fmt(totalPending)}</div>
        </div>
      </div>

      {/* Monthly Projections */}
      {!loading && monthlyProjections.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3">Monthly Discount Projections</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Month</th>
                  <th className="px-4 py-3 text-right">Total Purchase</th>
                  <th className="px-4 py-3 text-right">Discount Due</th>
                  <th className="px-4 py-3 text-right">Received</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                  <th className="px-4 py-3 text-center">Manufacturers</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthlyProjections.map(mp => {
                  const fullyReceived = mp.discount_due > 0 && mp.pending <= 0;
                  const partiallyReceived = mp.received > 0 && mp.pending > 0;
                  const noneReceived = mp.received === 0 && mp.discount_due > 0;
                  return (
                    <tr
                      key={mp.month}
                      className={`hover:bg-gray-50 cursor-pointer ${filterMonth === mp.month ? "bg-blue-50" : ""}`}
                      onClick={() => setFilterMonth(filterMonth === mp.month ? "" : mp.month)}
                    >
                      <td className="px-4 py-3 font-semibold">{monthLabel(mp.month)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(mp.purchase_value)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(mp.discount_due)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{mp.received > 0 ? fmt(mp.received) : "—"}</td>
                      <td className="px-4 py-3 text-right text-orange-600 font-medium">{mp.pending > 0 ? fmt(mp.pending) : "—"}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{mp.manufacturers_count}</td>
                      <td className="px-4 py-3 text-center">
                        {mp.discount_due === 0 ? (
                          <span className="text-xs text-gray-400">No rates set</span>
                        ) : fullyReceived ? (
                          <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">Complete</span>
                        ) : partiallyReceived ? (
                          <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">Partial</span>
                        ) : noneReceived ? (
                          <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">Pending</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manufacturer detail table */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {filterMonth && (
            <button
              onClick={() => { setFilterMonth(""); setFilterMfr(""); }}
              className="flex items-center gap-1 text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 font-medium"
            >
              ← All Months
            </button>
          )}
          <h2 className="text-base font-semibold text-gray-700">
            {filterMonth ? `${monthLabel(filterMonth)} — Manufacturer Breakdown` : "Manufacturer-wise Breakdown"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white"
            value={filterMfr}
            onChange={e => setFilterMfr(e.target.value)}
          >
            <option value="">All Manufacturers</option>
            {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="pending">Sort: Pending</option>
            <option value="discount_due">Sort: Discount Due</option>
            <option value="purchase_value">Sort: Purchase Value</option>
            <option value="name">Sort: Name</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
            className="border rounded px-2 py-1.5 text-sm bg-white hover:bg-gray-50 font-medium text-gray-600"
            title={sortDir === "desc" ? "Highest first" : "Lowest first"}
          >
            {sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No data yet. <a href="/upload" className="text-blue-600 underline">Upload a GRN file</a> to get started.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Month</th>
                <th className="px-4 py-3 text-left">Manufacturer</th>
                <th className="px-4 py-3 text-right">Purchase Value</th>
                <th className="px-4 py-3 text-right">Discount Due</th>
                <th className="px-4 py-3 text-right">Amount Received</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row, i) => {
                const isReceived = row.amount_received !== null && row.amount_received > 0;
                const isPartial = isReceived && row.amount_received! < row.sponsorship_due;
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{monthLabel(row.month)}</td>
                    <td className="px-4 py-3">
                      <a href={`/manufacturers/${encodeURIComponent(row.manufacture_name)}`}
                        className="text-blue-600 hover:underline">
                        {row.manufacture_name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(row.purchase_value)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(row.sponsorship_due)}</td>
                    <td className="px-4 py-3 text-right text-green-700">
                      {row.amount_received !== null ? fmt(row.amount_received) : "—"}
                      {row.received_date && (
                        <div className="text-xs text-gray-400">{row.received_date}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.sponsorship_due === 0 ? (
                        <span className="text-xs text-gray-400">No rate set</span>
                      ) : isPartial ? (
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">Partial</span>
                      ) : isReceived ? (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">Received</span>
                      ) : (
                        <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setEditRow({
                          manufacture_name: row.manufacture_name,
                          month: row.month,
                          amount_received: row.amount_received?.toString() || "",
                          received_date: row.received_date || "",
                          notes: row.notes || "",
                        })}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                      >
                        Update Receipt
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Receipt modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Update Receipt</h2>
            <div className="text-sm text-gray-600 mb-4">
              <strong>{editRow.manufacture_name}</strong> — {monthLabel(editRow.month)}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount Received (₹)</label>
                <input
                  type="number"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={editRow.amount_received}
                  onChange={e => setEditRow({ ...editRow, amount_received: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Received Date</label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={editRow.received_date}
                  onChange={e => setEditRow({ ...editRow, received_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                  value={editRow.notes}
                  onChange={e => setEditRow({ ...editRow, notes: e.target.value })}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={saveReceipt}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditRow(null)}
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
