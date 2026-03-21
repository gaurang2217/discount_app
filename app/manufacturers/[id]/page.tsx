"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface MonthlyItem {
  month: string;
  item_id: string;
  item_name: string;
  item_category: string;
  item_sub_category: string;
  total_rec_qty: number;
  total_free_qty: number;
  avg_rate: number;
  purchase_value: number;
  grn_count: number;
}

interface SponsorshipRate {
  item_id: string;
  item_name: string;
  rate_pct: number;
  effective_from: string | null;
}

interface Receipt {
  month: string;
  amount_due: number;
  amount_received: number | null;
  received_date: string | null;
  notes: string | null;
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

export default function ManufacturerDetail() {
  const params = useParams();
  const mfr = decodeURIComponent(params.id as string);

  const [monthly, setMonthly] = useState<MonthlyItem[]>([]);
  const [rates, setRates] = useState<SponsorshipRate[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [companyRate, setCompanyRate] = useState<{ rate_pct: number; effective_from: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<{ item_id: string; item_name: string; pct: string; effective_from: string } | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const [editingCompanyRate, setEditingCompanyRate] = useState(false);
  const [companyRateForm, setCompanyRateForm] = useState({ pct: "", effective_from: "" });
  const [savingCompanyRate, setSavingCompanyRate] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<{ month: string; amount: string; date: string; notes: string } | null>(null);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async (bustCache = false) => {
    setLoading(true);
    const url = `/api/manufacturers/${encodeURIComponent(mfr)}${bustCache ? `?t=${Date.now()}` : ''}`;
    const res = await fetch(url);
    const d = await res.json();
    setMonthly(d.monthly || []);
    setRates(d.rates || []);
    setReceipts(d.receipts || []);
    setCompanyRate(d.companyRate || null);
    setLoading(false);
  }, [mfr]);

  useEffect(() => { load(); }, [load]);

  const rateMap: Record<string, SponsorshipRate> = {};
  for (const r of rates) rateMap[r.item_id] = r;

  const receiptMap: Record<string, Receipt> = {};
  for (const r of receipts) receiptMap[r.month] = r;

  // Group by month
  const months = [...new Set(monthly.map(r => r.month))].sort((a, b) => b.localeCompare(a));

  // Monthly summary
  const getEffectiveRate = (item_id: string, month: string): { pct: number; source: 'item' | 'company' | 'none' } => {
    const itemRate = rateMap[item_id];
    if (itemRate && itemRate.rate_pct > 0) {
      if (!itemRate.effective_from || month >= itemRate.effective_from) return { pct: itemRate.rate_pct, source: 'item' };
      return { pct: 0, source: 'none' };
    }
    if (companyRate && companyRate.rate_pct > 0) {
      if (!companyRate.effective_from || month >= companyRate.effective_from) return { pct: companyRate.rate_pct, source: 'company' };
      return { pct: 0, source: 'none' };
    }
    return { pct: 0, source: 'none' };
  };

  const monthlySummary = months.map(month => {
    const items = monthly.filter(r => r.month === month);
    const purchase_value = items.reduce((s, r) => s + r.purchase_value, 0);
    const sponsorship_due = items.reduce((s, r) => {
      const { pct } = getEffectiveRate(r.item_id, month);
      return s + r.purchase_value * pct / 100;
    }, 0);
    return { month, purchase_value, sponsorship_due, items };
  });

  async function saveCompanyRate() {
    setSavingCompanyRate(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/manufacturer-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacture_name: mfr,
          rate_pct: parseFloat(companyRateForm.pct) || 0,
          effective_from: companyRateForm.effective_from || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingCompanyRate(false);
      load(true);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSavingCompanyRate(false);
    }
  }

  async function saveRate() {
    if (!editingRate) return;
    setSavingRate(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/sponsorship-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacture_name: mfr,
          item_id: editingRate.item_id,
          item_name: editingRate.item_name,
          rate_pct: parseFloat(editingRate.pct) || 0,
          effective_from: editingRate.effective_from || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingRate(null);
      load(true);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSavingRate(false);
    }
  }

  async function saveReceipt(month: string, sponsorship_due: number) {
    if (!editingReceipt) return;
    setSavingReceipt(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacture_name: mfr,
          month,
          amount_due: sponsorship_due,
          amount_received: editingReceipt.amount,
          received_date: editingReceipt.date,
          notes: editingReceipt.notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingReceipt(null);
      load(true);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSavingReceipt(false);
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/manufacturers" className="text-blue-600 hover:underline text-sm">← Manufacturers</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-800">{mfr}</h1>
      </div>

      {/* Company-level rate banner */}
      <div className="mb-6 flex items-center gap-4 bg-purple-50 border border-purple-200 rounded-lg px-5 py-3">
        <div className="flex-1">
          <span className="text-sm font-medium text-purple-800">Company-wide Discount Rate: </span>
          {companyRate ? (
            <span className="text-sm text-purple-700">
              <strong>{companyRate.rate_pct}%</strong>
              {companyRate.effective_from && <span className="text-purple-500 ml-2">from {companyRate.effective_from}</span>}
              <span className="text-xs text-purple-400 ml-2">(applied to items with no individual rate)</span>
            </span>
          ) : (
            <span className="text-sm text-purple-400">Not set</span>
          )}
        </div>
        <button
          onClick={() => {
            setCompanyRateForm({
              pct: companyRate?.rate_pct?.toString() || "",
              effective_from: companyRate?.effective_from || "",
            });
            setEditingCompanyRate(true);
          }}
          className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700"
        >
          {companyRate ? "Edit Company Discount Rate" : "Set Company Discount Rate"}
        </button>
      </div>

      {/* Overall summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Total Purchase</div>
          <div className="text-xl font-bold text-gray-800 mt-1">
            {fmt(monthlySummary.reduce((s, m) => s + m.purchase_value, 0))}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Total Discount Due</div>
          <div className="text-xl font-bold text-blue-700 mt-1">
            {fmt(monthlySummary.reduce((s, m) => s + m.sponsorship_due, 0))}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Total Received</div>
          <div className="text-xl font-bold text-green-700 mt-1">
            {fmt(receipts.reduce((s, r) => s + (r.amount_received || 0), 0))}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500">Items with Rates</div>
          <div className="text-xl font-bold text-gray-800 mt-1">{rates.length}</div>
        </div>
      </div>

      {/* Monthly accordion */}
      <div className="space-y-3">
        {monthlySummary.map(({ month, purchase_value, sponsorship_due, items }) => {
          const receipt = receiptMap[month];
          const isOpen = activeMonth === month;
          const isReceived = receipt?.amount_received !== null && receipt?.amount_received !== undefined && (receipt?.amount_received || 0) > 0;

          return (
            <div key={month} className="bg-white border rounded-lg shadow-sm overflow-hidden">
              {/* Month header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setActiveMonth(isOpen ? null : month)}
              >
                <div className="flex items-center gap-4">
                  <span className="font-bold text-gray-800">{monthLabel(month)}</span>
                  <span className="text-sm text-gray-500">Purchase: {fmt(purchase_value)}</span>
                  <span className="text-sm font-semibold text-blue-700">Discount Due: {fmt(sponsorship_due)}</span>
                  {sponsorship_due > 0 && (
                    isReceived ? (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                        Received: {fmt(receipt?.amount_received ?? null)}
                      </span>
                    ) : (
                      <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">Pending</span>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sponsorship_due > 0 && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setEditingReceipt({
                          month,
                          amount: receipt?.amount_received?.toString() || "",
                          date: receipt?.received_date || "",
                          notes: receipt?.notes || "",
                        });
                      }}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      Update Receipt
                    </button>
                  )}
                  <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Item details */}
              {isOpen && (
                <div className="border-t">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Item</th>
                        <th className="px-4 py-2 text-left">Category</th>
                        <th className="px-4 py-2 text-right">Rec. Qty</th>
                        <th className="px-4 py-2 text-right">Free Qty</th>
                        <th className="px-4 py-2 text-right">Avg Rate</th>
                        <th className="px-4 py-2 text-right">Purchase Value</th>
                        <th className="px-4 py-2 text-right">Disc. %</th>
                        <th className="px-4 py-2 text-right">Disc. Amount</th>
                        <th className="px-4 py-2 text-center">Set Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item, i) => {
                        const rateEntry = rateMap[item.item_id];
                        const { pct, source } = getEffectiveRate(item.item_id, month);
                        const effectiveFrom = source === 'item' ? rateEntry?.effective_from : companyRate?.effective_from;
                        const applicable = pct > 0;
                        const sponAmt = applicable ? item.purchase_value * pct / 100 : 0;
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <div className="font-medium">{item.item_name}</div>
                              <div className="text-gray-400">ID: {item.item_id}</div>
                            </td>
                            <td className="px-4 py-2 text-gray-500">{item.item_sub_category || item.item_category}</td>
                            <td className="px-4 py-2 text-right">{item.total_rec_qty}</td>
                            <td className="px-4 py-2 text-right text-orange-500">{item.total_free_qty || 0}</td>
                            <td className="px-4 py-2 text-right">{fmt(item.avg_rate)}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmt(item.purchase_value)}</td>
                            <td className="px-4 py-2 text-right">
                              {pct > 0 ? (
                                <div>
                                  <span className="text-blue-600 font-medium">{pct}%</span>
                                  {source === 'company' && (
                                    <span className="ml-1 text-xs text-purple-500">(co.)</span>
                                  )}
                                  {effectiveFrom && (
                                    <div className="text-xs text-gray-400">from {effectiveFrom}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-green-700">
                              {sponAmt > 0 ? fmt(sponAmt) : "—"}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => {
                                  const ownRate = rateMap[item.item_id];
                                  setEditingRate({
                                    item_id: item.item_id,
                                    item_name: item.item_name,
                                    pct: ownRate && ownRate.rate_pct > 0 ? ownRate.rate_pct.toString() : pct > 0 ? pct.toString() : "",
                                    effective_from: ownRate?.effective_from || "",
                                  });
                                }}
                                className="text-blue-600 hover:underline text-xs"
                              >
                                {pct > 0 ? "Edit" : "Set %"}
                              </button>
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
        })}
      </div>

      {months.length === 0 && (
        <div className="text-center py-16 text-gray-400">No purchase data for this manufacturer.</div>
      )}

      {/* Company rate modal */}
      {editingCompanyRate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-1">Company-wide Discount Rate</h2>
            <p className="text-sm text-gray-500 mb-4">{mfr}</p>
            <p className="text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded p-2 mb-4">
              This rate applies to all items from this manufacturer that don&apos;t have their own individual rate set.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Discount Percentage (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={companyRateForm.pct}
                  onChange={e => setCompanyRateForm({ ...companyRateForm, pct: e.target.value })}
                  placeholder="e.g. 2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Effective From (Month)
                  <span className="text-gray-400 font-normal ml-1">— leave blank to apply to all months</span>
                </label>
                <input
                  type="month"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={companyRateForm.effective_from}
                  onChange={e => setCompanyRateForm({ ...companyRateForm, effective_from: e.target.value })}
                />
              </div>
            </div>
            {saveError && <p className="text-red-600 text-xs mt-3">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={saveCompanyRate}
                disabled={savingCompanyRate}
                className="flex-1 bg-purple-600 text-white py-2 rounded font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {savingCompanyRate ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setEditingCompanyRate(false); setSaveError(null); }}
                className="flex-1 border py-2 rounded font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate edit modal */}
      {editingRate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-1">Set Discount Rate</h2>
            <p className="text-sm text-gray-500 mb-4">{editingRate.item_name}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Discount Percentage (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={editingRate.pct}
                  onChange={e => setEditingRate({ ...editingRate, pct: e.target.value })}
                  placeholder="e.g. 2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Effective From (Month)
                  <span className="text-gray-400 font-normal ml-1">— leave blank to apply to all months</span>
                </label>
                <input
                  type="month"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={editingRate.effective_from}
                  onChange={e => setEditingRate({ ...editingRate, effective_from: e.target.value })}
                />
              </div>
            </div>
            {saveError && <p className="text-red-600 text-xs mt-3">{saveError}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={saveRate}
                disabled={savingRate}
                className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {savingRate ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setEditingRate(null); setSaveError(null); }}
                className="flex-1 border py-2 rounded font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt edit modal */}
      {editingReceipt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-1">Update Receipt</h2>
            <p className="text-sm text-gray-500 mb-4">{mfr} — {monthLabel(editingReceipt.month)}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount Received (₹)</label>
                <input
                  type="number"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={editingReceipt.amount}
                  onChange={e => setEditingReceipt({ ...editingReceipt, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Received Date</label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={editingReceipt.date}
                  onChange={e => setEditingReceipt({ ...editingReceipt, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                  value={editingReceipt.notes}
                  onChange={e => setEditingReceipt({ ...editingReceipt, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  const s = monthlySummary.find(m => m.month === editingReceipt.month);
                  saveReceipt(editingReceipt.month, s?.sponsorship_due || 0);
                }}
                disabled={savingReceipt}
                className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {savingReceipt ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingReceipt(null)}
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
