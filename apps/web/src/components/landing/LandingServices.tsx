import { LANDING_SERVICES } from '@/lib/landing-services';

export function LandingServices() {
  return (
    <section id="servicios" className="scroll-mt-20 bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Qué incluye
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Servicios pensados para vender y operar
          </h2>
          <p className="mt-2 text-base text-muted">
            Cada módulo resuelve un paso real del community management multi-cliente.
          </p>
        </div>

        <ul className="mt-12 space-y-14">
          {LANDING_SERVICES.map((service, index) => {
            const reverse = index % 2 === 1;
            return (
              <li
                key={service.id}
                className={`landing-fade-up flex flex-col items-center gap-8 md:flex-row ${
                  reverse ? 'md:flex-row-reverse' : ''
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-full overflow-hidden rounded-xl border border-line bg-canvas shadow-sm md:w-1/2">
                  <img
                    src={service.image}
                    alt={service.imageAlt}
                    className="aspect-[16/10] h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="w-full md:w-1/2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-ink sm:text-2xl">
                    {service.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
                    {service.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
