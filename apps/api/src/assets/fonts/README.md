# Fuentes de las plantillas de video

Fuentes que el API trae para quemar texto con libass (ffmpeg `subtitles` con `fontsdir`),
así no dependen de las fuentes instaladas en Render. Una sola variante Bold por familia.

| Archivo | Familia | Licencia |
| --- | --- | --- |
| Poppins-Bold.ttf | Poppins (fuente por defecto) | SIL Open Font License 1.1 |
| Montserrat-Bold.ttf | Montserrat | SIL Open Font License 1.1 |
| Lato-Bold.ttf | Lato | SIL Open Font License 1.1 |
| Inter-Bold.ttf | Inter | SIL Open Font License 1.1 |
| Roboto-Bold.ttf | Roboto | SIL Open Font License 1.1 |
| Oswald-Bold.ttf | Oswald | SIL Open Font License 1.1 |
| Cinzel-Bold.ttf | Cinzel | SIL Open Font License 1.1 |
| PlayfairDisplay-Bold.ttf | Playfair Display | SIL Open Font License 1.1 |

Las variables (Montserrat, Inter, Roboto, Oswald, Cinzel, Playfair Display) se
instanciaron a peso 700 con fontTools desde Google Fonts. Para agregar una fuente:
copiar `<Familia sin espacios>-Bold.ttf` aquí y sumarla a `BRAND_FONTS`
(api: ai/composition/brand-kit.ts) y `BRAND_FONT_OPTIONS` (web: lib/brand-kit.ts).
