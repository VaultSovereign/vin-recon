"use client";

import { ReconstructResponse, RiskFlagLevel, SourceCoverageState } from "@/lib/types";
import { buildHtmlReport } from "@/lib/engine/htmlExport";
import { formatCoverageMatrix } from "@/lib/engine/evidenceCoverage";
import { defaultOpenPackIds, SearchPackItem } from "@/lib/engine/searchPack";

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

function coverageBadgeClass(state: SourceCoverageState): string {
  switch (state) {
    case "SUCCESS":
      return "badge badge-GREEN";
    case "FAILED":
    case "NOT_RUN":
      return "badge badge-RED";
    case "PARTIAL":
    case "SEARCH_LEADS_GENERATED":
    case "NOT_PROVIDED":
    default:
      return "badge badge-AMBER";
  }
}

function completenessClass(completeness: ReconstructResponse["evidenceCoverage"]["completeness"]): string {
  if (completeness === "COMPLETE") return "badge badge-GREEN";
  if (completeness === "PARTIAL") return "badge badge-AMBER";
  return "badge badge-RED";
}

function riskClass(level: RiskFlagLevel): string {
  return `badge badge-${level}`;
}

function openSearchPackTabs(items: SearchPackItem[], ids: string[]) {
  const idSet = new Set(ids);
  const toOpen = items.filter((i) => idSet.has(i.id));
  for (const item of toOpen) {
    window.open(item.url, "_blank", "noopener,noreferrer");
  }
}

function PackGroup({ title, items, warn }: { title: string; items: SearchPackItem[]; warn?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <h4>
        {title}
        {warn ? " (opt-in — privacy warning)" : ""}
      </h4>
      <ul className="linkList">
        {items.map((item) => (
          <li key={item.id}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.label}
            </a>
            {item.description ? <span className="meta"> — {item.description}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ReportView({ report }: { report: ReconstructResponse }) {
  const { evidenceCoverage, identity, searchPack, findings } = report;
  const damageFindings = findings.filter((f) => f.damage || /auction|salvage|copart|iaai|bidfax/i.test(f.sourceLabel + (f.note || "")));

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

      <section className="statusBanner">
        <h2>Evidence coverage &amp; risk (separate)</h2>
        <p className="meta">
          Coverage describes whether sources actually ran. Risk describes adverse evidence found.
          GREEN risk is only allowed when required automatic sources succeeded.
        </p>
        <table>
          <tbody>
            <tr>
              <th>Completeness</th>
              <td>
                <span className={completenessClass(evidenceCoverage.completeness)}>
                  {evidenceCoverage.completeness}
                </span>
              </td>
            </tr>
            <tr>
              <th>Risk level</th>
              <td>
                <span className={riskClass(report.riskLevel)}>{report.riskLevel}</span>
              </td>
            </tr>
            <tr>
              <th>GREEN eligible</th>
              <td>{evidenceCoverage.greenEligible ? "yes" : "no"}</td>
            </tr>
            <tr>
              <th>Summary</th>
              <td>{evidenceCoverage.summary}</td>
            </tr>
            <tr>
              <th>Matrix</th>
              <td className="mono">{formatCoverageMatrix(evidenceCoverage)}</td>
            </tr>
          </tbody>
        </table>

        <h3>Source coverage matrix</h3>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>State</th>
              <th>Required</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {evidenceCoverage.sources.map((s) => (
              <tr key={s.sourceId}>
                <td>{s.label}</td>
                <td>
                  <span className={coverageBadgeClass(s.state)}>{s.state}</span>
                </td>
                <td>{s.required ? "yes" : "no"}</td>
                <td>
                  {s.detail ?? "—"}
                  {s.error ? ` (${s.error})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>1. Vehicle Identity</h2>
        <table>
          <tbody>
            <tr>
              <th>Identity status</th>
              <td>
                <span className="badge badge-AMBER">{identity.identityStatus}</span>
                {" — "}
                {identity.identityStatusDetail}
              </td>
            </tr>
            <tr>
              <th>VIN</th>
              <td className="mono">{identity.vin}</td>
            </tr>
            <tr>
              <th>Make</th>
              <td>{identity.make ?? "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Model</th>
              <td>{identity.model ?? "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Model Year</th>
              <td>{identity.modelYear ?? "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Engine</th>
              <td>{identity.engine || "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Drivetrain</th>
              <td>{identity.drivetrain ?? "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Body</th>
              <td>{identity.body ?? "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Manufacturer</th>
              <td>{identity.manufacturer ?? "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Assembly Plant</th>
              <td>{[identity.plantCity, identity.plantCountry].filter(Boolean).join(", ") || "UNKNOWN"}</td>
            </tr>
            <tr>
              <th>Check Digit</th>
              <td>
                {identity.checkDigit.valid ? "VALID" : "INVALID / NOT APPLICABLE"} &mdash; {identity.checkDigit.reason}
                {identity.checkDigit.computedCheckDigit != null && (
                  <span className="meta">
                    {" "}
                    (supplied {identity.checkDigit.suppliedCheckDigit ?? "—"}, computed{" "}
                    {identity.checkDigit.computedCheckDigit})
                  </span>
                )}
              </td>
            </tr>
            {identity.checkDigit.candidates.length > 0 && (
              <tr>
                <th>Check-digit candidates</th>
                <td>
                  <p className="meta">
                    Possible alternate VIN forms if the input was mistyped (not proven correct):
                  </p>
                  <ul className="mono">
                    {identity.checkDigit.candidates.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
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
              <tr>
                <th>Campaign</th>
                <th>Component</th>
                <th>Summary</th>
                <th>Report Date</th>
              </tr>
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
        <h2>3. Public History Signals — search pack</h2>
        <p>
          <strong>Status: SEARCH_LEADS_GENERATED</strong> — not SEARCH_COMPLETED. Nothing is scraped.
          Privacy engines (Startpage / Brave / DDG) are preferred; Google is opt-in. Open links, verify
          yourself, then <strong>save findings</strong> so they become FACT records.
        </p>
        <div className="exportButtons">
          <button
            type="button"
            onClick={() => openSearchPackTabs(searchPack.allItems, defaultOpenPackIds())}
          >
            Open privacy search pack (tabs)
          </button>
          <button
            type="button"
            onClick={() =>
              openSearchPackTabs(
                searchPack.allItems,
                searchPack.googleItems.map((g) => g.id)
              )
            }
          >
            Open Google pack (opt-in)
          </button>
        </div>
        <PackGroup title="Privacy web" items={searchPack.privacyItems} />
        <PackGroup title="Auction / salvage" items={searchPack.auctionItems} />
        <PackGroup title="Government / manual" items={searchPack.governmentItems} />
        <PackGroup title="Market / classifieds queries" items={searchPack.marketItems} />
        <PackGroup title="Google" items={searchPack.googleItems} warn />
      </section>

      <section>
        <h2>3b. Saved findings ({findings.length})</h2>
        {findings.length === 0 ? (
          <p className="meta">No user-confirmed findings yet. Use the form above or the browser addon.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Date</th>
                <th>Mileage</th>
                <th>Title / damage</th>
                <th>Note</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td>{f.sourceLabel}</td>
                  <td>{f.eventDate ?? "—"}</td>
                  <td>{f.mileage !== null ? `${f.mileage} ${f.mileageUnit ?? ""}` : "—"}</td>
                  <td>
                    {[f.titleStatus, f.damage].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td>{f.note || "—"}</td>
                  <td>
                    {f.sourceUrl ? (
                      <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer">
                        link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>4. Timeline</h2>
        {report.timeline.length === 0 ? (
          <p>No dated evidence retrieved. No dates or mileage have been invented.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Location</th>
                <th>Mileage</th>
                <th>Event</th>
                <th>Evidence</th>
                <th>Confidence</th>
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
                  <td>
                    {t.evidenceUrl ? (
                      <a href={t.evidenceUrl} target="_blank" rel="noopener noreferrer">
                        link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{t.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>5. Damage / Auction Evidence</h2>
        {damageFindings.length === 0 ? (
          <p>
            No user-confirmed auction/damage findings yet. Open Bidfax / Copart / IAAI from the search pack,
            then save a finding with damage/title notes.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Damage / title</th>
                <th>Note</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {damageFindings.map((f) => (
                <tr key={f.id}>
                  <td>{f.sourceLabel}</td>
                  <td>{[f.damage, f.titleStatus].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{f.note || "—"}</td>
                  <td>
                    {f.sourceUrl ? (
                      <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer">
                        link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>6. Risk Flags</h2>
        <p className="meta">
          Top-level risk: <span className={riskClass(report.riskLevel)}>{report.riskLevel}</span>. GREEN never
          means &quot;verified clean.&quot;
        </p>
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Title</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {report.riskFlags.map((f) => (
              <tr key={f.id}>
                <td>
                  <span className={`badge badge-${f.level}`}>{f.level}</span>
                </td>
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
              <tr>
                <th>Claim</th>
                <th>Verdict</th>
                <th>Evidence</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {report.claimResults.map((c, i) => (
                <tr key={i}>
                  <td>{c.claim}</td>
                  <td>{c.verdict}</td>
                  <td>{c.evidence}</td>
                  <td>
                    {c.source ? (
                      <a href={c.source} target="_blank" rel="noopener noreferrer">
                        link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
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
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Category</th>
              <th>Confidence</th>
              <th>URL</th>
              <th>Excerpt</th>
            </tr>
          </thead>
          <tbody>
            {report.records.map((r, i) => (
              <tr key={i}>
                <td>{r.source}</td>
                <td>{r.event_type}</td>
                <td>{r.evidence_type}</td>
                <td>{r.confidence}</td>
                <td>
                  {r.source_url ? (
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer">
                      link
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{(r.raw_excerpt ?? "").slice(0, 200)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
