// Content script: detect VINs on the page and answer popup queries.
(function () {
  const Pack = globalThis.VinReconPack;

  function collectTextSample() {
    const parts = [];
    try {
      parts.push(document.title || "");
      parts.push(document.body ? document.body.innerText.slice(0, 200000) : "");
    } catch {
      /* cross-origin edge */
    }
    return parts.join("\n");
  }

  function detect() {
    const vins = Pack.detectVinsInText(collectTextSample());
    return {
      vins,
      pageUrl: location.href,
      pageTitle: document.title || "",
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "VIN_RECON_DETECT") {
      sendResponse(detect());
      return true;
    }
    return false;
  });
})();
