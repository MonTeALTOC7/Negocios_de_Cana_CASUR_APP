# Exportadores PDF/PNG: etapas R1 y R2

**Autorización:** del propietario, 26-Nov-2026, para las etapas R1 y R2 de `docs/PROPUESTA_REDISENO_INFORMES.md`, incluidos los cambios estrictamente necesarios en el bloque protegido de `modules/produccion/index.html`.
**Pendiente:** R3 (informes múltiples y de Zona), sujeto a la revisión visual de las cuatro plantillas principales.

## R1: corrección del motor actual

**Cambio:** un único bloque `/* R1-EXPORT … */ … /* R1-EXPORT-END */`, insertado después de `window.CASUR_VISUAL_EXPORT=…` en `index.html`. No se modifica ninguna otra línea del motor.

1. **Mismo contexto CSS.**
   - `renderCanvas` se reemplaza por una versión que monta el clon en un `iframe` aislado. Ese `iframe` contiene solo `RENDER_CSS` y la misma raíz `div.casur-render-root` que luego pinta el `foreignObject`.
   - La medición, los puntos de corte y la paginación del Histórico múltiple se calculan ahí.
   - Las hojas de la aplicación (premium) ya no intervienen.
2. **Iconos:** `.casur-render-root svg.maestro-icon` mide 16 × 16 px; antes medía 417 o 1400 px.
3. **Tipografía:** la fuente, el color y el interlineado se declaran en `.casur-render-root`, que existe en ambos contextos. Antes solo estaban en `html,body`, que no existen dentro del `foreignObject`.
4. **Recortes:** la altura del SVG sale del mismo contexto que pinta, así que el contenido completo y el pie quedan dentro.
5. **Paginación:**
   - Se suman puntos de corte entre bloques (KPI, gráficos y resúmenes).
   - Se descarta cualquier corte situado a menos de 90 px debajo de un título (`h2`–`h4`, `.section-title`, `figcaption`). Así ningún título queda solo al pie de una página.

**Guarda:**
- `modules/produccion/tests/maestro-ux.test.mjs` retira el bloque solo si su SHA-256 coincide con `4501dd20…fbd311` y si aparece una única vez.
- Cualquier otro cambio en `index.html` sigue haciendo fallar la prueba.

### Validación R1 (`tools/audit-exporters.cjs`, botones reales, PC y Android)

| Informe | Antes (usada → necesaria) | R1 (usada = necesaria) | Pie | Iconos |
|---|---|---|---|---|
| Cronológico de Finca (Pansaco) | 300 → 2,875 px | 2,050 = 2,050 px (2 páginas, 49 suertes) | Visible | 16 px |
| Cronológico de Suerte (01) | 479 → 563 | 563 = 563 | Visible | — |
| Histórico de Finca | 1,351 → 1,304 | 1,304 = 1,304 | Visible | — |
| Histórico de Suerte | 1,351 → 1,293 | 1,293 = 1,293 | Visible | — |
| Cronológico múltiple | 760 → 760 | 760 = 760 | Visible | — |
| Zona Cronológico / Histórico | 1,263 → 1,231 / 1,749 → 1,720 | 1,231 = 1,231 / 1,720 = 1,720 | Visible | — |
| Histórico múltiple ejecutivo / completo | paginado | paginado, medido en el mismo contexto | Visible | — |

**Revisión visual:** las páginas están en `docs/auditoria-exportadores/r1/`.
- **Zona:** la tabla de haciendas empieza en la página 2 junto con su título (antes el título quedaba huérfano).
- **Cronológico de Finca:** completo, con la tabla y el pie.
- **Tipografía:** sans en todos los informes.

**Fuera de R1 (sin recorte, pero de calidad mejorable; se resuelven en R2 o R3):**
- Texto pequeño en el Cronológico múltiple (render de 1,600 px).
- Una página con 3 filas en el Histórico múltiple completo.
- PDF de imagen.
