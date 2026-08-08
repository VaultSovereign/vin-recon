// Service worker: open search-pack tabs and relay messages.
importScripts("lib/searchPack.js");

const Pack = self.VinReconPack;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === "VIN_RECON_OPEN_PACK") {
    const vin = String(msg.vin || "").trim().toUpperCase();
    if (!Pack.isWellFormedVin(vin)) {
      sendResponse({ ok: false, error: "Invalid VIN" });
      return true;
    }
    const pack = Pack.buildSearchPack(vin);
    const ids = new Set(msg.ids || Pack.defaultOpenPackIds());
    const items = pack.allItems.filter((i) => ids.has(i.id));
    (async () => {
      for (const item of items) {
        await chrome.tabs.create({ url: item.url, active: false });
      }
      sendResponse({ ok: true, opened: items.length });
    })();
    return true;
  }

  return false;
});
