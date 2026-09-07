/* ============================================================
   versions.js — Control de versiones.
   La App Maestra tiene su propia versión; cada módulo la suya
   (independiente). Se muestran en Centro Maestro. Actualizar el
   número de un módulo aquí no afecta a los demás.
   ============================================================ */

export const APP_VERSION = '1.0.0';
export const APP_CHANNEL = 'GitHub Pages';

/* Versiones detectadas en la auditoría (Fase 0). En fase 1 son
   informativas (placeholders); al integrar cada módulo real se
   confirmarán/leerán de su propio version.json cuando exista. */
export const MODULE_VERSIONS = {
  produccion: 'VF54.6',
  tch: '2.7.2',
  riego: 'v6',
  insumos: '1.0',
  inventario: '1.4.0',
  labores: '0.7.x',
  convertidor: '1.1.0',
  conciliacion: '0.7.x',
};

export function moduleVersion(id) {
  return MODULE_VERSIONS[id] || '—';
}

/* Estado de integración por módulo (se muestra en Centro Maestro).
   'integrado' = app real embebida y verificada; 'placeholder' = pendiente
   de su fase. El TCH está integrado técnicamente; cámara/GPS/Android
   requieren validación final en dispositivo real tras publicar. */
export const MODULE_STATUS = {
  produccion: 'integrado · VF54.6 (código) · datos vía SIAGRI→adaptador',
  tch: 'integrado · cámara/GPS: validar en dispositivo',
  riego: 'integrado · fuente/backend Supabase propios',
  insumos: 'integrado · fuente/Maestro propios (conexión al Maestro Central en Fase 5.1)',
  inventario: 'placeholder',
  labores: 'integrado · fuente propia',
  convertidor: 'integrado',
  conciliacion: 'placeholder',
};

export function moduleStatus(id) {
  return MODULE_STATUS[id] || 'placeholder';
}
