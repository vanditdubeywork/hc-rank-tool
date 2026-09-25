# HC Rank Tool

Bulk-enrich a list of links with Common Crawl Harmonic Centrality (HC) score and rank per registered domain: upload → score → filter → export CSV. See the product spec for full requirements.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript, Tailwind)
- [Supabase](https://supabase.com) (Postgres + auth) for batches, domain lookup table, and results
- [Vercel](https://vercel.com) for hosting

## Getting started

1. Copy env vars:

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project's Settings → API page.

2. Apply the schema: run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor (or via `supabase db push` once the CLI is linked to the project).

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Data model

- `hc_releases` — one row per prepared Common Crawl domain-ranking release (must be a complete import before it can be marked `active`).
- `hc_domains` — full domain → HC score/rank table for a given release.
- `hc_batches` — one row per uploaded batch, pinned to a single release and classification (band) rule.
- `hc_batch_rows` — one row per accepted input row, in original order, holding the per-row lookup result and status.

## Deploy

```bash
vercel
```

Set the same three Supabase env vars in the Vercel project (Production + Preview).
