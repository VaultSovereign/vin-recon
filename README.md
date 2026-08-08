# VIN Recon

VIN Recon is a buyer due-diligence tool that reconstructs publicly available evidence for a 17-character VIN.

## What it does

- Validates VIN format and check digit
- Decodes vehicle configuration using NHTSA vPIC
- Queries NHTSA recall data
- Searches public/indexable web sources for exact VIN mentions
- Supports manual NICB VINCheck paste import
- Supports manual import of paid report excerpts (NMVTIS/CARFAX/AutoCheck)
- Builds a timeline and risk flags
- Evaluates seller claims as SUPPORTED / CONTRADICTED / NOT ESTABLISHED
- Generates purchase questions
- Exports `vin-recon-[VIN].json` and `vin-recon-[VIN].html`

## Important scope/ethics

- No CAPTCHA bypass
- No authentication or paywall circumvention
- No robots/access-control bypass
- Never labels a vehicle "verified clean" based on missing evidence

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build and lint

```bash
npm run lint
npm run build
```
