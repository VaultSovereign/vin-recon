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
- No accounts, no background workers, no vendor analytics, no paid APIs required

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, enter a 17-character VIN, and click **RECONSTRUCT**.

## How it works

1. **NHTSA vPIC decode** (`src/lib/adapters/nhtsaVpic.ts`) — free public VIN decoder API.
2. **NHTSA recalls** (`src/lib/adapters/nhtsaRecalls.ts`) — free public recall lookup by
   decoded make/model/year.
3. **Public search discovery** (`src/lib/adapters/searchDiscovery.ts`) — generates exact-VIN
   search links (Google/Bing/DuckDuckGo/Copart/IAAI/Bidfax/NICB) for a human to open and
   manually record findings. It does **not** scrape these sites.
4. **NICB VINCheck manual import** (`src/lib/adapters/nicbImport.ts`) — paste the text of a
   VINCheck you ran yourself (CAPTCHA-protected, cannot be automated); it is parsed into
   normalized records.
5. **Engine** (`src/lib/engine/`) — builds a chronological timeline from dated evidence only,
   computes GREEN/AMBER/RED risk flags, checks seller claims against evidence
   (SUPPORTED / CONTRADICTED / NOT_ESTABLISHED), and generates purchase questions.
6. **Export** — JSON (`vin-recon-[VIN].json`) and portable HTML (`vin-recon-[VIN].html`)
   reports, generated client-side from the same normalized data.

## Adding a new adapter

Adapters are independent modules under `src/lib/adapters/` that return
`NormalizedRecord[]` (see `src/lib/types.ts` for the schema). Wire a new adapter into
`src/lib/engine/reconstruct.ts`.

## Evidence categories

Every record is tagged `FACT`, `INFERENCE`, `SELLER_CLAIM`, or `UNKNOWN`. `GREEN` risk
flags never mean "verified clean" — only "no adverse evidence found in the sources
checked".

## Evidence coverage vs risk (v0.1.2)

Coverage and risk are separate:

- **`evidenceCoverage`** — per-source state (`SUCCESS | FAILED | NOT_RUN | NOT_PROVIDED | PARTIAL | SEARCH_LEADS_GENERATED`) and top-level completeness (`COMPLETE | PARTIAL | INSUFFICIENT`).
- **`riskLevel` / `riskFlags`** — adverse findings only.

Hard rules:

1. GREEN is only possible when **all required automatic sources** (NHTSA vPIC + NHTSA recalls) are `SUCCESS` **and** no RED adverse evidence was found.
2. If any required source is `FAILED` / `NOT_RUN` / `PARTIAL`, the report is incomplete and includes AMBER: *"Search incomplete — no conclusion about adverse history."*
3. Public web adapter is always `SEARCH_LEADS_GENERATED` (not automatic search completion).
4. NICB / paid reports show `NOT_PROVIDED` until the user pastes them.
5. Identity has an explicit `identityStatus` (`ESTABLISHED | PARTIAL | UNRESOLVED | CHECK_DIGIT_MISMATCH`) and check-digit **candidates** when the SAE J853 digit fails.

```bash
npm test   # coverage / GREEN-gating / search-pack regression tests
```

## Browser addon + search pack (v0.1.3)

Companion MV3 extension under `extensions/vin-recon/`:

- Detects VINs on listing pages
- Opens a **privacy-first search pack** (Startpage / Brave / DuckDuckGo first; Google opt-in)
- Auction verticals: Bidfax, Copart, IAAI + NICB (manual CAPTCHA)
- **Save findings** → stored locally → sent as FACT records on reconstruct

```bash
npm run dev
# Chrome → chrome://extensions → Load unpacked → extensions/vin-recon
```

See `extensions/vin-recon/README.md`. Web UI also has **Save finding** and **Open privacy search pack**.

Deep-link: `http://localhost:3000/?vin=YOURVINHERE`

## NMVTIS / CARFAX / AutoCheck

These are optional, paid, external sources. This app does not scrape them; support for
importing a report you purchased yourself can be added as another manual-import adapter,
following the same pattern as the NICB importer.
