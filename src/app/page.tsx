"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ReconstructResponse, UserFindingInput } from "@/lib/types";
import ReportView from "./ReportView";

const FINDINGS_STORAGE_KEY = "vin-recon-findings";
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizeVin(value: string): string {
  return value.toUpperCase().replace(/\s/g, "").slice(0, 17);
}

function loadFindingsForVin(vin: string): UserFindingInput[] {
  if (typeof window === "undefined" || !vin) return [];
  try {
    const raw = localStorage.getItem(FINDINGS_STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, UserFindingInput[]>;
    return Array.isArray(all[vin]) ? all[vin] : [];
  } catch {
    return [];
  }
}

function saveFindingsForVin(vin: string, findings: UserFindingInput[]) {
  if (typeof window === "undefined" || !vin) return;
  try {
    const raw = localStorage.getItem(FINDINGS_STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, UserFindingInput[]>) : {};
    all[vin] = findings;
    localStorage.setItem(FINDINGS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* Local storage may be unavailable or full. The current session still works. */
  }
}

export default function Home() {
  const [vin, setVin] = useState("");
  const [nicbText, setNicbText] = useState("");
  const [claimsText, setClaimsText] = useState("");
  const [findings, setFindings] = useState<UserFindingInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReconstructResponse | null>(null);

  const [fSource, setFSource] = useState("Web research");
  const [fUrl, setFUrl] = useState("");
  const [fNote, setFNote] = useState("");
  const [fDamage, setFDamage] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fMileage, setFMileage] = useState("");
  const [fDate, setFDate] = useState("");

  const vinIsValid = VIN_PATTERN.test(vin);
  const claimCount = claimsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
  const optionalInputCount = findings.length + claimCount + (nicbText.trim() ? 1 : 0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const queryVin = normalizeVin(params.get("vin") ?? "");
      if (VIN_PATTERN.test(queryVin)) {
        setVin(queryVin);
        setFindings(loadFindingsForVin(queryVin));
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const persistFindings = useCallback(
    (next: UserFindingInput[]) => {
      setFindings(next);
      if (vinIsValid) saveFindingsForVin(vin, next);
    },
    [vin, vinIsValid]
  );

  function updateVin(rawValue: string) {
    const nextVin = normalizeVin(rawValue);
    setVin(nextVin);
    setReport(null);
    setError(null);
    setFindings(VIN_PATTERN.test(nextVin) ? loadFindingsForVin(nextVin) : []);
  }

  function addFinding() {
    if (!vinIsValid) {
      setError("Enter a valid 17-character VIN before saving a finding.");
      return;
    }
    if (!fNote.trim() && !fUrl.trim() && !fDamage.trim()) {
      setError("Add a note, source URL, or damage description for the finding.");
      return;
    }

    const finding: UserFindingInput = {
      id: `ui-${Date.now()}`,
      sourceLabel: fSource || "Web research",
      sourceUrl: fUrl || null,
      note: fNote,
      damage: fDamage || null,
      titleStatus: fTitle || null,
      mileage: fMileage ? parseInt(fMileage, 10) : null,
      mileageUnit: fMileage ? "km" : null,
      eventDate: fDate || null,
      savedAt: new Date().toISOString(),
      confidence: fUrl ? "MEDIUM" : "LOW",
    };

    persistFindings([...findings, finding]);
    setFNote("");
    setFDamage("");
    setFTitle("");
    setFMileage("");
    setFDate("");
    setError(null);
  }

  function removeFinding(id: string | undefined, index: number) {
    persistFindings(findings.filter((finding, findingIndex) => (id ? finding.id !== id : findingIndex !== index)));
  }

  async function handleReconstruct() {
    if (!vinIsValid) {
      setError("Enter a valid 17-character VIN. VINs do not use the letters I, O, or Q.");
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const sellerClaims = claimsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const response = await fetch("/api/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin,
          nicbRawText: nicbText,
          sellerClaims,
          findings,
        }),
      });
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

      if (!contentType.includes("application/json")) {
        await response.text();
        setError(`The service returned an unexpected response (HTTP ${response.status}). Please try again.`);
        return;
      }

      const data = (await response.json()) as ReconstructResponse & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "The report could not be built.");
        return;
      }

      setReport(data as ReconstructResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleReconstruct();
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="brandRow">
          <span className="wordmark">VIN Recon</span>
          <span className="versionTag">v0.1.3</span>
        </div>
        <h1>Vehicle history evidence, with the gaps left visible.</h1>
        <p className="lede">
          Decode a VIN, check NHTSA recalls, and assemble a source-linked report before you buy.
        </p>
        <ul className="serviceFacts" aria-label="Service facts">
          <li>No account</li>
          <li>No paid API required</li>
          <li>No automated scraping</li>
        </ul>
      </header>

      <section className="lookupPanel" aria-labelledby="lookup-heading">
        <div className="sectionIntro">
          <span className="stepNumber" aria-hidden="true">
            1
          </span>
          <div>
            <h2 id="lookup-heading">Enter the vehicle VIN</h2>
            <p>We will query public US government data and prepare manual research links.</p>
          </div>
        </div>

        <form className="lookupForm" onSubmit={submitLookup} noValidate>
          <label className="inputLabel" htmlFor="vin-input">
            17-character vehicle identification number
          </label>
          <div className="vinForm">
            <input
              id="vin-input"
              name="vin"
              aria-describedby="vin-help"
              aria-invalid={vin.length > 0 && !vinIsValid}
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="go"
              inputMode="text"
              maxLength={17}
              pattern="[A-HJ-NPR-Z0-9]{17}"
              placeholder="Example: 55SWF4JB6FU077077"
              spellCheck={false}
              value={vin}
              onChange={(event) => updateVin(event.target.value)}
            />
            <button className="primaryButton" type="submit" disabled={loading || !vinIsValid}>
              {loading ? "Checking sources…" : "Build report"}
            </button>
          </div>
          <div className="fieldMeta" id="vin-help">
            <span>{vin.length}/17 characters</span>
            <span>VINs do not contain I, O, or Q.</span>
          </div>
        </form>
      </section>

      <aside className="scopeNotice" aria-label="Report scope">
        <strong>What this report means</strong>
        <p>
          It separates retrieved facts, derived signals, seller claims, and unknowns. It is buyer due diligence,
          not a certified vehicle-history report or a guarantee that a vehicle is clean.
        </p>
      </aside>

      <details className="advancedPanel">
        <summary>
          <span>Optional evidence you already have</span>
          <span className="summaryMeta">
            {optionalInputCount > 0
              ? `${optionalInputCount} item${optionalInputCount === 1 ? "" : "s"} ready`
              : "NICB, seller claims, and saved findings"}
          </span>
        </summary>

        <div className="advancedContent">
          <div className="advancedGrid">
            <label className="fieldBlock">
              <span>NICB VINCheck result</span>
              <span className="fieldHelp">Paste the result of a check you ran manually. CAPTCHA checks are never automated.</span>
              <textarea rows={5} value={nicbText} onChange={(event) => setNicbText(event.target.value)} />
            </label>

            <label className="fieldBlock">
              <span>Seller claims</span>
              <span className="fieldHelp">One claim per line, such as “no accidents” or “original mileage”.</span>
              <textarea rows={5} value={claimsText} onChange={(event) => setClaimsText(event.target.value)} />
            </label>
          </div>

          <fieldset className="findingForm">
            <legend>Save a finding you verified</legend>
            <p className="meta">
              Record evidence from a listing, auction page, or search result. Saved findings stay in this browser for
              this VIN and become FACT records in the next report.
            </p>

            <div className="findingGrid">
              <label>
                Source label
                <input value={fSource} onChange={(event) => setFSource(event.target.value)} placeholder="Bidfax or listing" />
              </label>
              <label>
                Source URL
                <input
                  type="url"
                  value={fUrl}
                  onChange={(event) => setFUrl(event.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label>
                Event date
                <input type="date" value={fDate} onChange={(event) => setFDate(event.target.value)} />
              </label>
              <label>
                Mileage (km)
                <input
                  inputMode="numeric"
                  min="0"
                  type="number"
                  value={fMileage}
                  onChange={(event) => setFMileage(event.target.value)}
                  placeholder="42881"
                />
              </label>
              <label>
                Title status
                <input value={fTitle} onChange={(event) => setFTitle(event.target.value)} placeholder="salvage or clean" />
              </label>
              <label>
                Damage
                <input value={fDamage} onChange={(event) => setFDamage(event.target.value)} placeholder="front-left impact" />
              </label>
            </div>

            <label className="fieldBlock">
              <span>Finding note</span>
              <textarea
                rows={3}
                value={fNote}
                onChange={(event) => setFNote(event.target.value)}
                placeholder="What did the source establish?"
              />
            </label>

            <button className="secondaryButton" type="button" onClick={addFinding} disabled={!vinIsValid}>
              Save finding for this VIN
            </button>

            {findings.length > 0 && (
              <ul className="findingsList" aria-label="Saved findings">
                {findings.map((finding, index) => (
                  <li key={finding.id ?? index}>
                    <div>
                      <strong>{finding.sourceLabel ?? "Finding"}</strong>
                      {finding.sourceUrl ? (
                        <>
                          {" · "}
                          <a href={String(finding.sourceUrl)} target="_blank" rel="noopener noreferrer">
                            Open source
                          </a>
                        </>
                      ) : null}
                      <p className="meta">{(finding.note || finding.damage || "No note").slice(0, 160)}</p>
                    </div>
                    <button
                      type="button"
                      className="linkButton"
                      onClick={() => removeFinding(finding.id, index)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>
      </details>

      {error && (
        <div className="error" role="alert">
          <strong>Could not build the report.</strong>
          <span>{error}</span>
        </div>
      )}

      {report && (
        <div className="reportRoot" id="report" aria-live="polite">
          <ReportView report={report} />
        </div>
      )}

      <footer className="siteFooter">
        VIN Recon uses public data and user-supplied evidence. Missing evidence stays marked as unknown.
      </footer>
    </main>
  );
}
