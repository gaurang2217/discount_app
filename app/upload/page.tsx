"use client";

import { useState } from "react";
import Link from "next/link";

interface UploadResult {
  success: boolean;
  total: number;
  inserted: number;
  skipped_duplicates: number;
  already_exists: number;
  discrepancies?: number;
  free_qty_rows?: number;
  error?: string;
}

function UploadZone({
  id,
  file,
  setFile,
  uploading,
  onUpload,
  onOverwrite,
  result,
  color,
}: {
  id: string;
  file: File | null;
  setFile: (f: File | null) => void;
  uploading: boolean;
  onUpload: () => void;
  onOverwrite?: () => void;
  result: UploadResult | null;
  color: "blue" | "purple";
}) {
  const [dragOver, setDragOver] = useState(false);
  const border = color === "blue" ? "border-blue-400 bg-blue-50" : "border-purple-400 bg-purple-50";
  const btn = color === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700";
  const uploadBtn = color === "blue" ? "bg-blue-700 hover:bg-blue-800" : "bg-purple-700 hover:bg-purple-800";

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          dragOver ? border : "border-gray-300 bg-white"
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) setFile(f);
        }}
      >
        <div className="text-3xl mb-3">📂</div>
        <p className="text-gray-600 mb-4 text-sm">Drag & drop your Excel file here, or click to select</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          id={id}
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
        <label htmlFor={id} className={`cursor-pointer ${btn} text-white px-5 py-2 rounded-lg text-sm font-medium`}>
          Select File
        </label>
        {file && (
          <p className="mt-3 text-sm text-gray-700">
            <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      {file && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onUpload}
            disabled={uploading}
            className={`flex-1 ${uploadBtn} text-white py-3 rounded-lg font-semibold disabled:opacity-50`}
          >
            {uploading ? "Uploading & Processing..." : "Upload File"}
          </button>
          {onOverwrite && (
            <button
              onClick={onOverwrite}
              disabled={uploading}
              className="px-4 py-3 border-2 border-orange-400 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 disabled:opacity-50 text-sm whitespace-nowrap"
              title="Re-upload and overwrite existing records (fixes calculation errors)"
            >
              Re-upload &amp; Overwrite
            </button>
          )}
        </div>
      )}

      {result && (
        <div className={`mt-4 rounded-xl p-4 ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          {result.error ? (
            <p className="text-red-700 font-medium text-sm">Error: {result.error}</p>
          ) : (
            <>
              <h3 className="font-bold text-green-800 mb-2 text-sm">Upload Complete</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded p-2 border">
                  <div className="text-xs text-gray-500">Total Rows</div>
                  <div className="text-lg font-bold">{result.total}</div>
                </div>
                <div className="bg-white rounded p-2 border">
                  <div className="text-xs text-gray-500">New Records Added</div>
                  <div className="text-lg font-bold text-green-700">{result.inserted}</div>
                </div>
                <div className="bg-white rounded p-2 border">
                  <div className="text-xs text-gray-500">Duplicates Skipped</div>
                  <div className="text-lg font-bold text-gray-400">{result.skipped_duplicates}</div>
                </div>
                <div className="bg-white rounded p-2 border">
                  <div className="text-xs text-gray-500">Already in DB</div>
                  <div className="text-lg font-bold text-orange-500">{result.already_exists}</div>
                </div>
                {result.discrepancies !== undefined && result.discrepancies > 0 && (
                  <div className="bg-orange-50 rounded p-2 border border-orange-200 col-span-2">
                    <div className="text-xs text-orange-600 font-medium">Manufacturer Discrepancies Flagged</div>
                    <div className="text-lg font-bold text-orange-600">{result.discrepancies}</div>
                    <div className="text-xs text-orange-500 mt-0.5">
                      <Link href="/manufacturers/merge" className="underline">Review in Remapping page →</Link>
                    </div>
                  </div>
                )}
                {result.free_qty_rows !== undefined && (
                  <div className="bg-white rounded p-2 border col-span-2">
                    <div className="text-xs text-gray-500">Free Qty Rows (PACK_PUR = 0)</div>
                    <div className="text-lg font-bold text-orange-400">{result.free_qty_rows}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const [legacyFile, setLegacyFile] = useState<File | null>(null);
  const [legacyUploading, setLegacyUploading] = useState(false);
  const [legacyResult, setLegacyResult] = useState<UploadResult | null>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      setResult(await res.json());
    } catch {
      setResult({ success: false, total: 0, inserted: 0, skipped_duplicates: 0, already_exists: 0, error: "Upload failed" });
    }
    setUploading(false);
  }

  async function handleLegacyUpload(overwrite = false) {
    if (!legacyFile) return;
    setLegacyUploading(true);
    setLegacyResult(null);
    const form = new FormData();
    form.append("file", legacyFile);
    if (overwrite) form.append("overwrite", "true");
    try {
      const res = await fetch("/api/upload-legacy", { method: "POST", body: form });
      setLegacyResult(await res.json());
    } catch {
      setLegacyResult({ success: false, total: 0, inserted: 0, skipped_duplicates: 0, already_exists: 0, error: "Upload failed" });
    }
    setLegacyUploading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10">

      {/* Standard upload */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Upload GRN File</h1>
        <p className="text-sm text-gray-500 mb-5">GRN Register (Item Wise) export from HMS</p>
        <UploadZone
          id="file-input"
          file={file}
          setFile={setFile}
          uploading={uploading}
          onUpload={handleUpload}
          result={result}
          color="blue"
        />
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800">
          <strong>Expected columns:</strong> GRN No, Item Id, Item Name, Manufacture Name, Rec. Qty., Free Qty., Unit Rate, GRN Date, etc.
          Duplicates are skipped by GRN No + Item Id.
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Legacy upload */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-gray-800">Legacy System Upload</h2>
          <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">One-time import</span>
        </div>
        <p className="text-sm text-gray-500 mb-5">Itemwise Purchase Report format (older system)</p>
        <UploadZone
          id="legacy-file-input"
          file={legacyFile}
          setFile={setLegacyFile}
          uploading={legacyUploading}
          onUpload={() => handleLegacyUpload(false)}
          onOverwrite={() => handleLegacyUpload(true)}
          result={legacyResult}
          color="purple"
        />
        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4 text-xs text-purple-800">
          <strong>Column mapping:</strong> AKHIL NAME → item name · PACK_QTY × PACK_PUR → purchase value ·
          LOOSE_QTY → display qty · PACK_PUR = 0 → free qty · MANUFACTURER → manufacturer name.
          Duplicates are still skipped by GRN No + Item Code.
        </div>
      </div>

    </div>
  );
}
