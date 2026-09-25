export type BandMode = "disabled" | "two" | "three";
export type Band = "Stronger" | "Middle" | "Weaker";

export function computeBand(
  rank: number | null,
  mode: BandMode,
  cutoffA: number | null,
  cutoffB: number | null
): Band | null {
  if (mode === "disabled" || rank == null) return null;
  if (mode === "two") {
    if (cutoffA == null) return null;
    return rank <= cutoffA ? "Stronger" : "Weaker";
  }
  if (cutoffA == null || cutoffB == null) return null;
  if (rank <= cutoffA) return "Stronger";
  if (rank <= cutoffB) return "Middle";
  return "Weaker";
}

export function bandRuleLabel(mode: BandMode, cutoffA: number | null, cutoffB: number | null): string {
  if (mode === "disabled") return "disabled";
  if (mode === "two") return `two-band (stronger <= ${cutoffA})`;
  return `three-band (stronger <= ${cutoffA}, middle <= ${cutoffB})`;
}
