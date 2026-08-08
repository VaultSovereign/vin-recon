"use client";

import { useState } from "react";
import { ReconstructResponse } from "@/lib/types";

const ANALYST_EMAIL = "sovereign@mailbox.org";

function reviewPacket(report: ReconstructResponse, note: string) {
  return {
    requestType: "VIN_RECON_ANALYST_REVIEW_QUOTE",
    createdAt: new Date().toISOString(),
    contactMethod: "Reply to the requester's email",
    vin: report.vin,
    vehicle: {
      year: report.identity.modelYear,
      make: report.identity.make,
      model: report.identity.model,
    },
    report: {
      generatedAt: report.queryTimeUtc,
      parserVersion: report.parserVersion,
      completeness: report.evidenceCoverage.completeness,
      riskLevel: report.riskLevel,
      riskFlags: report.riskFlags.map((flag) => ({ level: flag.level, title: flag.title })),
      savedSourceObservations: report.findings.length,
      importedReports: report.paidReports.length,
    },
    requestedScope: note.trim() || "Review the evidence, gaps, seller claims, and next checks before purchase.",
    commercialStatus:
      "Quote request only. Price, turnaround, scope, availability, and payment method must be agreed separately.",
  };
}

function downloadPacket(report: ReconstructResponse, note: string) {
  const content = JSON.stringify(reviewPacket(report, note), null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vin-recon-analyst-request-${report.vin}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AnalystReview({ report }: { report: ReconstructResponse }) {
  const [note, setNote] = useState("");
  const packet = reviewPacket(report, note);
  const subject = `VIN Recon analyst review quote — ${report.vin}`;
  const body = [
    "Please quote an analyst-assisted review for this VIN Recon report.",
    "",
    `VIN: ${report.vin}`,
    `Vehicle: ${[report.identity.modelYear, report.identity.make, report.identity.model].filter(Boolean).join(" ")}`,
    `Coverage: ${report.evidenceCoverage.completeness}`,
    `Risk: ${report.riskLevel}`,
    `Request: ${packet.requestedScope}`,
    "",
    "I understand this is a quote request, not an automatic purchase or vehicle-history certification.",
  ].join("\n");
  const mailto = `mailto:${ANALYST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <section className="reportSection analystReview" id="analyst-review">
      <p className="eyebrow">Optional paid service</p>
      <h2>Request an analyst-assisted review quote</h2>
      <p>
        Ask a human analyst to review the evidence, unresolved gaps, seller claims, and next checks. Price,
        turnaround, scope, availability, and payment are agreed separately; this form does not charge or send data.
      </p>
      <label className="fieldBlock">
        <span>What decision or evidence needs review?</span>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 1500))}
          placeholder="For example: verify the auction chronology before I pay a deposit."
        />
      </label>
      <div className="exportButtons">
        <a className="buttonLink" href={mailto}>
          Request quote by email
        </a>
        <button className="secondaryButton" type="button" onClick={() => downloadPacket(report, note)}>
          Download request packet
        </button>
      </div>
      <p className="meta">Nothing is sent until you choose to send the email in your own mail application.</p>
    </section>
  );
}
