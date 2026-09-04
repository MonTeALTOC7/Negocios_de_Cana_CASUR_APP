/* ============================================================
   icons.js — Iconos SVG inline (sin dependencias).
   Cada icono devuelve un string SVG con currentColor,
   para que herede el color del contenedor (acento del módulo).
   ============================================================ */

const wrap = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  // --- Módulos ---
  produccion: wrap('<path d="M3 20h18"/><path d="M6 20V10"/><path d="M11 20V4"/><path d="M16 20V8"/><path d="M20 20v-6"/>'), // barras de producción
  tch: wrap('<path d="M12 3C9 7 7 9 7 13a5 5 0 0 0 10 0c0-4-2-6-5-10Z"/><path d="M12 21v-6"/>'), // hoja/biometría
  riego: wrap('<path d="M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9Z"/><path d="M9.5 13a2.5 2.5 0 0 0 2.5 2.5"/>'), // gota de agua
  insumos: wrap('<path d="M4 7h16"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>'), // saco/bolsa
  inventario: wrap('<path d="M3 8l9-5 9 5v8l-9 5-9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'), // caja 3D
  labores: wrap('<path d="M14.5 3.5l6 6"/><path d="M3 21l4-1 11-11-3-3L4 17l-1 4Z"/><path d="M13 6l3 3"/>'), // herramienta/azada
  // --- Administración / privado ---
  siagri: wrap('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 4v16"/>'), // hoja de cálculo
  conciliacion: wrap('<path d="M12 3v18"/><path d="M6 7l-3 5h6Z"/><path d="M18 7l-3 5h6Z"/><path d="M6 21h12"/>'), // balanza
  // --- UI ---
  home: wrap('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>'),
  master: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'), // engranaje
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  chevron: wrap('<path d="M9 6l6 6-6 6"/>'),
  back: wrap('<path d="M15 6l-6 6 6 6"/>'),
  refresh: wrap('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  wifi: wrap('<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19h.01"/>'),
  wifiOff: wrap('<path d="M3 3l18 18"/><path d="M12 19h.01"/><path d="M8.5 16a5 5 0 0 1 6-.5"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
};

/** Devuelve el SVG de un icono, o un punto si no existe. */
export function icon(name) {
  return ICONS[name] || wrap('<circle cx="12" cy="12" r="3"/>');
}
