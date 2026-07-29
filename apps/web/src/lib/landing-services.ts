export type LandingService = {
  id: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
};

/** Servicios del producto — editar aquí para actualizar la landing. */
export const LANDING_SERVICES: LandingService[] = [
  {
    id: 'composer',
    title: 'Composer con IA',
    description:
      'Crea copies e imágenes a partir de un brief, o sube tu propio archivo. Listo para aprobación.',
    image: '/landing/service-composer.jpg',
    imageAlt: 'Escritorio con editor de contenido y generación de imagen para redes',
  },
  {
    id: 'approval',
    title: 'Aprobación humana',
    description:
      'Nada se publica sin revisión. El flujo exige aprobación antes de programar o enviar a Meta.',
    image: '/landing/service-approval.jpg',
    imageAlt: 'Panel de aprobación de publicaciones con vista previa',
  },
  {
    id: 'calendar',
    title: 'Calendario y programación',
    description:
      'Agenda publicaciones por cliente y destino. El worker publica cuando llega la hora.',
    image: '/landing/service-calendar.jpg',
    imageAlt: 'Calendario editorial de contenido en pantalla',
  },
  {
    id: 'meta',
    title: 'Publicación en Meta',
    description:
      'Facebook e Instagram: texto, foto, video y Reels, solo con APIs oficiales Graph.',
    image: '/landing/service-meta.jpg',
    imageAlt: 'Publicación en redes desde laptop y teléfono',
  },
  {
    id: 'accounts',
    title: 'Cuentas conectadas',
    description:
      'OAuth Meta por cliente, tokens cifrados y desconexión cuando el contrato termina.',
    image: '/landing/service-accounts.jpg',
    imageAlt: 'Gestión segura de cuentas sociales conectadas',
  },
  {
    id: 'reports',
    title: 'Reportes y métricas',
    description:
      'Sincroniza impresiones, alcance e interacción desde Meta y visualízalos en un panel.',
    image: '/landing/service-reports.jpg',
    imageAlt: 'Dashboard de métricas e interacción en redes',
  },
];

export const LANDING_STEPS = [
  {
    step: '01',
    title: 'Conecta cuentas',
    text: 'OAuth Meta por cliente. Tokens cifrados y desconexión cuando haga falta.',
    image: '/landing/service-accounts.jpg',
  },
  {
    step: '02',
    title: 'Crea y aprueba',
    text: 'Genera con IA, sube media o marca Reel. Siempre con aprobación humana.',
    image: '/landing/service-approval.jpg',
  },
  {
    step: '03',
    title: 'Programa y mide',
    text: 'El calendario publica a la hora acordada. Los reportes muestran el impacto.',
    image: '/landing/service-reports.jpg',
  },
] as const;
