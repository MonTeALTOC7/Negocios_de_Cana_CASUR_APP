# MODULES.md — Detalle por módulo

Cada módulo se integra como **copia aislada** en su carpeta y se carga en un `<iframe>`.
Su Service Worker propio se **neutraliza** dentro de la Maestra (solo corre el SW raíz).
Sus datos (IndexedDB/localStorage) se conservan **sin migración** porque comparten origen.

| Módulo | Carpeta | Stack | Almacenamiento propio | Supabase | Privacidad |
|---|---|---|---|---|---|
| Maestro de Suertes | `modules/produccion/` · **integrado VF54.6** (monolito; iframe) | HTML monolítico | cache `casur-suertes-vf54-*` | no | pública |
| Estimador TCH | `modules/tch/` · **integrado v2.7.2** | JS vanilla | IndexedDB `casur-estimador-tch` (v3) | no | pública |
| Riegos Ejecutados | `modules/riego/` | Vite/React | sesión GoTrue | sí (publishable) | pública |
| Insumos Entregados Productores | `modules/insumos/` · **integrado v1.0 (Fase 5)** | JS vanilla | IndexedDB `insumos_casur_db` (store `kv`) | no | pública |
| Inventario Pansaco | `modules/inventario/` | JS + Supabase | IndexedDB `pansaco-inventory-outbox` | sí (publishable) | pública |
| Seguimiento de Labores · Prefacturas | `modules/labores/` | (vista operativa) | `casur_labores_public_*` | no | pública |
| Administrador SIAGRI (Convertidor) | `master/convertidor/` | JS vanilla · **integrado v1.1.0** | localStorage `casur-master-validations-v1` | no | admin |
| Conciliación | `private/conciliacion/` | Vite/React + Dexie | IndexedDB `conciliador-casur` | no | privada |

## Reglas de negocio a preservar
- **Sucuya (Cod. Hacienda 16) siempre excluida** (verificado en Convertidor).
- **Nómina** = fuente primaria de labores **manuales**.
- **Prefactura** = **mecanizadas** + contraste; sus manuales **no duplican** las de Nómina.
- **HA** = acumulado de trabajo, **no** superficie única.
- Llave de negocio `Hac-Sue` (ej. 993 + 40 → `99340`); usar **UUID interno** donde la
  concatenación no sea segura.
- Preferir `activo = false` sobre borrado físico cuando existan referencias históricas.

## Añadir un módulo nuevo (futuro)
1. Copiar la app a `modules/<id>/` (con SW neutralizado y sin `<link rel=manifest>`).
2. Agregar una entrada en `core/module-registry/registry.js`.
3. Registrar su versión en `core/versions/versions.js`.
La UI del home y del Centro Maestro lo recogen automáticamente.
