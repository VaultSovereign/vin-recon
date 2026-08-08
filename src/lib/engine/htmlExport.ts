// Portable, human-readable HTML export of a reconstruction report.
import { ReconstructResponse, RiskFlagLevel, SourceCoverageState } from "../types";
import { formatCoverageMatrix } from "./evidenceCoverage";

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function levelColor(level: RiskFlagLevel): string {
  if (level === "RED") return "#c0392b";
  if (level === "AMBER") return "#d68910";
  return "#1e8449";
}

function coverageColor(state: SourceCoverageState): string {
  if (state === "SUCCESS") return "#1e8449";
  if (state === "FAILED" || state === "NOT_RUN") return "#c0392b";
  return "#d68910";
}

export function buildHtmlReport(report: ReconstructResponse): string {
  const {
    vin,
    queryTimeUtc,
    identity,
    riskLevel,
    evidenceCoverage,
    recalls,
    records,
    timeline,
    riskFlags,
    claimResults,
    purchaseQuestions,
    sourcesQueried,
    parserVersion,
  } = report;

  const candidatesHtml =
    identity.checkDigit.candidates.length > 0
      ? `<tr><th>Check-digit candidates</th><td><ul>${identity.checkDigit.candidates
          .map((c) => `<li><code>${esc(c)}</code></li>`)
          .join("")}</ul><p class="meta">Possible alternate forms if mistyped — not proven correct.</p></td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>VIN Recon Report - ${esc(vin)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; color: #1a1a1a; max-width: 960px; }
  h1, h2 { border-bottom: 2px solid #ddd; padding-bottom: 0.3rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
  th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; font-size: 0.9rem; vertical-align: top; }
  th { background: #f2f2f2; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; color: white; font-weight: bold; font-size: 0.85rem; }
  .disclaimer { background: #fff8e1; border: 1px solid #f0d060; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; }
  .meta { color: #666; font-size: 0.85rem; }
  a { color: #1a5276; }
  code { background: #f2f2f2; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
</head>
<body>
<h1>VIN Recon Report</h1>
<p class="meta">VIN <code>${esc(vin)}</code> &middot; Generated ${esc(queryTimeUtc)} &middot; Parser ${esc(parserVersion)}</p>
<div class="disclaimer">
  This is a buyer due-diligence reconstruction, not a vehicle-history certification.
  <strong>Coverage</strong> (whether sources ran) is separate from <strong>risk</strong> (what was found).
  GREEN never means "verified clean" — only that required automatic sources succeeded and no adverse
  evidence was found in those sources. Absence of evidence is not evidence of absence.
</div>

<h2>Evidence coverage &amp; risk</h2>
<table>
  <tr><th>Completeness</th><td><span class="badge" style="background:${
    evidenceCoverage.completeness === "COMPLETE" ? "#1e8449" : evidenceCoverage.completeness === "PARTIAL" ? "#d68910" : "#c0392b"
  }">${esc(evidenceCoverage.completeness)}</span></td></tr>
  <tr><th>Risk level</th><td><span class="badge" style="background:${levelColor(riskLevel)}">${esc(riskLevel)}</span></td></tr>
  <tr><th>GREEN eligible</th><td>${evidenceCoverage.greenEligible ? "yes" : "no"}</td></tr>
  <tr><th>Summary</th><td>${esc(evidenceCoverage.summary)}</td></tr>
  <tr><th>Matrix</th><td><code>${esc(formatCoverageMatrix(evidenceCoverage))}</code></td></tr>
</table>
<table>
  <tr><th>Source</th><th>State</th><th>Required</th><th>Detail</th></tr>
${evidenceCoverage.sources
  .map(
    (s) =>
      `<tr><td>${esc(s.label)}</td><td><span class="badge" style="background:${coverageColor(s.state)}">${esc(
        s.state
      )}</span></td><td>${s.required ? "yes" : "no"}</td><td>${esc(s.detail ?? "")}${
        s.error ? " (" + esc(s.error) + ")" : ""
      }</td></tr>`
  )
  .join("\n")}
</table>

<h2>1. Vehicle Identity</h2>
<table>
  <tr><th>Identity status</th><td><strong>${esc(identity.identityStatus)}</strong> — ${esc(identity.identityStatusDetail)}</td></tr>
  <tr><th>VIN</th><td>${esc(identity.vin)}</td></tr>
  <tr><th>Make</th><td>${esc(identity.make) || "UNKNOWN"}</td></tr>
  <tr><th>Model</th><td>${esc(identity.model) || "UNKNOWN"}</td></tr>
  <tr><th>Model Year</th><td>${esc(identity.modelYear) || "UNKNOWN"}</td></tr>
  <tr><th>Engine</th><td>${esc(identity.engine) || "UNKNOWN"}</td></tr>
  <tr><th>Drivetrain</th><td>${esc(identity.drivetrain) || "UNKNOWN"}</td></tr>
  <tr><th>Body</th><td>${esc(identity.body) || "UNKNOWN"}</td></tr>
  <tr><th>Manufacturer</th><td>${esc(identity.manufacturer) || "UNKNOWN"}</td></tr>
  <tr><th>Assembly Plant</th><td>${esc([identity.plantCity, identity.plantCountry].filter(Boolean).join(", ")) || "UNKNOWN"}</td></tr>
  <tr><th>Check Digit</th><td>${identity.checkDigit.valid ? "VALID" : "INVALID/NOT APPLICABLE"} - ${esc(identity.checkDigit.reason)}</td></tr>
  ${candidatesHtml}
</table>

<h2>2. Recalls</h2>
${
  recalls.length === 0
    ? "<p>No recalls found for the decoded make/model/year, or recall lookup could not be performed.</p>"
    : `<table><tr><th>Campaign</th><th>Component</th><th>Summary</th><th>Report Date</th></tr>
  ${recalls
    .map(
      (r) =>
        `<tr><td>${esc(r.campaignNumber)}</td><td>${esc(r.component)}</td><td>${esc(r.summary)}</td><td>${esc(r.reportReceivedDate)}</td></tr>`
    )
    .join("\n")}
  </table>`
}

<h2>3. Public history signals</h2>
<p><strong>SEARCH_LEADS_GENERATED</strong> (not SEARCH_COMPLETED). Links were generated for human review; no pages were scraped.</p>

<h2>4. Timeline</h2>
${
  timeline.length === 0
    ? "<p>No dated evidence retrieved. No dates or mileage have been invented.</p>"
    : `<table><tr><th>Date</th><th>Source</th><th>Location</th><th>Mileage</th><th>Event</th><th>Evidence</th><th>Confidence</th></tr>
  ${timeline
    .map(
      (t) =>
        `<tr><td>${esc(t.date)}</td><td>${esc(t.source)}</td><td>${esc(t.location)}</td><td>${
          t.mileage !== null ? esc(t.mileage) + " " + esc(t.mileageUnit) : ""
        }</td><td>${esc(t.event)}</td><td>${t.evidenceUrl ? `<a href="${esc(t.evidenceUrl)}">link</a>` : ""}</td><td>${esc(
          t.confidence
        )}</td></tr>`
    )
    .join("\n")}
  </table>`
}

<h2>5. Risk Flags</h2>
<p class="meta">Top-level risk: <span class="badge" style="background:${levelColor(riskLevel)}">${esc(riskLevel)}</span></p>
<table><tr><th>Level</th><th>Title</th><th>Detail</th></tr>
${riskFlags
  .map(
    (f) =>
      `<tr><td><span class="badge" style="background:${levelColor(f.level)}">${esc(f.level)}</span></td><td>${esc(
        f.title
      )}</td><td>${esc(f.detail)}</td></tr>`
  )
  .join("\n")}
</table>

<h2>6. Seller Claim Check</h2>
${
  claimResults.length === 0
    ? "<p>No seller claims were supplied for verification.</p>"
    : `<table><tr><th>Claim</th><th>Verdict</th><th>Evidence</th><th>Source</th></tr>
  ${claimResults
    .map(
      (c) =>
        `<tr><td>${esc(c.claim)}</td><td>${esc(c.verdict)}</td><td>${esc(c.evidence)}</td><td>${
          c.source ? `<a href="${esc(c.source)}">link</a>` : ""
        }</td></tr>`
    )
    .join("\n")}
  </table>`
}

<h2>7. Purchase Questions</h2>
<ol>
${purchaseQuestions.map((q) => `<li>${esc(q)}</li>`).join("\n")}
</ol>

<h2>8. Raw Evidence Records</h2>
<table><tr><th>Source</th><th>Type</th><th>Category</th><th>Confidence</th><th>URL</th><th>Excerpt</th></tr>
${records
  .map(
    (r) =>
      `<tr><td>${esc(r.source)}</td><td>${esc(r.event_type)}</td><td>${esc(r.evidence_type)}</td><td>${esc(
        r.confidence
      )}</td><td>${r.source_url ? `<a href="${esc(r.source_url)}">link</a>` : ""}</td><td>${esc(
        (r.raw_excerpt ?? "").slice(0, 300)
      )}</td></tr>`
  )
  .join("\n")}
</table>

<h2>Sources Queried</h2>
<ul>
${sourcesQueried.map((s) => `<li>${esc(s)}</li>`).join("\n")}
</ul>

</body>
</html>`;
}
