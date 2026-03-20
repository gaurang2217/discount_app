"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Manufacturer {
  manufacture_name: string;
  grn_count: number;
  item_lines: number;
  total_purchase_value: number;
  first_date: string;
  last_date: string;
}

function fmt(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function ManufacturersPage() {
  const [data, setData] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/manufacturers")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, []);

  const filtered = data.filter(m =>
    m.manufacture_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = filtered.reduce((s, m) => s + (m.total_purchase_value || 0), 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Manufacturers</h1>
        <div className="flex gap-3 items-center">
          <Link
            href="/manufacturers/merge"
            className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded-lg hover:bg-purple-700"
          >
            Remap Legacy Names
          </Link>
          <input
            type="text"
            placeholder="Search manufacturer..."
            className="border rounded px-3 py-1.5 text-sm bg-white w-64"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 mb-6 text-sm text-blue-800">
        Showing <strong>{filtered.length}</strong> manufacturers — Total Purchase Value: <strong>{fmt(totalValue)}</strong>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No manufacturers found. <Link href="/upload" className="text-blue-600 underline">Upload a GRN file</Link>.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Manufacturer</th>
                <th className="px-4 py-3 text-right">GRN Count</th>
                <th className="px-4 py-3 text-right">Item Lines</th>
                <th className="px-4 py-3 text-right">Total Purchase Value</th>
                <th className="px-4 py-3 text-center">Date Range</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(m => (
                <tr key={m.manufacture_name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{m.manufacture_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{m.grn_count}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{m.item_lines}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(m.total_purchase_value)}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">
                    {m.first_date} → {m.last_date}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/manufacturers/${encodeURIComponent(m.manufacture_name)}`}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
