# Plan — Redes adicionales (Threads, X, TikTok)

> Plan de ejecución aditivo. **No modificar el camino feliz de Facebook/Instagram.**
> Spec general: `PROMPT_CURSOR_community_manager.md`. Bitácora: `Estado del Proyecto.md`.

**Orden:** Fase 0 → Fase 1 (Threads) → Fase 2 (X) → Fase 3 (TikTok) → Fase 4 (métricas).  
Tras cada fase: revisar en staging antes de la siguiente.

---

## Principios

1. Un publisher por red detrás de `PlatformPublisher`.
2. `PlatformPublisherRegistry` despacha por `social_accounts.platform`.
3. Feature flags por red (`THREADS_PUBLISH_ENABLED`, etc.). Apagado = sin OAuth ni publish.
4. Tokens cifrados AES-256-GCM; nunca en logs.
5. Toda consulta filtrada por `agency_id`.
6. Publicar siempre exige `approvals` previo.
7. Migraciones nuevas e inmutables; no editar las ya aplicadas.
8. No meter lógica de X/TikTok/Threads dentro de `meta-publish.service.ts`.

---

## Fase 0 — Arquitectura (registry + flags) ✅

**Entregables:**
- `PublishPlatform` ampliado (`facebook` | `instagram` | `threads` | `x` | `tiktok`).
- `platform-features.ts`: helpers de flags.
- `PlatformPublisherRegistry`: Meta para FB/IG; Threads cuando el flag está activo; X/TikTok reservados.
- `PublishPostService` usa el registry (comportamiento Meta idéntico).
- `MetaTokenRefreshService` solo refresca `facebook`/`instagram`.
- Documento de plan (este archivo).
- Variables en `.env.example` (flags y credenciales futuras).

**Aceptación:** ✅ tests de publish FB/IG + registry verdes; red no registrada → error claro por destino.

---

## Fase 1 — Threads ✅ código (activación operativa pendiente)

**Entregables:**
- Migración `schema_threads_platform.sql`: `ALTER TYPE social_platform ADD VALUE 'threads'`.
- Módulo `platforms/threads/`: OAuth (`threads.net`) + publish (`graph.threads.net`).
- Endpoints: `GET /oauth/threads/connect-url`, `GET /oauth/threads/callback`, status; `GET /platforms/features`.
- UI Cuentas: «Conectar Threads» si el flag está activo.
- Composer/Radar: destino Threads si hay cuenta activa (auto-promote reutiliza copy FB/IG).
- Tests OAuth/publish/dispatch.
- Flag `THREADS_PUBLISH_ENABLED=true` + `THREADS_APP_ID` / `THREADS_APP_SECRET` / `THREADS_REDIRECT_URI`.

**Aceptación:** ✅ código listo; ⏳ conectar cuenta de prueba y publicar requiere credenciales + migración en el entorno.

**Operativo Meta App Dashboard:**
1. App con caso de uso **Threads API**.
2. Redirect URI = `THREADS_REDIRECT_URI`.
3. Permisos: `threads_basic`, `threads_content_publish` (insights después).
4. En desarrollo: testers de la app; App Review para clientes reales.

---

## Fase 2 — X (Twitter) — pendiente

- App developer.x.com + plan con write.
- OAuth 2.0 + refresh; `X_PUBLISH_ENABLED`.
- Publisher `POST /2/tweets`; truncado/hilo de caption.
- Sin tocar Meta ni Threads.

---

## Fase 3 — TikTok — pendiente

- TikTok Content Posting API + App Review.
- MVP: video (Composer Reel/video).
- `TIKTOK_PUBLISH_ENABLED`.

---

## Fase 4 — Métricas — pendiente

- Ampliar sync insights por red sin alterar sync Meta.
- Habilitar filtros en Reportes cuando haya datos.

---

## Flags de entorno

| Variable | Default | Efecto |
|----------|---------|--------|
| `THREADS_PUBLISH_ENABLED` | `false` | Activa OAuth + publish Threads |
| `X_PUBLISH_ENABLED` | `false` | (Fase 2) |
| `TIKTOK_PUBLISH_ENABLED` | `false` | (Fase 3) |

---

## Checklist anti-regresión Meta

- [ ] Publicar FB feed / foto / video
- [ ] Publicar IG feed / Reel / Story
- [ ] Refresco de tokens Meta
- [ ] Conectar Meta desde Cuentas
- [ ] Tests `@cm/api` publish-post + meta-publish
