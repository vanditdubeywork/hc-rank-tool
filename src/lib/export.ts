import { bandRuleLabel, type BandMode } from "@/lib/bands";

export interface BatchRow {
  input_row_number: number;
  original_link: string;
  extra_columns: Record<string, string>;
  matched_domain: string | null;
  hc_score: number | null;
  hc_rank: number | null;
  hc_band: string | null;
  status: string;
  status_detail: string | null;
  checked_at: string | null;
}

export interface BatchMeta {
  id: string;
  band_mode: BandMode;
  band_cutoff_a: number | null;
  band_cutoff_b: number | null;
}

export interface ReleaseMeta {
  release_id: string;
  crawl_window: string;
  source_url: string;
}

const RESULT_COLUMN_KEYS = [
  "hc_input_row",
  "hc_original_link",
  "hc_matched_domain",
  "hc_score",
  "hc_rank",
  "hc_band",
  "hc_status",
  "hc_status_detail",
  "hc_release_id",
  "hc_crawl_window",
  "hc_source_url",
  "hc_checked_at",
  "hc_band_rule",
  "hc_batch_id",
];

// Excel/Sheets treat a leading =, +, -, or @ as a formula trigger. Prefixing
// with a single quote forces text and is reversible (strip the leading ').
function escapeFormulaCell(value: string): string {
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

export function buildExportRows(rows: BatchRow[], batch: BatchMeta, release: ReleaseMeta): Record<string, string>[] {
  const bandRule = bandRuleLabel(batch.band_mode, batch.band_cutoff_a, batch.band_cutoff_b);

  return rows.map((row) => {
    const out: Record<string, string> = {};

    for (const [key, value] of Object.entries(row.extra_columns ?? {})) {
      out[key] = escapeFormulaCell(String(value ?? ""));
    }

    const resultValues: Record<string, string> = {
      hc_input_row: String(row.input_row_number),
      hc_original_link: row.original_link,
      hc_matched_domain: row.matched_domain ?? "",
      hc_score: row.hc_score == null ? "" : String(row.hc_score),
      hc_rank: row.hc_rank == null ? "" : String(row.hc_rank),
      hc_band: row.hc_band ?? "",
      hc_status: row.status,
      hc_status_detail: row.status_detail ?? "",
      hc_release_id: release.release_id,
      hc_crawl_window: release.crawl_window,
      hc_source_url: release.source_url,
      hc_checked_at: row.checked_at ?? "",
      hc_band_rule: bandRule,
      hc_batch_id: batch.id,
    };

    for (const key of RESULT_COLUMN_KEYS) {
      const target = key in out ? `${key}_result` : key;
      out[target] = escapeFormulaCell(resultValues[key]);
    }

    return out;
  });
}
