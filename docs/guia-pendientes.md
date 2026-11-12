# Guía — cambios pendientes de documentar

Notas para la Guía del usuario (`/guia` y `docs/Manual de usuario.md`). La guía completa
quedó pospuesta; aquí se apunta cada cambio de comportamiento para incluirlo después.
Formato: fecha · sección de la guía · qué cambió (en lenguaje sencillo).

## Desde 2026-11-11

- **Admin → Clientes → Kit de marca (nuevo).** Cada cliente tiene colores (oscuro,
  principal, acento), fuentes de título y texto, sitio web, texto del botón final (CTA),
  usuario de redes, plantilla de video por defecto y logos para fondo claro / oscuro.
  Si no se llenan, los colores salen del logo.
- **Generar Contenido → Avatar: plantillas (nuevo).** Profesional (por defecto),
  Círculo, Dividido y Clásica (el diseño anterior). Usan logo, colores, fuentes y web del
  Kit de marca; incluyen subtítulos palabra por palabra y una tarjeta final con CTA.
  El logo nunca se recorta ni se tapa.
- **Duración máxima de todos los videos: 15 s.** Reel: 2 escenas (8 + 7 s, por defecto)
  o 1 escena de 12 s (más barato). Avatar: monólogo de hasta ~15 s (~39 palabras).
- **Generar Contenido: un solo «Enviar a aprobación».** Los botones de IA ahora solo dicen
  «Generar foto», «Generar Reel» y «Generar avatar»: generan el media y lo adjuntan al
  post. Después se revisa y se usa el único botón «Enviar a aprobación» (o «Guardar
  borrador») al final del formulario, para cualquier tipo de contenido. Mientras el video
  o la imagen se generan, esos botones se desactivan con el aviso «Esperando a que termine
  el video…». «Quitar media generado» descarta lo generado.
- **Ubicación:** solo quedan «Ubicación de mi página» y pegar el enlace o ID de una página
  de Facebook. Se quitó la búsqueda de lugares (requería un permiso de Meta que no está
  aprobado).
- **Redes (Destinos):** ahora empiezan todas desmarcadas; el usuario elige dónde publicar.
  Botones «Marcar todas» y «Desmarcar todas». Al editar o duplicar un post se conservan
  sus redes.

## Desde 2026-11-12

- **Conectar fuente: cada fuente debe tener sus cuentas.** Al guardar una fuente de Google
  Sheets hay que marcar al menos una cuenta (red); si no, aparece «Elige al menos una cuenta
  (red) para esta fuente…». Si una fuente antigua no tiene cuentas, al sincronizar no se crea
  ningún post (aviso «Esta fuente no tiene cuentas asignadas…») y las noticias esperan hasta
  que se asignen. Antes el sistema elegía la primera cuenta activa de cada red, que podía ser
  de otra marca del mismo cliente (p. ej. RadarMex en lugar de AAB).

## Pendientes ya conocidos (ver auditoría 2026-11-11)

- Conexión paso a paso de cada red (Meta, Threads con evaluador/tester, X, TikTok sandbox).
- Mensaje de saldo de fal.ai («fal.ai se quedó sin saldo…»).
- Fuentes Google Sheets, Aprobaciones (parrilla PDF, duplicar), Calendario, Reportes, roles.
