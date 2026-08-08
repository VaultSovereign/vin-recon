"use client";

import { useCallback, useEffect, useState } from "react";
import { ReconstructResponse, UserFindingInput } from "@/lib/types";
import ReportView from "./ReportView";

const FINDINGS_STORAGE_KEY = "vin-recon-findings";

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
    /* ignore quota */
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

  // Finding form fields
  const [fSource, setFSource] = useState("Web research");
  const [fUrl, setFUrl] = useState("");
  const [fNote, setFNote] = useState("");
  const [fDamage, setFDamage] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fMileage, setFMileage] = useState("");
  const [fDate, setFDate] = useState("");

  // Deep-link: ?vin=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qVin = (params.get("vin") ?? "").trim().toUpperCase();
    if (qVin.length === 17) {
      setVin(qVin);
      setFindings(loadFindingsForVin(qVin));
    }
  }, []);

  useEffect(() => {
    if (vin.length === 17) {
      setFindings(loadFindingsForVin(vin));
    }
  }, [vin]);

  const persistFindings = useCallback(
    (next: UserFindingInput[]) => {
      setFindings(next);
      if (vin.length === 17) saveFindingsForVin(vin, next);
    },
    [vin]
  );

  function addFinding() {
    if (vin.length !== 17) {
      setError("Enter a valid 17-character VIN before saving a finding.");
      return;
    }
    if (!fNote.trim() && !fUrl.trim() && !fDamage.trim()) {
      setError("Add a note, URL, or damage text for the finding.");
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
    persistFindings(findings.filter((f, i) => (id ? f.id !== id : i !== index)));
  }

  async function handleReconstruct() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const sellerClaims = claimsText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const res = await fetch("/api/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin,
          nicbRawText: nicbText,
          sellerClaims,
          findings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unknown error.");
        return;
      }
      setReport(data as ReconstructResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>VIN Recon</h1>
      <p>
        Reconstruct publicly available vehicle history and configuration information for a 17-character VIN.
      </p>
      <div className="disclaimer">
        This is a buyer due-diligence tool, not a vehicle-history certification service. It never bypasses
        CAPTCHAs, logins, paywalls, or robots restrictions, and it never invents dates, mileage, or history
        that isn&apos;t established by retrieved evidence. Public web is{" "}
        <strong>SEARCH_LEADS_GENERATED</strong> until you save findings.
      </div>

      <div className="vinForm">
        <input
          placeholder="Enter 17-character VIN (e.g. 55SWF4JB6FU077077)"
          value={vin}
          maxLength={17}
          onChange={(e) => setVin(e.target.value.toUpperCase())}
        />
        <button onClick={handleReconstruct} disabled={loading || vin.length !== 17}>
          {loading ? "Reconstructing..." : "RECONSTRUCT"}
        </button>
      </div>

      <details style={{ marginBottom: "1.5rem" }} open={findings.length > 0}>
        <summary>Optional: NICB paste, seller claims &amp; save findings</summary>
        <div style={{ marginTop: "0.75rem" }}>
          <label>
            NICB VINCheck result (paste the text of your manually-run check &mdash; never automated):
            <textarea rows={4} value={nicbText} onChange={(e) => setNicbText(e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <label>
            Seller claims (one per line):
            <textarea rows={3} value={claimsText} onChange={(e) => setClaimsText(e.target.value)} />
          </label>
        </div>

        <div className="findingForm" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Save a finding</h3>
          <p className="meta">
            After you open the search pack (or browser addon) and verify a source yourself, save it here.
            Saved findings become FACT records on reconstruct. Stored in this browser for the VIN.
          </p>
          <div className="findingGrid">
            <label>
              Source label
              <input value={fSource} onChange={(e) => setFSource(e.target.value)} placeholder="Bidfax / listing" />
            </label>
            <label>
              Source URL
              <input value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="https://..." />
            </label>
            <label>
              Event date (YYYY-MM-DD)
              <input value={fDate} onChange={(e) => setFDate(e.target.value)} placeholder="2023-08-19" />
            </label>
            <label>
              Mileage
              <input value={fMileage} onChange={(e) => setFMileage(e.target.value)} placeholder="42881" />
            </label>
            <label>
              Title status
              <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="salvage / clean" />
            </label>
            <label>
              Damage
              <input value={fDamage} onChange={(e) => setFDamage(e.target.value)} placeholder="front-left impact" />
            </label>
          </div>
          <label>
            Note
            <textarea rows={3} value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="What you verified..." />
          </label>
          <button type="button" onClick={addFinding} disabled={vin.length !== 17} style={{ marginTop: "0.5rem" }}>
            Save finding for this VIN
          </button>

          {findings.length > 0 && (
            <ul className="findingsList">
              {findings.map((f, i) => (
                <li key={f.id ?? i}>
                  <strong>{f.sourceLabel ?? "Finding"}</strong>
                  {f.sourceUrl ? (
                    <>
                      {" "}
                      —{" "}
                      <a href={String(f.sourceUrl)} target="_blank" rel="noopener noreferrer">
                        link
                      </a>
                    </>
                  ) : null}
                  <div className="meta">{(f.note || f.damage || "").slice(0, 160)}</div>
                  <button type="button" className="linkish" onClick={() => removeFinding(f.id, i)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {error && <div className="error">{error}</div>}

      {report && <ReportView report={report} />}
    </div>
  );
}
