"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import type { BandMode } from "@/lib/bands";

const MAX_ROWS = 10000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

interface ParsedCsv {
  columns: string[];
  dataRows: string[][];
}

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [urlColumn, setUrlColumn] = useState<string>("");
  const [bandMode, setBandMode] = useState<BandMode>("disabled");
  const [bandCutoffA, setBandCutoffA] = useState("");
  const [bandCutoffB, setBandCutoffB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pasteLines = useMemo(
    () => pasteText.split("\n").map((l) => l.trim()),
    [pasteText]
  );
  const pasteNonBlank = useMemo(() => pasteLines.filter((l) => l.length > 0), [pasteLines]);
  const pasteBlankCount = pasteLines.length - pasteNonBlank.length;

  function reparseCsv(text: string, headerToggle: boolean) {
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const allRows = result.data as string[][];
    const columns = headerToggle && allRows.length > 0
      ? allRows[0]
      : allRows[0]?.map((_, i) => `Column ${i + 1}`) ?? [];
    const dataRows = headerToggle ? allRows.slice(1) : allRows;
    setCsv({ columns, dataRows });
    setUrlColumn((prev) => (columns.includes(prev) ? prev : columns[0] ?? ""));
  }

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(`File exceeds the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    const text = await file.text();
    reparseCsv(text, hasHeader);
  }

  const rowCount = mode === "paste" ? pasteNonBlank.length : csv?.dataRows.length ?? 0;

  async function handleSubmit() {
    setError(null);

    if (rowCount === 0) {
      setError("Add at least one link before submitting.");
      return;
    }
    if (rowCount > MAX_ROWS) {
      setError(`Batch exceeds the ${MAX_ROWS}-row limit (${rowCount} rows).`);
      return;
    }
    if (bandMode !== "disabled" && !bandCutoffA) {
      setError("Enter a cutoff A for the selected band mode.");
      return;
    }
    if (bandMode === "three" && !bandCutoffB) {
      setError("Enter a cutoff B for three-band mode.");
      return;
    }
    if (bandMode === "three" && Number(bandCutoffA) >= Number(bandCutoffB)) {
      setError("Cutoff A must be less than cutoff B.");
      return;
    }
    if (mode === "csv" && !urlColumn) {
      setError("Choose which column contains the links.");
      return;
    }

    type Row = { originalLink: string; extraColumns?: Record<string, string> };
    let rows: Row[];
    if (mode === "paste") {
      rows = pasteNonBlank.map((line) => ({ originalLink: line }));
    } else {
      const urlIdx = csv!.columns.indexOf(urlColumn);
      rows = csv!.dataRows.map((r) => {
        const extraColumns: Record<string, string> = {};
        csv!.columns.forEach((col, i) => {
          if (i !== urlIdx) extraColumns[col] = r[i] ?? "";
        });
        return { originalLink: r[urlIdx] ?? "", extraColumns };
      });
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          hasHeader,
          sourceUrlColumn: mode === "csv" ? urlColumn : null,
          bandMode,
          bandCutoffA: bandCutoffA ? Number(bandCutoffA) : null,
          bandCutoffB: bandCutoffB ? Number(bandCutoffB) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create batch");
        setSubmitting(false);
        return;
      }
      router.push(`/batches/${json.batchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create batch");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">HC Rank Tool</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Upload a bulk list of links to get each domain&apos;s HC score, HC rank, and lookup status.
      </p>

      <div className="mt-8 flex gap-2">
        <button
          className={`rounded-md px-3 py-1.5 text-sm ${mode === "paste" ? "bg-neutral-900 text-white" : "border"}`}
          onClick={() => setMode("paste")}
        >
          Paste links
        </button>
        <button
          className={`rounded-md px-3 py-1.5 text-sm ${mode === "csv" ? "bg-neutral-900 text-white" : "border"}`}
          onClick={() => setMode("csv")}
        >
          Upload CSV
        </button>
      </div>

      {mode === "paste" ? (
        <div className="mt-4">
          <textarea
            className="h-64 w-full rounded-md border p-3 font-mono text-sm"
            placeholder={"https://example.com/a\nhttps://blog.example.co.uk/b\n..."}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">
            {pasteNonBlank.length} link{pasteNonBlank.length === 1 ? "" : "s"}
            {pasteBlankCount > 0 ? ` · ${pasteBlankCount} blank line${pasteBlankCount === 1 ? "" : "s"} ignored` : ""}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => {
                const nextHasHeader = e.target.checked;
                setHasHeader(nextHasHeader);
                if (csv) {
                  // re-derive columns/rows from the raw parse using the new header setting
                  const allRows = hasHeader ? [csv.columns, ...csv.dataRows] : csv.dataRows;
                  const columns = nextHasHeader
                    ? allRows[0]
                    : allRows[0]?.map((_, i) => `Column ${i + 1}`) ?? [];
                  const dataRows = nextHasHeader ? allRows.slice(1) : allRows;
                  setCsv({ columns, dataRows });
                  setUrlColumn(columns[0] ?? "");
                }
              }}
            />
            First row is a header
          </label>

          {csv && (
            <div>
              <label className="text-sm font-medium">Link column</label>
              <select
                className="mt-1 block rounded-md border px-2 py-1 text-sm"
                value={urlColumn}
                onChange={(e) => setUrlColumn(e.target.value)}
              >
                {csv.columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                {csv.dataRows.length} row{csv.dataRows.length === 1 ? "" : "s"} detected across {csv.columns.length}{" "}
                column{csv.columns.length === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-md border p-4">
        <p className="text-sm font-medium">Optional rank bands</p>
        <p className="mt-1 text-xs text-neutral-500">HC rank — lower is better. Sorting works without bands.</p>
        <select
          className="mt-2 rounded-md border px-2 py-1 text-sm"
          value={bandMode}
          onChange={(e) => setBandMode(e.target.value as BandMode)}
        >
          <option value="disabled">Off</option>
          <option value="two">Two bands (Stronger / Weaker)</option>
          <option value="three">Three bands (Stronger / Middle / Weaker)</option>
        </select>
        {bandMode !== "disabled" && (
          <div className="mt-2 flex gap-3">
            <label className="text-sm">
              Cutoff A (rank ≤ A = Stronger)
              <input
                type="number"
                min={1}
                className="ml-2 w-24 rounded-md border px-2 py-1"
                value={bandCutoffA}
                onChange={(e) => setBandCutoffA(e.target.value)}
              />
            </label>
            {bandMode === "three" && (
              <label className="text-sm">
                Cutoff B (rank ≤ B = Middle)
                <input
                  type="number"
                  min={1}
                  className="ml-2 w-24 rounded-md border px-2 py-1"
                  value={bandCutoffB}
                  onChange={(e) => setBandCutoffB(e.target.value)}
                />
              </label>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={submitting || rowCount === 0}
        onClick={handleSubmit}
      >
        {submitting ? "Processing…" : `Run check (${rowCount} row${rowCount === 1 ? "" : "s"})`}
      </button>
    </main>
  );
}
