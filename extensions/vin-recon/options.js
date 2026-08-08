/* global chrome */
(async function () {
  const STORAGE_SETTINGS = "vinReconSettings";
  const input = document.getElementById("appBaseUrl");
  const status = document.getElementById("status");

  const data = await chrome.storage.local.get(STORAGE_SETTINGS);
  const s = data[STORAGE_SETTINGS] || {};
  input.value = s.appBaseUrl || "http://localhost:3000";

  document.getElementById("save").addEventListener("click", async () => {
    const appBaseUrl = input.value.trim().replace(/\/$/, "") || "http://localhost:3000";
    await chrome.storage.local.set({ [STORAGE_SETTINGS]: { appBaseUrl } });
    status.textContent = "Saved.";
  });
})();
