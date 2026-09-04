# Regresión crítica — Sucuya (Cod. Hacienda 16)

**Regla permanente:** Sucuya (Cod. Hacienda = 16) se excluye **siempre** del maestro.
**Resultado esperado tras procesar:** `Registros Cod Hacienda 16 = 0`.

## Fixture
`siagri_fixture.xlsx` — Excel SIAGRI de prueba con 7 filas, de las cuales **2 son Sucuya
(Cod. Hacienda = 16)**. Registros válidos esperados = 5; Productores (zona `5-Productores`,
sin Sucuya) = 2.

## Verificación integrada (dos capas)
1. **Test propio del Convertidor** (`master/convertidor/js/data-engine.js`): el check crítico
   `records.every(r => Number(r.cod) !== 16)` forma parte de "Pruebas" y **bloquea la
   exportación** si no se cumple. En la UI: "Pruebas aprobadas · 15/15 reglas correctas" y
   la fila de auditoría "− Sucuya · Código 16".
2. **Prueba E2E de integración** (ejecutada en Fase 2): cargar `siagri_fixture.xlsx` en el
   Convertidor integrado y exportar el Excel.

## Resultado E2E obtenido (Fase 2)
- "Sucuya · Código 16" (excluidos) = **2**.
- Validación "Sucuya = 0 en resultado" = **✓**.
- Excel exportado con hojas **REPORTE** (5 registros) y **Productores** (2 registros).
- **Cod = 16 encontrados en el Excel exportado = 0** en ambas hojas. ✅

## Cómo reproducir
1. Home → Centro Maestro → contraseña `15102171011` → Administrador SIAGRI.
2. Importar archivos → seleccionar `siagri_fixture.xlsx`.
3. Auditoría: confirmar "− Sucuya · Código 16 = 2" y "Sucuya = 0 en resultado".
4. Exportar → Excel: confirmar hojas REPORTE y Productores, sin filas Cod = 16.
