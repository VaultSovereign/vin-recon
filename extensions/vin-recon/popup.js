/* global VinReconPack, chrome */
(function () {
  const Pack = VinReconPack;
  const STORAGE_FINDINGS = "vinReconFindings";
  const STORAGE_SETTINGS = "vinReconSettings";

  const els = {
    vinSelect: document.getElementById("vinSelect"),
    vinManual: document.getElementById("vinManual"),
    findingsList: document.getElementById("findingsList"),
    reconOut: document.getElementById("reconOut"),
    fSource: document.getElementById("fSource"),
    fUrl: document.getElementById("fUrl"),
    fOrigin: document.getElementById("fOrigin"),
    fRelationship: document.getElementById("fRelationship"),
    fEventType: document.getElementById("fEventType"),
    fTitle: document.getElementById("fTitle"),
    fDamage: document.getElementById("fDamage"),
    fMileage: document.getElementById("fMileage"),
    fMileageUnit: document.getElementById("fMileageUnit"),
    fLocation: document.getElementById("fLocation"),
    fDate: document.getElementById("fDate"),
    fExcerpt: document.getElementById("fExcerpt"),
    fNote: document.getElementById("fNote"),
  };

  let pageMeta = { pageUrl: "", pageTitle: "" };

  function safeHttpUrl(value) {
    if (!value || !String(value).trim()) return null;
    try {
      const url = new URL(String(value).trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 2000) : null;
    } catch {
      return null;
    }
  }

  function safeAppBaseUrl(value) {
    return safeHttpUrl(value)?.replace(/\/$/, "") || "http://localhost:3000";
  }

  async function getSettings() {
    const data = await chrome.storage.local.get(STORAGE_SETTINGS);
    const s = data[STORAGE_SETTINGS] || {};
    return {
      appBaseUrl: safeAppBaseUrl(s.appBaseUrl),
    };
  }

  async function getAllFindings() {
    const data = await chrome.storage.local.get(STORAGE_FINDINGS);
    return data[STORAGE_FINDINGS] || {};
  }

  async function setAllFindings(all) {
    await chrome.storage.local.set({ [STORAGE_FINDINGS]: all });
  }

  function currentVin() {
    const manual = els.vinManual.value.trim().toUpperCase();
    if (Pack.isWellFormedVin(manual)) return manual;
    const sel = els.vinSelect.value.trim().toUpperCase();
    if (Pack.isWellFormedVin(sel)) return sel;
    return manual;
  }

  function setVinOptions(vins) {
    els.vinSelect.innerHTML = "";
    if (vins.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "(no VIN detected on page)";
      els.vinSelect.appendChild(o);
      return;
    }
    for (const v of vins) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      els.vinSelect.appendChild(o);
    }
    if (!els.vinManual.value) els.vinManual.value = vins[0];
  }

  async function renderFindings() {
    const vin = currentVin();
    const all = await getAllFindings();
    const list = Pack.isWellFormedVin(vin) ? all[vin] || [] : [];
    els.findingsList.innerHTML = "";
    if (list.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No saved source observations for this VIN yet.";
      els.findingsList.appendChild(li);
      return;
    }
    for (const f of list) {
      const li = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = f.sourceLabel || "Observation";
      li.appendChild(label);
      const sourceUrl = safeHttpUrl(f.sourceUrl);
      if (sourceUrl) {
        li.appendChild(document.createTextNode(" — "));
        const link = document.createElement("a");
        link.href = sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "link";
        li.appendChild(link);
      }
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = (f.sourceExcerpt || f.note || f.damage || "").slice(0, 120);
      li.appendChild(hint);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "Remove";
      rm.style.marginTop = "4px";
      rm.addEventListener("click", async () => {
        const next = (all[vin] || []).filter((x) => x.id !== f.id);
        all[vin] = next;
        await setAllFindings(all);
        renderFindings();
      });
      li.appendChild(rm);
      els.findingsList.appendChild(li);
    }
  }

  async function detectOnActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setVinOptions([]);
      return;
    }
    // Prefer page URL as the default source for observations.
    els.fUrl.value = tab.url || "";
    pageMeta = { pageUrl: tab.url || "", pageTitle: tab.title || "" };

    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "VIN_RECON_DETECT" });
      setVinOptions(res?.vins || []);
      pageMeta.pageTitle = res?.pageTitle || pageMeta.pageTitle;
      pageMeta.pageUrl = res?.pageUrl || pageMeta.pageUrl;
    } catch {
      // Content script may not be injected (chrome:// etc.) — try executeScript once.
      try {
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const re = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
            const text = (document.title || "") + "\n" + (document.body?.innerText || "").slice(0, 200000);
            const found = new Set();
            let m;
            while ((m = re.exec(text)) !== null) found.add(m[0].toUpperCase());
            return { vins: Array.from(found), pageUrl: location.href, pageTitle: document.title || "" };
          },
        });
        setVinOptions(result?.vins || []);
        if (result) {
          pageMeta.pageUrl = result.pageUrl || pageMeta.pageUrl;
          pageMeta.pageTitle = result.pageTitle || pageMeta.pageTitle;
        }
      } catch {
        setVinOptions([]);
      }
    }
    await renderFindings();
  }

  async function openPack(ids) {
    const vin = currentVin();
    if (!Pack.isWellFormedVin(vin)) {
      alert("Enter a well-formed 17-character VIN first.");
      return;
    }
    chrome.runtime.sendMessage({ type: "VIN_RECON_OPEN_PACK", vin, ids }, (res) => {
      if (chrome.runtime.lastError) {
        alert(chrome.runtime.lastError.message);
        return;
      }
      if (!res?.ok) alert(res?.error || "Failed to open pack");
    });
  }

  document.getElementById("btnDetect").addEventListener("click", detectOnActiveTab);
  document.getElementById("btnPack").addEventListener("click", () => openPack(Pack.defaultOpenPackIds()));
  document.getElementById("btnGoogle").addEventListener("click", () => {
    if (!confirm("Open Google search tabs? This is opt-in and less private.")) return;
    openPack(["google-exact", "google-adverse"]);
  });

  document.getElementById("btnApp").addEventListener("click", async () => {
    const vin = currentVin();
    if (!Pack.isWellFormedVin(vin)) {
      alert("Enter a well-formed 17-character VIN first.");
      return;
    }
    const { appBaseUrl } = await getSettings();
    // Observations stay in extension storage and are sent only when the user reconstructs through the API.
    chrome.tabs.create({ url: `${appBaseUrl}/?vin=${encodeURIComponent(vin)}` });
  });

  document.getElementById("btnSave").addEventListener("click", async () => {
    const vin = currentVin();
    if (!Pack.isWellFormedVin(vin)) {
      alert("Enter a well-formed 17-character VIN first.");
      return;
    }
    const sourceExcerpt = els.fExcerpt.value.trim();
    const note = els.fNote.value.trim();
    const damage = els.fDamage.value.trim();
    const url = els.fUrl.value.trim();
    if (!sourceExcerpt && !note && !damage && !url) {
      alert("Add an exact source excerpt, note, damage text, or URL.");
      return;
    }
    const sourceUrl = safeHttpUrl(url || pageMeta.pageUrl);
    const finding = {
      id: `addon-${Date.now()}`,
      sourceLabel: els.fSource.value.trim() || "Web research",
      sourceUrl,
      note,
      sourceExcerpt: sourceExcerpt || null,
      sourceOrigin: els.fOrigin.value.trim() || null,
      sourceRelationship: els.fRelationship.value,
      eventType: els.fEventType.value,
      damage: damage || null,
      titleStatus: els.fTitle.value.trim() || null,
      mileage: els.fMileage.value ? parseInt(els.fMileage.value, 10) : null,
      mileageUnit: els.fMileage.value ? els.fMileageUnit.value : null,
      location: els.fLocation.value.trim() || null,
      eventDate: els.fDate.value.trim() || null,
      savedAt: new Date().toISOString(),
      pageTitle: pageMeta.pageTitle || null,
      confidence: sourceUrl ? "MEDIUM" : "LOW",
    };
    const all = await getAllFindings();
    all[vin] = [...(all[vin] || []), finding];
    await setAllFindings(all);
    els.fNote.value = "";
    els.fExcerpt.value = "";
    els.fDamage.value = "";
    els.fTitle.value = "";
    els.fMileage.value = "";
    els.fDate.value = "";
    await renderFindings();
  });

  document.getElementById("btnRecon").addEventListener("click", async () => {
    const vin = currentVin();
    if (!Pack.isWellFormedVin(vin)) {
      alert("Enter a well-formed 17-character VIN first.");
      return;
    }
    const { appBaseUrl } = await getSettings();
    const all = await getAllFindings();
    const findings = all[vin] || [];
    els.reconOut.textContent = "Reconstructing…";
    try {
      const res = await fetch(`${appBaseUrl}/api/reconstruct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, findings }),
      });
      const data = await res.json();
      if (!res.ok) {
        els.reconOut.textContent = data.error || JSON.stringify(data);
        return;
      }
      const summary = {
        vin: data.vin,
        parserVersion: data.parserVersion,
        riskLevel: data.riskLevel,
        completeness: data.evidenceCoverage?.completeness,
        greenEligible: data.evidenceCoverage?.greenEligible,
        sourceObservations: data.findings?.length ?? 0,
        identityStatus: data.identity?.identityStatus,
        flags: (data.riskFlags || []).map((f) => `${f.level}: ${f.title}`),
      };
      els.reconOut.textContent = JSON.stringify(summary, null, 2);
      // Also open full app report
      chrome.tabs.create({ url: `${appBaseUrl}/?vin=${encodeURIComponent(vin)}` });
    } catch (err) {
      els.reconOut.textContent = String(err?.message || err);
    }
  });

  els.vinSelect.addEventListener("change", () => {
    els.vinManual.value = els.vinSelect.value;
    renderFindings();
  });
  els.vinManual.addEventListener("input", () => {
    els.vinManual.value = els.vinManual.value.toUpperCase();
    renderFindings();
  });

  detectOnActiveTab();
})();
