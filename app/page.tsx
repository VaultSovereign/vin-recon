"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReconReport } from "@/lib/types";

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [vin, setVin] = useState("55SWF4JB6FU077077");
  const [sellerClaimsText, setSellerClaimsText] = useState("accident free\noriginal mileage");
  const [nicbPaste, setNicbPaste] = useState("");
  const [externalPaidReportPaste, setExternalPaidReportPaste] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReconReport | null>(null);
  const [portableHtml, setPortableHtml] = useState("");

  const sellerClaims = useMemo(
    () => sellerClaimsText.split("\n").map((claim) => claim.trim()).filter(Boolean),
    [sellerClaimsText],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin,
          sellerClaims,
          nicbPaste,
          externalPaidReportPaste,
        }),
      });

      const data = (await response.json()) as { report?: ReconReport; html?: string; error?: string };
      if (!response.ok || !data.report) {
        throw new Error(data.error || "Unexpected response from VIN Recon API.");
      }

      setReport(data.report);
      setPortableHtml(data.html ?? "");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to reconstruct report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold">VIN Recon</h1>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
        Buyer due-diligence tool. It reconstructs public evidence and highlights what is known versus unknown.
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4 rounded-lg border p-4">
        <label className="grid gap-1">
          <span className="font-medium">VIN input</span>
          <input
            value={vin}
            onChange={(event) => setVin(event.target.value.toUpperCase())}
            maxLength={17}
            className="rounded border px-3 py-2"
            placeholder="17-character VIN"
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="font-medium">Seller claims (one per line)</span>
          <textarea
            value={sellerClaimsText}
            onChange={(event) => setSellerClaimsText(event.target.value)}
            className="min-h-20 rounded border px-3 py-2"
            placeholder="accident free"
          />
        </label>

        <label className="grid gap-1">
          <span className="font-medium">Optional manual NICB VINCheck paste</span>
          <textarea
            value={nicbPaste}
            onChange={(event) => setNicbPaste(event.target.value)}
            className="min-h-20 rounded border px-3 py-2"
            placeholder="Paste your NICB result text here"
          />
        </label>

        <label className="grid gap-1">
          <span className="font-medium">Optional paid report paste (NMVTIS/CARFAX/AutoCheck)</span>
          <textarea
            value={externalPaidReportPaste}
            onChange={(event) => setExternalPaidReportPaste(event.target.value)}
            className="min-h-20 rounded border px-3 py-2"
            placeholder="Paste purchased report excerpts here"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-fit rounded bg-black px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "RECONSTRUCTING..." : "RECONSTRUCT"}
        </button>
      </form>

      {error ? <p className="mt-4 rounded border border-red-400 bg-red-50 p-3 text-red-700">{error}</p> : null}

      {report ? (
        <section className="mt-8 space-y-8">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={() => downloadFile(`vin-recon-${report.query.vin}.json`, JSON.stringify(report, null, 2), "application/json")}
            >
              Export JSON
            </button>
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={() =>
                downloadFile(`vin-recon-${report.query.vin}.html`, portableHtml, "text/html;charset=utf-8")
              }
            >
              Export HTML
            </button>
          </div>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">1. Vehicle Identity</h2>
            <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><dt className="font-medium">VIN</dt><dd>{report.vehicleIdentity.vin}</dd></div>
              <div><dt className="font-medium">Make</dt><dd>{report.vehicleIdentity.make ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Model</dt><dd>{report.vehicleIdentity.model ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Model year</dt><dd>{report.vehicleIdentity.modelYear ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Engine</dt><dd>{report.vehicleIdentity.engine ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Drivetrain</dt><dd>{report.vehicleIdentity.drivetrain ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Body</dt><dd>{report.vehicleIdentity.body ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Manufacturer</dt><dd>{report.vehicleIdentity.manufacturer ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Assembly country</dt><dd>{report.vehicleIdentity.plantCountry ?? "UNKNOWN"}</dd></div>
              <div><dt className="font-medium">Assembly plant</dt><dd>{report.vehicleIdentity.plant ?? "UNKNOWN"}</dd></div>
              <div>
                <dt className="font-medium">VIN validity/check digit</dt>
                <dd>
                  format={String(report.vehicleIdentity.vinValidity.isValidFormat)} | checkDigitValid={String(
                    report.vehicleIdentity.vinValidity.hasValidCheckDigit,
                  )}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">2. Factory / Technical Data</h2>
            <p className="mt-2 text-sm">NHTSA decode and recall data are included below.</p>
            <pre className="mt-3 overflow-x-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-900">
              {JSON.stringify(report.technicalData, null, 2)}
            </pre>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">3. Public History Signals</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              {report.records.map((record, index) => (
                <li key={`${record.source_url}-${index}`}>
                  <a className="underline" href={record.source_url} target="_blank" rel="noreferrer">
                    {record.source}
                  </a>{" "}
                  — {record.raw_excerpt}
                </li>
              ))}
              {!report.records.length ? <li>No public/indexed records found from searched sources.</li> : null}
            </ul>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">4. Timeline</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {[
                      "date",
                      "source",
                      "location",
                      "mileage",
                      "event",
                      "evidence URL",
                      "confidence",
                    ].map((header) => (
                      <th key={header} className="border px-2 py-1 text-left">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.timeline.map((event, index) => (
                    <tr key={`${event.evidenceUrl}-${index}`}>
                      <td className="border px-2 py-1">{event.date ?? "UNKNOWN"}</td>
                      <td className="border px-2 py-1">{event.source}</td>
                      <td className="border px-2 py-1">{event.location ?? "UNKNOWN"}</td>
                      <td className="border px-2 py-1">{event.mileage ?? "UNKNOWN"}</td>
                      <td className="border px-2 py-1">{event.event}</td>
                      <td className="border px-2 py-1">
                        <a className="underline" href={event.evidenceUrl} target="_blank" rel="noreferrer">
                          {event.evidenceUrl}
                        </a>
                      </td>
                      <td className="border px-2 py-1">{event.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">Dates and mileage are never invented.</p>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">5. Damage / Auction Evidence</h2>
            <ul className="mt-3 list-disc pl-5 text-sm">
              {report.records
                .filter((record) => /auction|damage|salvage/i.test(record.event_type + record.raw_excerpt))
                .map((record, index) => (
                  <li key={`damage-${index}`}>
                    {record.source} | sale date: {record.event_date ?? "UNKNOWN"} | lot: UNKNOWN | title/condition: {record.title_status ?? "UNKNOWN"} | mileage: {record.mileage ? `${record.mileage} ${record.mileage_unit}` : "UNKNOWN"} | damage: {record.damage ?? "UNKNOWN"} | <a className="underline" href={record.source_url} target="_blank" rel="noreferrer">source</a>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              Structural safety cannot be determined from photos alone.
            </p>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">6. Risk Flags</h2>
            <ul className="mt-3 list-disc pl-5 text-sm">
              {report.riskFlags.map((flag, index) => (
                <li key={`${flag.flag}-${index}`}>
                  <strong>{flag.level}</strong> — {flag.flag}: {flag.rationale}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              GREEN means: &quot;No adverse evidence found in the sources checked.&quot;
            </p>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">7. Seller Claim Check</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {[
                      "CLAIM",
                      "SUPPORTED / CONTRADICTED / NOT ESTABLISHED",
                      "EVIDENCE",
                      "SOURCE",
                    ].map((header) => (
                      <th key={header} className="border px-2 py-1 text-left">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.sellerClaimChecks.map((item, index) => (
                    <tr key={`${item.claim}-${index}`}>
                      <td className="border px-2 py-1">{item.claim}</td>
                      <td className="border px-2 py-1">{item.status}</td>
                      <td className="border px-2 py-1">{item.evidence}</td>
                      <td className="border px-2 py-1">{item.source ?? "UNKNOWN"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">8. Purchase Questions</h2>
            <ul className="mt-3 list-disc pl-5 text-sm">
              {report.purchaseQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">Evidence Rules</h2>
            <ul className="mt-3 list-disc pl-5 text-sm">
              <li>Every factual claim links to a source URL.</li>
              <li>FACT, INFERENCE, SELLER CLAIM, and UNKNOWN are kept separate in report output.</li>
              <li>Never interpreted as &quot;clean history&quot; or &quot;verified accident-free&quot; without explicit evidence.</li>
            </ul>
          </article>
        </section>
      ) : null}
    </main>
  );
}
