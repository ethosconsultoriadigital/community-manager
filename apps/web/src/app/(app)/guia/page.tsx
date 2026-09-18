'use client';

import Link from 'next/link';

const SECTIONS = [
  {
    id: 'inicio',
    title: 'Inicio',
    body: 'Resumen visual de tus posts: pendientes de aprobación, aprobados sin programar, programados y publicados. Toca una tarjeta para ir a Aprobaciones o Calendario.',
  },
  {
    id: 'composer',
    title: 'Generar Contenido',
    body: 'Crea el texto del post, elige destinos (redes) y adjunta media. Puedes generar con IA (foto o Reel), subir un archivo o usar la biblioteca. Si marcas varias redes, se crea un post por red. Todo pasa por aprobación humana antes de publicar.',
  },
  {
    id: 'biblioteca',
    title: 'Biblioteca',
    body: 'Guarda textos e imágenes/videos para reutilizarlos en nuevos posts sin volver a escribirlos o subirlos.',
  },
  {
    id: 'radar',
    title: 'Conectar fuente',
    body: 'Conecta un Radar o Google Sheet para importar ideas o noticias y promoverlas a la bandeja de pendientes.',
  },
  {
    id: 'approvals',
    title: 'Aprobaciones',
    body: 'Revisa lo pendiente: edita, aprueba o rechaza. También puedes programar la fecha de publicación y descargar parrilla PDF.',
  },
  {
    id: 'calendar',
    title: 'Calendario',
    body: 'Vista de lo programado y publicado. Puedes editar, desprogramar o revisar errores de publicación.',
  },
  {
    id: 'reportes',
    title: 'Reportes',
    body: 'Métricas de publicaciones en Meta (likes, comentarios, etc.) y exportación / análisis cuando esté disponible.',
  },
  {
    id: 'cuentas',
    title: 'Cuentas',
    body: 'Conecta o desconecta Facebook, Instagram u otras redes del cliente con el que trabajas.',
  },
  {
    id: 'perfil',
    title: 'Perfil',
    body: 'Datos de tu usuario. El tema claro/oscuro se cambia desde el menú lateral (botón Tema).',
  },
  {
    id: 'flujo',
    title: 'Flujo recomendado',
    body: '1) Generar o importar contenido → 2) Aprobar → 3) Programar → 4) El sistema publica → 5) Revisar en Calendario y Reportes. Nunca se publica sin aprobación previa.',
  },
] as const;

export default function GuiaPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Guía del usuario</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Solo lectura. Explica qué hace cada módulo para que no te pierdas. Si necesitas el
          manual completo con capturas, pídeselo a Ethos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="rounded-xl border border-line bg-surface p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{section.body}</p>
            {section.id === 'composer' && (
              <Link
                href="/composer"
                className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
              >
                Ir a Generar Contenido
              </Link>
            )}
            {section.id === 'inicio' && (
              <Link
                href="/inicio"
                className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
              >
                Ir a Inicio
              </Link>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
