# VIN Recon browser addon (MV3)

Privacy-first companion for [VIN Recon](../../README.md):

1. **Detect** 17-character VINs on the current page  
2. **Open a privacy search pack** (Startpage / Brave / DDG + Bidfax / Copart / IAAI / NICB)  
3. **Save findings** you personally verified  
4. **Reconstruct** via your local/deployed API with those findings as FACT records  

Google search tabs are **opt-in only**. Nothing is scraped; CAPTCHA sites (NICB, etc.) stay manual.

## Install (Chrome / Chromium / Brave / Edge)

1. Run the VIN Recon app: `npm run dev` (default `http://localhost:3000`).
2. Open `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select this folder: `extensions/vin-recon`.
4. Open the addon **Options** and set **App base URL** if not localhost.

Firefox: use temporary add-on load from `about:debugging` (MV3 support varies by version).

## Usage

1. Open a listing page (AutoScout, Mobile.de, Facebook Marketplace, etc.).
2. Click the VIN Recon icon → **Re-scan page** if needed.
3. **Open privacy search pack** (opens tabs; review each yourself).
4. **Save finding** for anything you verified (URL, damage, mileage, note).
5. **RECONSTRUCT now** (API) or **Open in VIN Recon app**.

## Privacy

- Default pack avoids Google.
- No VIN telemetry; findings stay in `chrome.storage.local` on your machine.
- Reconstruct only calls the app base URL you configure.

## Sync note

`lib/searchPack.js` mirrors `src/lib/engine/searchPack.ts` — update both when changing pack URLs.
