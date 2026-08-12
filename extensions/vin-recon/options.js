/* global chrome */
(async function () {
  const STORAGE_SETTINGS = "vinReconSettings";
  const input = document.getElementById("appBaseUrl");
  const status = document.getElementById("status");

  const data = await chrome.storage.local.get(STORAGE_SETTINGS);
  const s = data[STORAGE_SETTINGS] || {};
  input.value = s.appBaseUrl || "http://localhost:3000";

  document.getElementById("save").addEventListener("click", async () => {
    let appBaseUrl;
    try {
      const candidate = new URL(input.value.trim() || "http://localhost:3000");
      if (candidate.protocol !== "http:" && candidate.protocol !== "https:") throw new Error("Unsupported protocol");
      appBaseUrl = candidate.toString().replace(/\/$/, "");
    } catch {
      status.textContent = "Enter a valid http:// or https:// URL.";
      return;
    }
    await chrome.storage.local.set({ [STORAGE_SETTINGS]: { appBaseUrl } });
    status.textContent = "Saved.";
  });
})();
