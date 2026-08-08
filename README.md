# VIN Recon

A buyer due-diligence tool that reconstructs publicly available vehicle history and
configuration information for a 17-character VIN. **This is not a vehicle-history
certification service** — it never bypasses CAPTCHAs, logins, paywalls, or robots
restrictions, and it never invents dates, mileage, or history not established by
retrieved evidence.

## What it answers

Not "Is this car good?" but: *What evidence can we reconstruct about this specific
car, what does that evidence actually establish, and what remains unknown?*

## Stack

- Next.js (App Router) + TypeScript
- Cloudflare Workers via the OpenNext adapter
- No accounts, no background workers, no vendor analytics, no paid APIs required

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, enter a 17-character VIN, and click **Build report**.

## Cloudflare deployment

The Worker is configured for the `vin-recon.com` custom domain in `wrangler.jsonc`.

```bash
npm run preview  # build and run in the local Workers runtime
npm run deploy   # build and deploy the Worker + custom domain
```

The Cloudflare zone must already be active and the deployment credential must have
Workers and DNS access for the zone.

## How it works

1. **NHTSA vPIC decode** (`src/lib/adapters/nhtsaVpic.ts`) — free public VIN decoder API.
2. **NHTSA recall resolver** (`src/lib/adapters/nhtsaProductCatalog.ts`,
   `src/lib/adapters/nhtsaRecalls.ts`) — canonicalizes decoded year/make/model against the
   official recall product catalog before lookup. HTTP/body contradictions remain `PARTIAL`.
3. **VIN-specific recall handoff** (`src/lib/adapters/nhtsaVinRecallVerification.ts`) — opens
   NHTSA's official VIN page and records only what the investigator says they observed; the page
   is never scraped.
4. **NHTSA model context** (`src/lib/adapters/nhtsaGovernmentContext.ts`) — aggregates
   year/make/model complaints and links to official investigations and manufacturer
   communications/TSBs. Context is explicitly not treated as this VIN's history.
5. **Public search discovery** (`src/lib/adapters/searchDiscovery.ts`) — generates exact-VIN
   search links (Google/Bing/DuckDuckGo/Copart/IAAI/Bidfax/NICB) for a human to open and
   manually record source observations. It does **not** scrape these sites.
6. **Regional research packs** (`src/lib/engine/searchPack.ts`) — optional Canada, UK, EU, and
   Poland official tools with their extra input requirements left explicit.
7. **NICB VINCheck manual import** (`src/lib/adapters/nicbImport.ts`) — paste the text of a
   VINCheck you ran yourself (CAPTCHA-protected, cannot be automated); it is parsed into
   normalized records.
8. **Paid-report transcription** (`src/lib/adapters/paidReportImport.ts`) — structured manual
   import for a report the user already obtained. No provider is queried or scraped, and VIN
   mismatches are excluded from vehicle evidence.
9. **Engine** (`src/lib/engine/`) — builds a chronological timeline from dated evidence only,
   computes GREEN/AMBER/RED risk flags, checks seller claims against evidence
   (SUPPORTED / CONTRADICTED / NOT_ESTABLISHED), groups corroborating evidence, distinguishes
   mirrors from independent sources, and generates purchase questions.
10. **Proof and service workflow** — each reconstruction is added to a local-only 25-VIN field
    test ledger using a masked VIN plus short SHA-256 fingerprint. A separate quote workflow
    prepares an analyst-review request without charging or sending anything automatically.
11. **Export** — JSON (`vin-recon-[VIN].json`) and portable HTML (`vin-recon-[VIN].html`)
   reports, generated client-side from the same normalized data.

## Adding a new adapter

Adapters are independent modules under `src/lib/adapters/` that return
`NormalizedRecord[]` (see `src/lib/types.ts` for the schema). Wire a new adapter into
`src/lib/engine/reconstruct.ts`.

## Evidence categories

Every record is tagged `FACT`, `OBSERVATION`, `INFERENCE`, `SELLER_CLAIM`, or `UNKNOWN`.
`OBSERVATION` means a user attested that a source or imported report displayed the statement;
VIN Recon did not independently retrieve it. Every normalized record also carries origin,
independence, relationship, and retrieval provenance. `GREEN` risk
flags never mean "verified clean" — only "no adverse evidence found in the sources
checked".

## Evidence coverage vs risk (v0.1.2)

Coverage and risk are separate:

- **`evidenceCoverage`** — per-source state (`SUCCESS | FAILED | NOT_RUN | NOT_PROVIDED | PARTIAL | SEARCH_LEADS_GENERATED`) and top-level completeness (`COMPLETE | PARTIAL | INSUFFICIENT`).
- **`riskLevel` / `riskFlags`** — adverse evidence only.

Hard rules:

1. GREEN is only possible when **all required automatic sources** (NHTSA vPIC + NHTSA recalls) are `SUCCESS` **and** no RED adverse evidence was found.
2. If any required source is `FAILED` / `NOT_RUN` / `PARTIAL`, the report is incomplete and includes AMBER: *"Search incomplete — no conclusion about adverse history."*
3. Public web adapter is always `SEARCH_LEADS_GENERATED` (not automatic search completion).
4. NICB / paid reports show `NOT_PROVIDED` until the user pastes them.
5. Identity has an explicit `identityStatus` (`ESTABLISHED | PARTIAL | UNRESOLVED | CHECK_DIGIT_MISMATCH`) and check-digit **candidates** when the SAE J853 digit fails.

```bash
npm test   # coverage / GREEN-gating / search-pack regression tests
```

## Browser addon + search pack (v0.2.0)

Companion MV3 extension under `extensions/vin-recon/`:

- Detects VINs on listing pages
- Opens a **privacy-first search pack** (Startpage / Brave / DuckDuckGo first; Google opt-in)
- Auction verticals: Bidfax, Copart, IAAI + NICB (manual CAPTCHA)
- **Save observations** → stored locally → sent as provenance-retaining `OBSERVATION` records

```bash
npm run dev
# Chrome → chrome://extensions → Load unpacked → extensions/vin-recon
```

See `extensions/vin-recon/README.md`. The web UI also has **Save observation** and **Open privacy search pack**.

Deep-link: `http://localhost:3000/?vin=YOURVINHERE`

## NMVTIS / CARFAX / AutoCheck

These are optional, paid, external sources. This app does not scrape them. The optional import
form accepts a structured transcription of a report the user purchased independently, checks a
detected VIN when present, and keeps the resulting provider statement distinct from an
automatically retrieved fact. NMVTIS coverage can be incomplete and is not a substitute for an
independent vehicle inspection.

## v0.2.0 field-test rule

The product still has no account or server-side VIN database. The browser-local proof ledger
records source outcomes, report duration, usefulness, return intent, and buying-decision impact
for up to 250 runs. It stores no full VIN and exports a CSV for the 25-real-VIN proof phase.
