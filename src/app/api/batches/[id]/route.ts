import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: batch, error: batchError } = await db.from("hc_batches").select("*").eq("id", id).maybeSingle();
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const { data: release, error: releaseError } = await db
    .from("hc_releases")
    .select("*")
    .eq("id", batch.release_id)
    .single();
  if (releaseError) return NextResponse.json({ error: releaseError.message }, { status: 500 });

  const { data: rows, error: rowsError } = await db
    .from("hc_batch_rows")
    .select("*")
    .eq("batch_id", id)
    .order("input_row_number", { ascending: true });
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  return NextResponse.json({ batch, release, rows });
}
