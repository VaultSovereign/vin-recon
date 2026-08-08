"use client";

import { ReconstructResponse } from "@/lib/types";
import { buildVinSearchLeads } from "@/lib/adapters/searchDiscovery";
import { buildHtmlReport } from "@/lib/engine/htmlExport";

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportView({ report }: { report: ReconstructResponse }) {
  const leads = buildVinSearchLeads(report.vin);

  return (
    <div>
      <div className="exportButtons">
        <button onClick={() => downloadFile(`vin-recon-${report.vin}.json`, JSON.stringify(report, null, 2), "application/json")}>
          Export JSON
        </button>
        <button onClick={() => downloadFile(`vin-recon-${report.vin}.html`, buildHtmlReport(report), "text/html")}>
          Export HTML
        </button>
      </div>

      <section>
        <h2>1. Vehicle Identity</h2>
        <table>
          <tbody>
            <tr><th>VIN</th><td>{report.identity.vin}</td></tr>
            <tr><th>Make</th><td>{report.identity.make ?? "UNKNOWN"}</td></tr>
            <tr><th>Model</th><td>{report.identity.model ?? "UNKNOWN"}</td></tr>
            <tr><th>Model Year</th><td>{report.identity.modelYear ?? "UNKNOWN"}</td></tr>
            <tr><th>Engine</th><td>{report.identity.engine || "UNKNOWN"}</td></tr>
            <tr><th>Drivetrain</th><td>{report.identity.drivetrain ?? "UNKNOWN"}</td></tr>
            <tr><th>Body</th><td>{report.identity.body ?? "UNKNOWN"}</td></tr>
            <tr><th>Manufacturer</th><td>{report.identity.manufacturer ?? "UNKNOWN"}</td></tr>
            <tr>
              <th>Assembly Plant</th>
              <td>{[report.identity.plantCity, report.identity.plantCountry].filter(Boolean).join(", ") || "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Check Digit</th>
              <td>
                {report.identity.checkDigit.valid ? "VALID" : "INVALID / NOT APPLICABLE"} &mdash; {report.identity.checkDigit.reason}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>2. Factory / Technical Data</h2>
        <h3>Recalls ({report.recalls.length})</h3>
        {report.recalls.length === 0 ? (
          <p>No recalls found for the decoded make/model/year, or recall lookup could not be performed.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Campaign</th><th>Component</th><th>Summary</th><th>Report Date</th></tr>
            </thead>
            <tbody>
              {report.recalls.map((r, i) => (
                <tr key={i}>
                  <td>{r.campaignNumber}</td>
                  <td>{r.component}</td>
                  <td>{r.summary}</td>
                  <td>{r.reportReceivedDate ?? "UNKNOWN"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>3. Public History Signals</h2>
        <p>
          The following public search leads were generated for the exact VIN. These links are not
          automatically scraped (to respect CAPTCHAs, robots.txt, and access controls) &mdash; open
          each one and manually record any findings.
        </p>
        <ul className="linkList">
          {leads.map((lead) => (
            <li key={lead.url}>
              <a href={lead.url} target="_blank" rel="noopener noreferrer">
                {lead.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>4. Timeline</h2>
        {report.timeline.length === 0 ? (
          <p>No dated evidence retrieved. No dates or mileage have been invented.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Source</th><th>Location</th><th>Mileage</th><th>Event</th><th>Evidence</th><th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {report.timeline.map((t, i) => (
                <tr key={i}>
                  <td>{t.date}</td>
                  <td>{t.source}</td>
                  <td>{t.location ?? "UNKNOWN"}</td>
                  <td>{t.mileage !== null ? `${t.mileage} ${t.mileageUnit ?? ""}` : "UNKNOWN"}</td>
                  <td>{t.event}</td>
                  <td>{t.evidenceUrl ? <a href={t.evidenceUrl} target="_blank" rel="noopener noreferrer">link</a> : "—"}</td>
                  <td>{t.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>5. Damage / Auction Evidence</h2>
        <p>
          No structured auction/damage evidence has been automatically ingested. Use the public
          history leads above or import a NICB VINCheck result to add evidence here.
        </p>
      </section>

      <section>
        <h2>6. Risk Flags</h2>
        <table>
          <thead>
            <tr><th>Level</th><th>Title</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {report.riskFlags.map((f) => (
              <tr key={f.id}>
                <td><span className={`badge badge-${f.level}`}>{f.level}</span></td>
                <td>{f.title}</td>
                <td>{f.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>7. Seller Claim Check</h2>
        {report.claimResults.length === 0 ? (
          <p>No seller claims were supplied for verification.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Claim</th><th>Verdict</th><th>Evidence</th><th>Source</th></tr>
            </thead>
            <tbody>
              {report.claimResults.map((c, i) => (
                <tr key={i}>
                  <td>{c.claim}</td>
                  <td>{c.verdict}</td>
                  <td>{c.evidence}</td>
                  <td>{c.source ? <a href={c.source} target="_blank" rel="noopener noreferrer">link</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>8. Purchase Questions</h2>
        <ol>
          {report.purchaseQuestions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Raw Evidence Records</h2>
        <table>
          <thead>
            <tr><th>Source</th><th>Type</th><th>Category</th><th>Confidence</th><th>URL</th><th>Excerpt</th></tr>
          </thead>
          <tbody>
            {report.records.map((r, i) => (
              <tr key={i}>
                <td>{r.source}</td>
                <td>{r.event_type}</td>
                <td>{r.evidence_type}</td>
                <td>{r.confidence}</td>
                <td>{r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer">link</a> : "—"}</td>
                <td>{(r.raw_excerpt ?? "").slice(0, 200)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
