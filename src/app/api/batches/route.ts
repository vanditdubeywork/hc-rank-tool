import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { analyzeLink } from "@/lib/domain";
import { computeBand, type BandMode } from "@/lib/bands";

const MAX_ROWS = 10000;
const CHUNK_SIZE = 500;

interface InputRow {
  originalLink: string;
  extraColumns?: Record<string, string>;
}

interface CreateBatchBody {
  rows: InputRow[];
  hasHeader: boolean;
  sourceUrlColumn?: string | null;
  bandMode: BandMode;
  bandCutoffA?: number | null;
  bandCutoffB?: number | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateBatchBody;
  const { rows, hasHeader, sourceUrlColumn, bandMode } = body;
  const bandCutoffA = body.bandCutoffA ?? null;
  const bandCutoffB = body.bandCutoffB ?? null;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows submitted" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Batch exceeds the ${MAX_ROWS}-row limit (submitted ${rows.length})` },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  const { data: release, error: releaseError } = await db
    .from("hc_releases")
    .select("*")
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (releaseError) {
    return NextResponse.json({ error: releaseError.message }, { status: 500 });
  }
  if (!release) {
    return NextResponse.json(
      { error: "No complete Common Crawl release is ready yet. Setup is in progress." },
      { status: 409 }
    );
  }

  const { data: batch, error: batchError } = await db
    .from("hc_batches")
    .insert({
      release_id: release.id,
      status: "processing",
      total_rows: rows.length,
      processed_rows: 0,
      has_header: hasHeader,
      source_url_column: sourceUrlColumn ?? null,
      band_mode: bandMode,
      band_cutoff_a: bandCutoffA,
      band_cutoff_b: bandCutoffB,
    })
    .select("*")
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: batchError?.message ?? "Failed to create batch" }, { status: 500 });
  }

  const analyzed = rows.map((row, i) => ({
    inputRowNumber: i + 1,
    originalLink: row.originalLink ?? "",
    extraColumns: row.extraColumns ?? {},
    analysis: analyzeLink(row.originalLink ?? ""),
  }));

  const uniqueDomains = Array.from(
    new Set(analyzed.filter((r) => r.analysis.ok).map((r) => (r.analysis as { matchedDomain: string }).matchedDomain))
  );

  const domainMap = new Map<string, { hc_score: number; hc_rank: number }>();
  for (const domainChunk of chunk(uniqueDomains, CHUNK_SIZE)) {
    if (domainChunk.length === 0) continue;
    const { data: found, error: lookupError } = await db
      .from("hc_domains")
      .select("domain, hc_score, hc_rank")
      .eq("release_id", release.id)
      .in("domain", domainChunk);
    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    for (const d of found ?? []) domainMap.set(d.domain, { hc_score: d.hc_score, hc_rank: d.hc_rank });
  }

  const checkedAt = new Date().toISOString();
  const batchRows = analyzed.map((r) => {
    if (!r.analysis.ok) {
      return {
        batch_id: batch.id,
        input_row_number: r.inputRowNumber,
        original_link: r.originalLink,
        extra_columns: r.extraColumns,
        matched_domain: null,
        hc_score: null,
        hc_rank: null,
        hc_band: null,
        status: r.analysis.status,
        status_detail: r.analysis.detail,
        checked_at: checkedAt,
      };
    }
    const domain = r.analysis.matchedDomain;
    const hit = domainMap.get(domain);
    if (!hit) {
      return {
        batch_id: batch.id,
        input_row_number: r.inputRowNumber,
        original_link: r.originalLink,
        extra_columns: r.extraColumns,
        matched_domain: domain,
        hc_score: null,
        hc_rank: null,
        hc_band: null,
        status: "not_found_in_snapshot",
        status_detail: "Domain not present in this release",
        checked_at: checkedAt,
      };
    }
    const band = computeBand(hit.hc_rank, bandMode, bandCutoffA, bandCutoffB);
    return {
      batch_id: batch.id,
      input_row_number: r.inputRowNumber,
      original_link: r.originalLink,
      extra_columns: r.extraColumns,
      matched_domain: domain,
      hc_score: hit.hc_score,
      hc_rank: hit.hc_rank,
      hc_band: band,
      status: "found",
      status_detail: null,
      checked_at: checkedAt,
    };
  });

  for (const rowChunk of chunk(batchRows, CHUNK_SIZE)) {
    const { error: insertError } = await db.from("hc_batch_rows").insert(rowChunk);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const hasErrors = batchRows.some((r) =>
    ["invalid_input", "unsupported_input", "not_found_in_snapshot", "lookup_failed"].includes(r.status)
  );

  const { error: updateError } = await db
    .from("hc_batches")
    .update({
      status: hasErrors ? "completed_with_errors" : "completed",
      processed_rows: rows.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batch.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ batchId: batch.id });
}
