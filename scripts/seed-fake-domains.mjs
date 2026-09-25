// Seeds a fake "active" Common Crawl-style release for local testing only.
// Run with: node scripts/seed-fake-domains.mjs   (requires Node >=22, .env.local)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const RELEASE_ID = "FAKE-CC-MAIN-2026-01";

const KNOWN_DOMAINS = [
  "wikipedia.org", "google.com", "github.com", "youtube.com", "facebook.com",
  "amazon.com", "twitter.com", "apple.com", "microsoft.com", "anthropic.com",
  "example.com", "example.co.uk", "bbc.co.uk", "nytimes.com", "reddit.com",
];

function randomDomain(i) {
  const tlds = ["com", "net", "org", "io", "co"];
  return `fake-domain-${i}.${tlds[i % tlds.length]}`;
}

async function main() {
  const { data: existing } = await db.from("hc_releases").select("id").eq("release_id", RELEASE_ID).maybeSingle();
  let releaseId = existing?.id;

  if (!releaseId) {
    const { data: release, error } = await db
      .from("hc_releases")
      .insert({
        release_id: RELEASE_ID,
        crawl_window: "Jan 2026 (synthetic test data)",
        source_url: "https://commoncrawl.org/web-graphs",
        status: "active",
        domain_rules_version: "public-suffix-list-fake-v1",
        row_count: KNOWN_DOMAINS.length + 200,
        activated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    releaseId = release.id;
    console.log("Created release", RELEASE_ID, releaseId);
  } else {
    console.log("Reusing existing release", RELEASE_ID, releaseId);
  }

  const domains = [
    ...KNOWN_DOMAINS.map((domain, i) => ({
      release_id: releaseId,
      domain,
      hc_score: Number((1 - i * 0.01).toFixed(4)),
      hc_rank: i + 1,
    })),
    ...Array.from({ length: 200 }, (_, i) => ({
      release_id: releaseId,
      domain: randomDomain(i),
      hc_score: Number((0.5 - i * 0.001).toFixed(4)),
      hc_rank: KNOWN_DOMAINS.length + i + 1,
    })),
  ];

  const { error: upsertError } = await db
    .from("hc_domains")
    .upsert(domains, { onConflict: "release_id,domain" });
  if (upsertError) throw upsertError;

  console.log(`Seeded ${domains.length} domains for release ${RELEASE_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
