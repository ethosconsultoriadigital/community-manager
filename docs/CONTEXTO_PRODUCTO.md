# Contexto de producto — Agente Community Manager IA

> Documento de **contexto funcional** para el agente de desarrollo. Describe la visión completa del producto para que las decisiones técnicas sean extensibles y compatibles a futuro. **No incluye precios ni condiciones comerciales** (son irrelevantes para el código). El desarrollo sigue siendo por fases: este documento es el destino, no la tarea de hoy. La hoja de ruta de construcción está en `PROMPT_CURSOR_community_manager.md`.

## Visión
Un "director de redes con IA" que planea, genera, programa, publica, monitorea comentarios y reporta resultados en hasta **4 redes** (Facebook, Instagram, TikTok, LinkedIn/X). Dirigido a pymes, restaurantes, comercios locales, políticos, marcas regionales, franquicias y agencias multi-cuenta.

## Capacidades funcionales
- Calendario de contenido por marca, campaña, temporada y objetivo comercial.
- Generación con IA de copies, hashtags, guiones para reels y respuestas sugeridas.
- Creación de piezas visuales y reels vía Canva / modelo de imagen (cuando el cliente autorice cuentas o APIs).
- Programación y publicación automática o semiautomática, según los permisos de cada red.
- Monitoreo de comentarios, mensajes y palabras sensibles, con **alertas por WhatsApp y correo**.
- Reportes automáticos: crecimiento, interacción, mejores piezas y recomendaciones.
- Soporte a anuncios/campañas (la pauta la paga el cliente; la gestión se trata aparte).

## Dos modelos de integración (afecta permisos y OAuth)
1. **Cuenta operada por la agencia (modelo PyME):** plantillas y flujos operados por la agencia cuando sea viable. Pensado para arrancar rápido con micro negocios.
2. **Cuenta del cliente:** el cliente conecta sus propias cuentas (Business Manager, Canva, activos y permisos) y **conserva la propiedad** de cuentas, diseños y datos.

El sistema debe soportar **ambos** sobre el mismo modelo multi-tenant (agencia → clientes → cuentas), sin bifurcar el código base.

## Reglas de propiedad y seguridad (requisitos técnicos, no negociables)
- Las cuentas de redes son **propiedad del cliente**; la agencia solo recibe **permisos operativos** vía OAuth.
- Todo acceso debe poder **revocarse al terminar el contrato** → se requiere un flujo de desconexión/revocación de tokens por cuenta.
- Los diseños finales quedan en la cuenta o carpeta del cliente cuando el plan lo incluya.
- Para clientes grandes, usar la cuenta Canva / Brand Kit del cliente.
- La **pauta publicitaria** nunca forma parte de la mensualidad ni del flujo de cobro del sistema; se factura/paga aparte.
- Las respuestas automatizadas a comentarios requieren **aprobación humana** en temas sensibles.
- La publicación totalmente automática solo se activa cuando el cliente lo autoriza explícitamente; para marcas sensibles, aprobación humana previa siempre.

## Mapa a las fases técnicas
- **En marcha / núcleo:** publicación + programación (Fases 1–5), empezando por Meta.
- **Próximas:** generación con IA + Canva (Fase 6); fuentes de contenido — calendario fijo y news radar (Fase 7); aprobación humana (Fase 8), central para marcas sensibles.
- **Módulos que añade este documento (fases posteriores, aún NO construir):**
  - Monitoreo de comentarios/mensajes + alertas por WhatsApp y correo.
  - Reportes / analítica (Pilar 3).
  - Gestión de anuncios (Pilar 4).
  - Redes adicionales: TikTok y LinkedIn/X (el enum de plataformas del esquema ya las contempla).

## Principio de diseño que se deriva de todo esto
Mantén detrás de **interfaces** todo lo que varía por contexto: cada **red social**, cada **proveedor de IA** (texto e imagen), y cada **canal de alertas** (WhatsApp, correo). Así se añade una red o un canal nuevo sin reescribir el núcleo. No construir los módulos futuros todavía, pero no cerrarse la puerta a ellos.
