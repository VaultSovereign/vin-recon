"use client";

import { useState } from "react";
import { ReconstructResponse } from "@/lib/types";
import ReportView from "./ReportView";

export default function Home() {
  const [vin, setVin] = useState("");
  const [nicbText, setNicbText] = useState("");
  const [claimsText, setClaimsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReconstructResponse | null>(null);

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
        body: JSON.stringify({ vin, nicbRawText: nicbText, sellerClaims }),
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
        This is a buyer due-diligence tool, not a vehicle-history certification service. It never
        bypasses CAPTCHAs, logins, paywalls, or robots restrictions, and it never invents dates,
        mileage, or history that isn&apos;t established by retrieved evidence.
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

      <details style={{ marginBottom: "1.5rem" }}>
        <summary>Optional: import NICB VINCheck result &amp; seller claims</summary>
        <div style={{ marginTop: "0.75rem" }}>
          <label>
            NICB VINCheck result (paste the text of your manually-run check &mdash; never automated):
            <textarea rows={5} value={nicbText} onChange={(e) => setNicbText(e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <label>
            Seller claims (one per line, e.g. &quot;accident free&quot;, &quot;first owner&quot;):
            <textarea rows={4} value={claimsText} onChange={(e) => setClaimsText(e.target.value)} />
          </label>
        </div>
      </details>

      {error && <div className="error">{error}</div>}

      {report && <ReportView report={report} />}
    </div>
  );
}
