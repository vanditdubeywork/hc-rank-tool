"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import { buildExportRows, type BatchRow, type BatchMeta, type ReleaseMeta } from "@/lib/export";

type SortKey = "hc_rank" | "hc_score" | "input_row_number";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS = [
  "found",
  "invalid_input",
  "unsupported_input",
  "not_found_in_snapshot",
  "lookup_failed",
  "not_processed",
];

function downloadCsv(filename: string, rows: Record<string, string>[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BatchResultsPage() {
  const params = useParams<{ id: string }>();
  const [batch, setBatch] = useState<BatchMeta | null>(null);
  const [release, setRelease] = useState<ReleaseMeta | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bandFilter, setBandFilter] = useState<string>("all");
  const [domainSearch, setDomainSearch] = useState("");
  const [rankMin, setRankMin] = useState("");
  const [rankMax, setRankMax] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("input_row_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch(`/api/batches/${params.id}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load batch");
        setBatch(json.batch);
        setRelease(json.release);
        setRows(json.rows);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load batch"))
      .finally(() => setLoading(false));
  }, [params.id]);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    if (bandFilter !== "all") out = out.filter((r) => r.hc_band === bandFilter);
    if (domainSearch.trim()) {
      const q = domainSearch.trim().toLowerCase();
      out = out.filter((r) => (r.matched_domain ?? "").toLowerCase().includes(q));
    }
    if (rankMin) out = out.filter((r) => r.hc_rank != null && r.hc_rank >= Number(rankMin));
    if (rankMax) out = out.filter((r) => r.hc_rank != null && r.hc_rank <= Number(rankMax));

    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[sortKey === "hc_rank" ? "hc_rank" : sortKey === "hc_score" ? "hc_score" : "input_row_number"];
      const bv = b[sortKey === "hc_rank" ? "hc_rank" : sortKey === "hc_score" ? "hc_score" : "input_row_number"];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // unavailable values sort last regardless of direction
      if (bv == null) return -1;
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [rows, statusFilter, bandFilter, domainSearch, rankMin, rankMax, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleExport(target: "all" | "filtered") {
    if (!batch || !release) return;
    const source = target === "all" ? rows : filtered;
    const exportRows = buildExportRows(source, batch, release);
    downloadCsv(`hc-rank-${batch.id}-${target}.csv`, exportRows);
  }

  if (loading) return <main className="mx-auto max-w-6xl px-6 py-10 text-sm text-neutral-500">Loading…</main>;
  if (error) return <main className="mx-auto max-w-6xl px-6 py-10 text-sm text-red-600">{error}</main>;
  if (!batch || !release) return null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-xl font-semibold">Batch results</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Release {release.release_id} · {release.crawl_window} · {rows.length} total rows
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <select className="rounded-md border px-2 py-1" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="rounded-md border px-2 py-1" value={bandFilter} onChange={(e) => setBandFilter(e.target.value)}>
          <option value="all">All bands</option>
          <option value="Stronger">Stronger</option>
          <option value="Middle">Middle</option>
          <option value="Weaker">Weaker</option>
        </select>
        <input
          className="rounded-md border px-2 py-1"
          placeholder="Search domain…"
          value={domainSearch}
          onChange={(e) => setDomainSearch(e.target.value)}
        />
        <input
          className="w-24 rounded-md border px-2 py-1"
          placeholder="Rank min"
          type="number"
          value={rankMin}
          onChange={(e) => setRankMin(e.target.value)}
        />
        <input
          className="w-24 rounded-md border px-2 py-1"
          placeholder="Rank max"
          type="number"
          value={rankMax}
          onChange={(e) => setRankMax(e.target.value)}
        />
      </div>

      <div className="mt-4 flex gap-3">
        <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white" onClick={() => handleExport("all")}>
          Download all results ({rows.length})
        </button>
        <button className="rounded-md border px-3 py-1.5 text-sm" onClick={() => handleExport("filtered")}>
          Download filtered results ({filtered.length})
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100">
            <tr>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("input_row_number")}>
                Row
              </th>
              <th className="px-3 py-2">Original link</th>
              <th className="px-3 py-2">Matched domain</th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("hc_score")}>
                HC score {sortKey === "hc_score" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("hc_rank")}>
                HC rank {sortKey === "hc_rank" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-3 py-2">Band</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.input_row_number} className="border-t">
                <td className="px-3 py-2">{r.input_row_number}</td>
                <td className="max-w-xs truncate px-3 py-2" title={r.original_link}>
                  {r.original_link}
                </td>
                <td className="px-3 py-2">{r.matched_domain ?? "—"}</td>
                <td className="px-3 py-2">{r.hc_score ?? ""}</td>
                <td className="px-3 py-2">{r.hc_rank ?? ""}</td>
                <td className="px-3 py-2">{r.hc_band ?? ""}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 text-neutral-500">{r.status_detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
