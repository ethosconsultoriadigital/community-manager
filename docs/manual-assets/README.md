# Capturas del Manual de usuario

Carpeta de **screenshots reales** del sistema Community Manager para acompañar `docs/Manual de usuario.md`.

## Cómo completar las fotos

1. Entra a la **URL de producción** (o staging idéntico) con una cuenta demo sin datos sensibles.
2. Captura cada pantalla con el **mismo nombre de archivo** de la tabla (preferible **PNG**).
3. Guarda el PNG en esta carpeta.
4. En el Manual, cambia la extensión de `.svg` → `.png` en la línea de la imagen correspondiente (o deja ambos: el PNG tiene prioridad si actualizas el enlace).
5. Elimina el `.svg` placeholder cuando ya exista el PNG real.
6. Exporta el Markdown a PDF/Word si lo entregas al cliente (Typora, Pandoc, VS Code + extensión, etc.).

## Convención de nombres

| Archivo | Pantalla / momento | Sección del manual |
|---------|--------------------|--------------------|
| `01-login.png` | Login (email + contraseña + logo Ethos) | §2 Acceso |
| `02-inicio.png` | Dashboard Inicio (tarjetas con collage) | §4 / Inicio |
| `03-menu.png` | Barra de navegación completa | §4 Menú |
| `04-admin-clientes.png` | Admin → lista de clientes | §5 / Admin |
| `05-admin-usuarios.png` | Admin → crear/editar usuario (roles + checkboxes clientes) | §5 / Admin |
| `06-cuentas.png` | Cuentas antes de conectar (botón Conectar Meta) | §6.2 |
| `07-cuentas-conectadas.png` | Cuentas con Facebook e Instagram activos | §6.2 |
| `08-composer.png` | Generar Contenido (caption, destinos, modos) | §7 |
| `09-composer-ia.png` | Modo IA + referencia + chips de plataforma | §7 |
| `10-radar.png` | Conectar fuente / items ingeridos | §8 |
| `11-aprobaciones.png` | Bandeja de aprobaciones | §9 |
| `12-calendario.png` | Calendario con posts | §10 |
| `13-reportes.png` | Reportes (gráficos + filtro red) | §11 |
| `14-selector-cliente.png` | Selector de cliente (multi-negocio) | §3.2 / Composer |
| `15-historia.png` | Checkbox «También colgar como historia» | §12 |

## Buenas prácticas de captura

- Resolución escritorio ~1280–1440 px de ancho; recorta barras del navegador si molestan.
- No muestres tokens, contraseñas ni emails de clientes reales.
- Usa datos de demostración (cliente «Demo», captions de prueba).
- Tras un rediseño grande de UI, **vuelve a capturar** las pantallas afectadas.

## Estado actual

Las capturas **PNG** ya están en esta carpeta y el PDF generado está en `docs/Manual de usuario.pdf`.

Para regenerar el PDF tras cambios en el Markdown o en las imágenes:

```bash
cd docs
npx md-to-pdf "Manual de usuario.md" --config-file md-to-pdf.config.js
```

Para regenerar solo placeholders SVG (si hiciera falta de nuevo):

```bash
node docs/manual-assets/_generate-placeholders.js
```
