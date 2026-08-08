"use client";

import { useEffect, useMemo, useState } from "react";
import { ReconstructResponse } from "@/lib/types";
import {
  buildFieldTestEntry,
  FIELD_TEST_STORAGE_KEY,
  FIELD_TEST_TARGET,
  FieldTestDecision,
  FieldTestEntry,
  FieldTestUsefulness,
  fieldTestEntriesToCsv,
  normalizeFieldTestEntries,
} from "@/lib/engine/fieldTestLedger";

function downloadCsv(entries: FieldTestEntry[]) {
  const blob = new Blob([fieldTestEntriesToCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "vin-recon-field-test.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function loadEntries(): FieldTestEntry[] {
  try {
    return normalizeFieldTestEntries(JSON.parse(localStorage.getItem(FIELD_TEST_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export default function FieldTestPanel({ report }: { report: ReconstructResponse }) {
  const [entries, setEntries] = useState<FieldTestEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function recordRun() {
      const stored = loadEntries();
      const entry = await buildFieldTestEntry(report);
      if (cancelled) return;
      const next = stored.some((item) => item.id === entry.id) ? stored : [entry, ...stored];
      localStorage.setItem(FIELD_TEST_STORAGE_KEY, JSON.stringify(next));
      setEntries(next);
      setActiveId(entry.id);
    }
    void recordRun();
    return () => {
      cancelled = true;
    };
  }, [report]);

  const active = entries.find((entry) => entry.id === activeId) ?? entries[0] ?? null;
  const distinctCount = useMemo(
    () => new Set(entries.map((entry) => entry.vinFingerprint)).size,
    [entries]
  );

  function updateActive(patch: Partial<FieldTestEntry>) {
    if (!active) return;
    const next = entries.map((entry) => (entry.id === active.id ? { ...entry, ...patch } : entry));
    localStorage.setItem(FIELD_TEST_STORAGE_KEY, JSON.stringify(next));
    setEntries(next);
  }

  function clearLedger() {
    if (!window.confirm("Clear the local field-test ledger from this browser?")) return;
    localStorage.removeItem(FIELD_TEST_STORAGE_KEY);
    setEntries([]);
    setActiveId(null);
  }

  return (
    <section className="reportSection fieldTestPanel" id="field-test">
      <div className="sectionTitle">
        <div>
          <p className="eyebrow">Local proof loop</p>
          <h2>25-real-VIN field test</h2>
        </div>
        <p>{distinctCount}/{FIELD_TEST_TARGET} distinct masked VINs recorded in this browser.</p>
      </div>
      <p className="meta">
        The server does not retain these runs. This browser stores a masked VIN, a short SHA-256 fingerprint,
        source outcomes, duration, and your decision note. It does not store the full VIN in this ledger.
      </p>

      {active ? (
        <div className="fieldTestGrid">
          <label>
            Buying decision
            <select
              value={active.decision}
              onChange={(event) => updateActive({ decision: event.target.value as FieldTestDecision })}
            >
              <option value="NOT_RECORDED">Not recorded</option>
              <option value="PROCEED">Proceed</option>
              <option value="INVESTIGATE">Investigate further</option>
              <option value="REJECT">Reject vehicle</option>
              <option value="NO_DECISION">No decision</option>
            </select>
          </label>
          <label>
            Was the report useful?
            <select
              value={active.useful}
              onChange={(event) => updateActive({ useful: event.target.value as FieldTestUsefulness })}
            >
              <option value="NOT_RECORDED">Not recorded</option>
              <option value="YES">Yes</option>
              <option value="NO">No</option>
              <option value="UNSURE">Unsure</option>
            </select>
          </label>
          <label className="checkboxLabel">
            <input
              type="checkbox"
              checked={active.decisionRelevant}
              onChange={(event) => updateActive({ decisionRelevant: event.target.checked })}
            />
            Report changed or materially informed the decision
          </label>
          <label className="checkboxLabel">
            <input
              type="checkbox"
              checked={active.returnUse}
              onChange={(event) => updateActive({ returnUse: event.target.checked })}
            />
            I would use VIN Recon again
          </label>
          <label className="fieldTestNote">
            What helped or failed?
            <textarea
              rows={3}
              value={active.note}
              onChange={(event) => updateActive({ note: event.target.value.slice(0, 1000) })}
              placeholder="Decision-relevant result, repeated source failure, or missing evidence…"
            />
          </label>
        </div>
      ) : (
        <p>No local field-test entry is available.</p>
      )}

      <div className="exportButtons">
        <button className="secondaryButton" type="button" onClick={() => downloadCsv(entries)} disabled={!entries.length}>
          Export field-test CSV
        </button>
        <button className="linkButton" type="button" onClick={clearLedger} disabled={!entries.length}>
          Clear local ledger
        </button>
      </div>
    </section>
  );
}
