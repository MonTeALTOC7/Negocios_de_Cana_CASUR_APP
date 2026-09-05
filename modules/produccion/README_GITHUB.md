# Producción Suertes CASUR · VF54.6

PWA del Cronológico e Histórico de Producción de Suertes CASUR. Esta versión conserva los módulos, perfiles y exportadores de VF53 e incorpora:

- fuente oficial única: hoja `REPORTE` del Cronológico Maestro;
- TCH estimado 26/27 en resumen CASUR, ficha de hacienda, selección múltiple, análisis por zona y tabla/ficha de cada suerte;
- selección múltiple móvil con seis KPI esenciales y área de renovación/plantilla mostrada solo cuando corresponde;
- exportación de hacienda a PNG con resúmenes gráficos compactos y PDF largo dividido en páginas legibles;
- exportador GitHub/PWA corregido para retirar la plantilla heredada antes de ejecutar la auditoría interna;
- acceso técnico compacto dentro del Panel Ejecutivo: en móvil se reduce a un botón y el Centro Maestro permanece oculto hasta validar la contraseña;
- porcentajes de participación presentados únicamente en el análisis por zona, como referencia territorial discreta;
- fecha efectiva del estimado: 17/07/2026;
- edición manual interna de Cronológico/Maestro e Histórico;
- Centro Maestro bloqueado operativamente y ausente de las exportaciones para personal;
- actualización compartida por archivos versionados dentro de `data/`;
- recepción automática de datos nuevos al abrir la PWA con internet;
- conservación de exportación CASUR completo, por zona, por perfil y por módulos.

## Publicar una actualización normal de datos

1. Abra el Centro Maestro.
2. Cargue el Excel oficial o haga la corrección manual.
3. Valide y aplique el cambio.
4. Genere **Paquete solo datos para GitHub**.
5. En el repositorio, reemplace los seis archivos dentro de la carpeta `data/` y confirme el commit.

No es necesario reemplazar `index.html` para una actualización normal del Cronológico o Histórico. Los dispositivos instalados consultan `data/version.json`; cuando detectan una versión nueva, recargan los datos publicados. Sin internet conservan la última versión disponible.

## Instalación completa

Para una primera instalación o cambio de código/diseño, suba todos los archivos y carpetas del paquete a la raíz de GitHub Pages, respetando la estructura.

## Regla técnica

El bloqueo del Centro Maestro es una barrera operativa. Como GitHub Pages es estático, no debe considerarse seguridad criptográfica contra una persona con conocimientos de desarrollo.
