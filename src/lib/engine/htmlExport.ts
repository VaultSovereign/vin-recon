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

function safeHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? esc(url.toString()) : null;
  } catch {
    return null;
  }
}

function link(value: string | null, label = "link"): string {
  const href = safeHref(value);
  return href ? `<a href="${href}">${esc(label)}</a>` : "";
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
    recallQuery,
    vinRecallVerification,
    records,
    timeline,
    evidenceClusters,
    riskFlags,
    claimResults,
    purchaseQuestions,
    sourcesQueried,
    parserVersion,
    findings,
    paidReports,
    searchPack,
    governmentContext,
    diagnostics,
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
<table>
  <tr><th>Model query resolution</th><td><strong>${esc(recallQuery.status)}</strong> — ${esc(recallQuery.detail)}</td></tr>
  <tr><th>Canonical query</th><td>${esc([recallQuery.canonical.modelYear, recallQuery.canonical.make, recallQuery.canonical.model].filter(Boolean).join(" ") || "UNRESOLVED")}</td></tr>
  <tr><th>VIN-specific result</th><td><strong>${esc(vinRecallVerification.status)}</strong> — ${link(vinRecallVerification.sourceUrl, "open official NHTSA VIN check")}</td></tr>
</table>
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

<h2>2b. Government model context</h2>
<div class="disclaimer">${esc(governmentContext.disclaimer)}</div>
<table>
  <tr><th>Complaints state</th><td>${esc(governmentContext.complaints.state)}</td></tr>
  <tr><th>Model-level complaint count</th><td>${esc(governmentContext.complaints.totalCount ?? "UNKNOWN")}</td></tr>
  <tr><th>Complaint indicators</th><td>${esc(`${governmentContext.complaints.crashCount} crash; ${governmentContext.complaints.fireCount} fire; ${governmentContext.complaints.injuryCount} injuries; ${governmentContext.complaints.deathCount} deaths`)}</td></tr>
  <tr><th>Investigations</th><td>${link(governmentContext.investigations.sourceUrl, "official search")}</td></tr>
  <tr><th>Manufacturer communications / TSBs</th><td>${link(governmentContext.manufacturerCommunications.sourceUrl, "official search")}</td></tr>
</table>

<h2>3. Public history signals — search pack</h2>
<p><strong>SEARCH_LEADS_GENERATED</strong> (not SEARCH_COMPLETED). ${esc(searchPack.allItems.length)} lead(s). Privacy engines first; Google opt-in. No pages scraped.</p>
<ul>
${searchPack.allItems.map((i) => `<li>${link(i.url, i.label)}</li>`).join("\n")}
</ul>

<h2>3b. Saved source observations (${findings.length})</h2>
${
  findings.length === 0
    ? "<p>No user-attested source observations.</p>"
    : `<table><tr><th>Source</th><th>Date</th><th>Mileage</th><th>Title/Damage</th><th>Excerpt / note</th><th>Provenance</th><th>URL</th></tr>
  ${findings
    .map(
      (f) =>
        `<tr><td>${esc(f.sourceLabel)}</td><td>${esc(f.eventDate)}</td><td>${
          f.mileage !== null ? esc(f.mileage) + " " + esc(f.mileageUnit) : ""
        }</td><td>${esc([f.titleStatus, f.damage].filter(Boolean).join(" / "))}</td><td>${esc(
          f.note
        )}${f.sourceExcerpt ? `<br><span class="meta">Excerpt: ${esc(f.sourceExcerpt)}</span>` : ""}</td><td>${esc(`${f.sourceOrigin ?? f.sourceLabel} · ${f.sourceRelationship}`)}</td><td>${link(f.sourceUrl)}</td></tr>`
    )
    .join("\n")}
  </table>`
}

<h2>3c. Imported paid-report observations (${paidReports.length})</h2>
${
  paidReports.length === 0
    ? "<p>No user-obtained provider report was transcribed.</p>"
    : `<table><tr><th>Provider</th><th>Type</th><th>Status</th><th>VIN match</th><th>Report date</th><th>Warning</th></tr>
${paidReports
  .map(
    (item) =>
      `<tr><td>${esc(item.provider)}</td><td>${esc(item.providerKind)}</td><td>${esc(item.status)}</td><td>${esc(item.vinMatches === null ? "NOT ESTABLISHED" : item.vinMatches ? "MATCH" : "MISMATCH")}</td><td>${esc(item.reportDate)}</td><td>${esc(item.warning)}</td></tr>`
  )
  .join("\n")}</table>`
}

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
        }</td><td>${esc(t.event)}</td><td>${link(t.evidenceUrl)}</td><td>${esc(
          t.confidence
        )}</td></tr>`
    )
    .join("\n")}
  </table>`
}

<h2>4b. Evidence corroboration</h2>
${
  evidenceClusters.length === 0
    ? "<p>No event evidence was available to cluster.</p>"
    : `<table><tr><th>Status</th><th>Date</th><th>Event</th><th>Summary</th><th>Records</th><th>Independent sources</th></tr>
${evidenceClusters
  .map(
    (cluster) =>
      `<tr><td>${esc(cluster.status)}</td><td>${esc(cluster.eventDate)}</td><td>${esc(cluster.eventType)}</td><td>${esc(cluster.summary)}</td><td>${esc(cluster.recordIndexes.map((index) => index + 1).join(", "))}</td><td>${esc(cluster.independentSourceCount)}</td></tr>`
  )
  .join("\n")}</table>`
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
          link(c.source)
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
<table><tr><th>Source</th><th>Type</th><th>Category</th><th>Confidence</th><th>Provenance</th><th>URL</th><th>Excerpt</th></tr>
${records
  .map(
    (r) =>
      `<tr><td>${esc(r.source)}</td><td>${esc(r.event_type)}</td><td>${esc(r.evidence_type)}</td><td>${esc(
        r.confidence
      )}</td><td>${esc(`${r.provenance.kind} · ${r.provenance.origin} · ${r.provenance.relationship}`)}</td><td>${link(r.source_url)}</td><td>${esc(
        (r.raw_excerpt ?? "").slice(0, 300)
      )}</td></tr>`
  )
  .join("\n")}
</table>

<h2>Sources Queried</h2>
<ul>
${sourcesQueried.map((s) => `<li>${esc(s)}</li>`).join("\n")}
</ul>

<h2>Run Diagnostics</h2>
<p class="meta">${esc(`${diagnostics.totalDurationMs} ms · ${diagnostics.retention}`)}</p>
<table><tr><th>Adapter</th><th>State</th><th>Duration</th><th>Detail</th></tr>
${diagnostics.adapters
  .map(
    (adapter) =>
      `<tr><td>${esc(adapter.sourceId)}</td><td>${esc(adapter.state)}</td><td>${esc(adapter.durationMs)} ms</td><td>${esc(adapter.detail)}</td></tr>`
  )
  .join("\n")}
</table>

</body>
</html>`;
}
