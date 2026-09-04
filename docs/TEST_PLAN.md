# TEST_PLAN.md — Plan de pruebas y checklist

## Fase 1 — Shell (estado: verificado automáticamente)
- [x] Carga del shell (online y offline)
- [x] Navegación inicio ↔ módulo ↔ regreso
- [x] Apertura de módulo en iframe aislado
- [x] Centro Maestro: 8 módulos, interruptores, estado, versiones, PIN
- [x] Área privada: gate visible, desbloqueo con PIN correcto, bloquear
- [x] Instalabilidad PWA (manifest + iconos + SW)
- [x] **SW maestro NO borra cachés de otros módulos** (regresión crítica C1/C2)
- [x] Consola sin errores ni warnings
- [x] Responsive móvil (390px) y PC (1200px)
- [ ] Instalación en dispositivo real Android (propietario)
- [ ] Instalación en Windows/PC real (propietario)

## Regresión por módulo (Fases 2–8)
### Producción
- [ ] Submódulos, cronológico, histórico, análisis, gráficos, exportación, selección múltiple.
### TCH
- [ ] Abrir → crear biometría → guardar → **foto grande** → visita → reiniciar → **persiste**.
### Riego
- [ ] Datos, filtros, importación, persistencia, Supabase online.
### Insumos
- [ ] Importar SIAGRI, Resumen/Explorar/Insumos/Productores/Madurante/Admin, exportación.
### Inventario
- [ ] Lectura, entrada, salida, **realtime**, offline (outbox), reconexión, sincronización.
### Labores
- [ ] Manual, mecanizada, filtros, productor, suerte, aplicación, resumen ejecutivo.
### Convertidor
- [ ] Excel SIAGRI procesa, **Sucuya = 0 en resultado**, exportación, offline.
### Privado
- [ ] No visible normalmente, desbloqueo, conciliación, carga Excel, actualización, bloquear.

## Regla de no-regresión (cierre de cada fase)
1. Probar el nuevo módulo. 2. Probar navegación general. 3. Smoke de módulos ya integrados.
4. Verificar IndexedDB/localStorage intactos. 5. Verificar PWA. 6. Revisar consola.
7. No continuar con errores importantes abiertos.

## Cómo probar localmente
Al usar módulos ES y Service Worker, hay que servir por HTTP (no abrir con `file://`):
```bash
cd Negocios_de_Cana_CASUR
python3 -m http.server 8080
# abrir http://localhost:8080/
```

## Fase 2 — Convertidor SIAGRI (estado: verificado)
Flujo: Home → Centro Maestro → contraseña `15102171011` → Administrador SIAGRI.
- [x] Home muestra textos/nombres nuevos
- [x] Centro Maestro pide y acepta contraseña
- [x] Administrador SIAGRI carga el **Convertidor real** (`#siagriInput` presente en iframe)
- [x] Cargar `docs/regression/siagri_fixture.xlsx` y procesar
- [x] **Sucuya código 16 = 0** (excluidos=2; "Sucuya = 0 en resultado" ✓; Cod=16 en export=0)
- [x] Generar/descargar Excel; hojas **REPORTE** (5) y **Productores** (2)
- [x] Reglas de edad/renovación (fórmula Edad por fila) y `Hac-Sue`, Tipo de Riego presentes
- [x] Cerrar, volver a Centro Maestro, reabrir → **persistencia** `casur-master-validations-v1`
- [x] **Offline** del Convertidor tras cachear recursos
- [x] Consola limpia (shell + iframe)
- [x] **Un solo Service Worker** (raíz) · **una sola PWA** (0 manifest en iframe)
- [x] Responsive móvil y PC
Prueba de regresión permanente: `docs/regression/SUCUYA_REGRESION.md`.

## Fase 3 — Estimador TCH (estado: integración técnica verificada por inspección)
Micro-pruebas (cortas y separadas):
- [x] A — Módulo carga en iframe; assets JS/CSS relativos; shell estable (arquitectura de iframe ya probada en Fase 2).
- [x] B — IndexedDB `casur-estimador-tch` v3 · stores: master, biometries, weighings, harvests, visits, audit, settings · sin recreación destructiva (inspección de `js/storage.js`).
- [x] C — Maestro desde `./data/suertes.json` (1053) y `./data/productores.json`; rutas relativas OK tras mover a `modules/tch/`.
- [x] D — Persistencia por IndexedDB (misma DB de origen en el iframe; sin migración) — verificación por diseño; confirmación final de escritura/relectura en dispositivo.
- [x] E — Fotos: `#visitGalleryFile`/`#visitCameraFile` → File/Blob → `canvas.toBlob` → `{blob,sizeBytes}` en `visits`; recuperación `createObjectURL` (inspección `js/visit-evidence.js`).
- [x] F — GPS: `navigator.geolocation.getCurrentPosition` con manejo éxito/error; iframe con `allow="geolocation"`.
- [x] G — Exportadores: PNG etiquetado (canvas `fillText`/`toBlob`), Excel vía `./vendor/xlsx.bundle.js` (ruta relativa), backup/restore JSON.
- [x] H — PWA/SW: TCH no registra SW propio ni manifest; solo SW raíz; una sola PWA (archivos `sw.js`/`manifest.webmanifest` eliminados de la copia).
- [x] Fase 2 sin regresión: `master/convertidor/` intacto, SW raíz (allowlist `casur_master_`) sin cambios.

**Requiere validación en dispositivo real (Android/PC) tras publicar:**
cámara, galería, permiso/coordenadas GPS reales, orientación vertical/horizontal, compartir, y comportamiento de la PWA instalada. Además, confirmación E2E en navegador (no ejecutable aquí por inestabilidad del entorno de pruebas).
