"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  MileageUnit,
  PaidReportInput,
  ReconstructResponse,
  ResearchRegion,
  SourceRelationship,
  UserFindingInput,
  VinRecallVerificationStatus,
} from "@/lib/types";
import ReportView from "./ReportView";
import FieldTestPanel from "./FieldTestPanel";
import AnalystReview from "./AnalystReview";

const FINDINGS_STORAGE_KEY = "vin-recon-findings";
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizeVin(value: string): string {
  return value.toUpperCase().replace(/\s/g, "").slice(0, 17);
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 2000) : null;
  } catch {
    return null;
  }
}

function loadFindingsForVin(vin: string): UserFindingInput[] {
  if (typeof window === "undefined" || !vin) return [];
  try {
    const raw = localStorage.getItem(FINDINGS_STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, UserFindingInput[]>;
    return Array.isArray(all[vin])
      ? all[vin].slice(0, 50).map((observation) => ({
          ...observation,
          sourceUrl: safeHttpUrl(observation.sourceUrl),
        }))
      : [];
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
  const [researchRegions, setResearchRegions] = useState<ResearchRegion[]>(["US"]);
  const [vinRecallStatus, setVinRecallStatus] = useState<VinRecallVerificationStatus>("NOT_CHECKED");
  const [vinRecallNote, setVinRecallNote] = useState("");
  const [paidReport, setPaidReport] = useState<PaidReportInput>({ providerKind: "OTHER" });

  const [fSource, setFSource] = useState("Web research");
  const [fUrl, setFUrl] = useState("");
  const [fNote, setFNote] = useState("");
  const [fDamage, setFDamage] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fMileage, setFMileage] = useState("");
  const [fDate, setFDate] = useState("");
  const [fUnit, setFUnit] = useState<MileageUnit>("km");
  const [fLocation, setFLocation] = useState("");
  const [fExcerpt, setFExcerpt] = useState("");
  const [fOrigin, setFOrigin] = useState("");
  const [fRelationship, setFRelationship] = useState<SourceRelationship>("UNKNOWN");
  const [fEventType, setFEventType] = useState("listing_observation");

  const vinIsValid = VIN_PATTERN.test(vin);
  const claimCount = claimsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
  const paidReportProvided = Boolean(
    paidReport.provider ||
      paidReport.rawText ||
      paidReport.sourceExcerpt ||
      paidReport.titleStatus ||
      paidReport.damage ||
      paidReport.mileage
  );
  const optionalInputCount =
    findings.length +
    claimCount +
    (nicbText.trim() ? 1 : 0) +
    (paidReportProvided ? 1 : 0) +
    (vinRecallStatus !== "NOT_CHECKED" ? 1 : 0);

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
      setError("Enter a valid 17-character VIN before saving an observation.");
      return;
    }
    if (!fNote.trim() && !fExcerpt.trim() && !fUrl.trim() && !fDamage.trim()) {
      setError("Add a source excerpt, note, source URL, or damage description for the observation.");
      return;
    }

    const sourceUrl = safeHttpUrl(fUrl);
    const finding: UserFindingInput = {
      id: `ui-${Date.now()}`,
      sourceLabel: fSource || "Web research",
      sourceUrl,
      note: fNote,
      damage: fDamage || null,
      titleStatus: fTitle || null,
      mileage: fMileage ? parseInt(fMileage, 10) : null,
      mileageUnit: fMileage ? fUnit : null,
      eventDate: fDate || null,
      location: fLocation || null,
      savedAt: new Date().toISOString(),
      confidence: sourceUrl ? "MEDIUM" : "LOW",
      sourceExcerpt: fExcerpt || null,
      sourceOrigin: fOrigin || null,
      sourceRelationship: fRelationship,
      eventType: fEventType,
    };

    persistFindings([...findings, finding]);
    setFNote("");
    setFDamage("");
    setFTitle("");
    setFMileage("");
    setFDate("");
    setFLocation("");
    setFExcerpt("");
    setError(null);
  }

  function removeFinding(id: string | undefined, index: number) {
    persistFindings(findings.filter((finding, findingIndex) => (id ? finding.id !== id : findingIndex !== index)));
  }

  function toggleRegion(region: Exclude<ResearchRegion, "US">, enabled: boolean) {
    setResearchRegions((current) =>
      enabled ? [...new Set([...current, region])] : current.filter((item) => item !== region)
    );
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
          paidReports: paidReportProvided
            ? [
                {
                  ...paidReport,
                  id: "web-paid-report-1",
                  purchasedAt: paidReport.purchasedAt || new Date().toISOString(),
                },
              ]
            : [],
          vinRecallVerification: {
            status: vinRecallStatus,
            checkedAt: vinRecallStatus === "NOT_CHECKED" ? null : new Date().toISOString(),
            note: vinRecallNote,
          },
          researchRegions,
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
          <span className="versionTag">v0.2.0</span>
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
          It separates retrieved facts, source observations, derived signals, seller claims, and unknowns. It
          is buyer due diligence, not a certified vehicle-history report or a guarantee that a vehicle is clean.
        </p>
      </aside>

      <details className="advancedPanel">
        <summary>
          <span>Optional evidence you already have</span>
          <span className="summaryMeta">
            {optionalInputCount > 0
              ? `${optionalInputCount} item${optionalInputCount === 1 ? "" : "s"} ready`
              : "NICB, seller claims, and source observations"}
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

          <fieldset className="findingForm compactFieldset">
            <legend>Research regions</legend>
            <p className="meta">
              US sources always run. Additional regions generate official, human-operated links with their input
              requirements left explicit; they do not imply global history coverage.
            </p>
            <div className="checkboxGrid">
              <label className="checkboxLabel">
                <input type="checkbox" checked disabled /> US
              </label>
              {(["CA", "UK", "EU", "PL"] as const).map((region) => (
                <label className="checkboxLabel" key={region}>
                  <input
                    type="checkbox"
                    checked={researchRegions.includes(region)}
                    onChange={(event) => toggleRegion(region, event.target.checked)}
                  />
                  {region === "CA" ? "Canada" : region === "PL" ? "Poland" : region}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="findingForm compactFieldset">
            <legend>NHTSA VIN-specific recall result</legend>
            <p className="meta">
              The automatic API result is model-level. Open the official VIN page, inspect it yourself, and record
              what it displayed. VIN Recon never scrapes this page.
            </p>
            <div className="findingGrid">
              <label>
                Observed result
                <select
                  value={vinRecallStatus}
                  onChange={(event) => setVinRecallStatus(event.target.value as VinRecallVerificationStatus)}
                >
                  <option value="NOT_CHECKED">Not checked</option>
                  <option value="NO_OPEN_RECALLS_OBSERVED">No open recalls observed</option>
                  <option value="OPEN_RECALLS_OBSERVED">Open recall(s) observed</option>
                  <option value="RESULT_UNAVAILABLE">Result unavailable</option>
                </select>
              </label>
              <label className="wideField">
                Investigator note
                <input
                  value={vinRecallNote}
                  onChange={(event) => setVinRecallNote(event.target.value)}
                  placeholder="Optional exact wording or campaign reference"
                />
              </label>
            </div>
            {vinIsValid ? (
              <a
                href={`https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open official NHTSA VIN recall check
              </a>
            ) : (
              <span className="meta">Enter a valid VIN to open the official check.</span>
            )}
          </fieldset>

          <fieldset className="findingForm compactFieldset">
            <legend>Import a report you obtained</legend>
            <p className="meta">
              Structured transcription only. VIN Recon does not buy, query, scrape, or retain provider reports.
              Paste the report text only for VIN matching, then transcribe the exact relevant excerpt and fields.
            </p>
            <div className="findingGrid">
              <label>
                Provider
                <input
                  value={paidReport.provider ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, provider: event.target.value })}
                  placeholder="Provider name"
                />
              </label>
              <label>
                Provider type
                <select
                  value={paidReport.providerKind ?? "OTHER"}
                  onChange={(event) =>
                    setPaidReport({
                      ...paidReport,
                      providerKind: event.target.value as PaidReportInput["providerKind"],
                    })
                  }
                >
                  <option value="OTHER">Other / not specified</option>
                  <option value="NMVTIS_APPROVED">NMVTIS approved provider</option>
                  <option value="CARFAX">CARFAX</option>
                  <option value="AUTOCHECK">AutoCheck</option>
                </select>
              </label>
              <label>
                Report date
                <input
                  type="date"
                  value={paidReport.reportDate ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, reportDate: event.target.value })}
                />
              </label>
              <label>
                Event date
                <input
                  type="date"
                  value={paidReport.eventDate ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, eventDate: event.target.value })}
                />
              </label>
              <label>
                Mileage
                <input
                  type="number"
                  min="0"
                  value={String(paidReport.mileage ?? "")}
                  onChange={(event) => setPaidReport({ ...paidReport, mileage: event.target.value })}
                />
              </label>
              <label>
                Mileage unit
                <select
                  value={paidReport.mileageUnit ?? "mi"}
                  onChange={(event) =>
                    setPaidReport({ ...paidReport, mileageUnit: event.target.value as MileageUnit })
                  }
                >
                  <option value="mi">miles</option>
                  <option value="km">kilometres</option>
                </select>
              </label>
              <label>
                Title status
                <input
                  value={paidReport.titleStatus ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, titleStatus: event.target.value })}
                />
              </label>
              <label>
                Damage / total-loss statement
                <input
                  value={paidReport.damage ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, damage: event.target.value })}
                />
              </label>
              <label>
                Location
                <input
                  value={paidReport.location ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, location: event.target.value })}
                />
              </label>
            </div>
            <div className="advancedGrid noTopPadding">
              <label className="fieldBlock">
                <span>Report text for VIN matching</span>
                <textarea
                  rows={4}
                  value={paidReport.rawText ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, rawText: event.target.value })}
                />
              </label>
              <label className="fieldBlock">
                <span>Exact relevant source excerpt</span>
                <textarea
                  rows={4}
                  value={paidReport.sourceExcerpt ?? ""}
                  onChange={(event) => setPaidReport({ ...paidReport, sourceExcerpt: event.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="findingForm">
            <legend>Save a source observation</legend>
            <p className="meta">
              Record what a listing, auction page, or search result displayed. It stays in this browser for this VIN
              and enters the next report as a user-attested OBSERVATION, never as an automatically retrieved FACT.
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
                Underlying original source
                <input
                  value={fOrigin}
                  onChange={(event) => setFOrigin(event.target.value)}
                  placeholder="Copart, DMV, seller…"
                />
              </label>
              <label>
                Source relationship
                <select
                  value={fRelationship}
                  onChange={(event) => setFRelationship(event.target.value as SourceRelationship)}
                >
                  <option value="UNKNOWN">Unknown</option>
                  <option value="ORIGINAL">Original source</option>
                  <option value="SYNDICATED">Mirror / syndicated copy</option>
                </select>
              </label>
              <label>
                Event type
                <select value={fEventType} onChange={(event) => setFEventType(event.target.value)}>
                  <option value="listing_observation">Listing</option>
                  <option value="auction_observation">Auction</option>
                  <option value="title_observation">Title / brand</option>
                  <option value="odometer_observation">Odometer</option>
                  <option value="damage_observation">Damage</option>
                  <option value="service_observation">Service</option>
                  <option value="registration_observation">Registration</option>
                  <option value="other_observation">Other</option>
                </select>
              </label>
              <label>
                Event date
                <input type="date" value={fDate} onChange={(event) => setFDate(event.target.value)} />
              </label>
              <label>
                Mileage
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
                Mileage unit
                <select value={fUnit} onChange={(event) => setFUnit(event.target.value as MileageUnit)}>
                  <option value="km">kilometres</option>
                  <option value="mi">miles</option>
                </select>
              </label>
              <label>
                Title status
                <input value={fTitle} onChange={(event) => setFTitle(event.target.value)} placeholder="salvage or clean" />
              </label>
              <label>
                Damage
                <input value={fDamage} onChange={(event) => setFDamage(event.target.value)} placeholder="front-left impact" />
              </label>
              <label>
                Location
                <input value={fLocation} onChange={(event) => setFLocation(event.target.value)} placeholder="City, country" />
              </label>
            </div>

            <div className="advancedGrid noTopPadding">
              <label className="fieldBlock">
                <span>Exact source excerpt</span>
                <textarea
                  rows={3}
                  value={fExcerpt}
                  onChange={(event) => setFExcerpt(event.target.value)}
                  placeholder="Copy the exact relevant wording shown by the source."
                />
              </label>
              <label className="fieldBlock">
                <span>Investigator note</span>
                <textarea
                  rows={3}
                  value={fNote}
                  onChange={(event) => setFNote(event.target.value)}
                  placeholder="Your interpretation or follow-up note, kept separate from the excerpt."
                />
              </label>
            </div>

            <button className="secondaryButton" type="button" onClick={addFinding} disabled={!vinIsValid}>
              Save observation for this VIN
            </button>

            {findings.length > 0 && (
              <ul className="findingsList" aria-label="Saved source observations">
                {findings.map((finding, index) => (
                  <li key={finding.id ?? index}>
                    <div>
                      <strong>{finding.sourceLabel ?? "Observation"}</strong>
                      {finding.sourceUrl ? (
                        <>
                          {" · "}
                          <a href={String(finding.sourceUrl)} target="_blank" rel="noopener noreferrer">
                            Open source
                          </a>
                        </>
                      ) : null}
                      <p className="meta">
                        {(finding.sourceExcerpt || finding.note || finding.damage || "No note").slice(0, 160)}
                      </p>
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
          <FieldTestPanel report={report} />
          <AnalystReview report={report} />
        </div>
      )}

      <footer className="siteFooter">
        VIN Recon uses public data and user-supplied evidence. Missing evidence stays marked as unknown.
      </footer>
    </main>
  );
}
