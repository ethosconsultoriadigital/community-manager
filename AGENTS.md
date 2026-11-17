# Reglas para agentes y colaboradores

## La Guía se actualiza en el mismo commit

Todo cambio de comportamiento visible para el usuario (pantallas, botones, textos, reglas,
mensajes de error, requisitos para conectar redes, límites, etc.) **debe actualizar la Guía en
el mismo commit**:

1. Edita `apps/web/content/guia.md` (fuente única de la Guía). La página `/guia` la muestra y
   el PDF se genera desde ella. Escribe en español, paso a paso y sin tecnicismos.
2. Si agregas o renombras una sección, conserva o actualiza su ancla `{#id}`: los botones «?»
   de cada pantalla (`<PageHeader helpSection="…" />`) enlazan a `/guia#id`.
3. Agrega una línea en la sección **Novedades** de la Guía con la fecha.
4. Regenera el PDF: `pnpm guia:pdf` (necesita Chrome/Chromium; usa `CHROME_PATH` si no está en
   la ruta habitual) y commitea `apps/web/public/guia/Guia-Community-Manager.pdf`.

Si un cambio no se puede documentar todavía, anótalo en `docs/guia-pendientes.md` y explícalo
en la descripción del commit.

## Otras reglas

- Nunca imprimas ni commitees secretos ni valores de variables de entorno.
- No modifiques el logo.
