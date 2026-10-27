/* Included inline only in the Cloudflare preview artifact. No storage writes. */
(function () {
  'use strict';
  function labelPreview() {
    if (!window.CRONO_DATA?.meta?.previewGeneration) return;
    const labels = {casurReleaseKind:'Preview · Aforo 26/27 aprobado',
      casurSyncPill:'Fuente aprobada · 12-oct-2026 · generación ' + window.CRONO_DATA.meta.dataVersion};
    for (const [id, text] of Object.entries(labels)) {
      const node = document.getElementById(id);
      if (node && node.textContent !== text) node.textContent = text;
    }
  }
  window.addEventListener('load', function () {
    // Personal generations retain precedence through the existing overlay.
    // Refresh the bundled generation using the same canonical presentation helper.
    if (!window.CASUR_MASTER_OVERLAY && window.CRONO_DATA?.meta?.previewGeneration) {
      const data = structuredClone(window.CRONO_DATA);
      const result = window.CASUR_APPLY_REPORT_ROWS({dataVersion:data.meta.dataVersion,
        operationalDataset:{contractVersion:1, catalog:data.producers.flatMap(p => p.details), cronologico:data}});
      if (!result?.applied) throw Error('Approved preview generation could not be displayed');
    }
    labelPreview();
    const strip = document.querySelector('.casur-release-strip');
    if (strip) new MutationObserver(labelPreview).observe(strip, {childList:true, subtree:true, characterData:true});
  });
  document.addEventListener('casur-crono-effective-change', labelPreview);
})();
