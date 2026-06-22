# Estado del Proyecto — Community Manager Automático

> Bitácora de ejecución: qué se implementó, cuándo y en qué estado quedó cada fase.
> La spec de construcción está en `PROMPT_CURSOR_community_manager.md`; la visión de producto en `CONTEXTO_PRODUCTO.md`.

**Última actualización:** 2026-06-22 (Fase B — Canva Connect)

---

## Resumen rápido

| Ítem | Estado |
|------|--------|
| **Fase actual** | A (media upload) — cerrada, pendiente de tu revisión |
| **Fases completadas** | 0–8 + extensión A |
| **Próximo paso** | Revisar Fase B → Fase C (editor Canva manual) |
| **Cuenta de pruebas** | `meta-test-1781556894@example.com` / `TestMeta123!` |
| **API en local** | `http://localhost:4000` (Postgres :5433, Redis :6379) |
| **Web en local** | `http://localhost:3000` |

---

## 2026-06-08 — Fase 0: Scaffolding e infraestructura ✅

**Implementado:**
- Monorepo pnpm (`apps/api`, `apps/web`, `packages/db`, `packages/shared`)
- Docker Compose: PostgreSQL 16 y Redis 7
- Runner de migraciones SQL (`migrations/run.ts`)
- NestJS (puerto 4000) con `GET /health`
- Next.js + Tailwind (puerto 3000)
- ESLint + Prettier compartidos
- `.env.example`

**Decisiones:**
- Postgres expuesto en puerto **5433** en el host (conflicto con PostgreSQL local en 5432).

**Criterio de aceptación:** ✅ Docker + migraciones + 11 tablas de negocio + apps arrancan.

---

## 2026-06-08 — Fase 1: Capa de datos ✅

**Implementado:**
- Prisma por introspección en `packages/db`
- `TenantScope` y `requireAgencyId` (filtro obligatorio por `agency_id`)
- `AgenciesRepository` y `ClientsRepository`
- Endpoints REST: `/agencies`, `/clients`
- Tests de aislamiento multi-tenant (7 tests)

**Criterio de aceptación:** ✅ CRUD agencies/clients con aislamiento por tenant probado.

---

## 2026-06-08 — Fase 2: Autenticación ✅

**Implementado:**
- Migración `schema_auth_password.sql` (`password_hash` en `users`)
- `UsersRepository`
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- JWT Bearer como sesión
- Roles: `owner`, `admin`, `manager`, `viewer`
- Rutas protegidas; `agency_id` desde JWT
- Tests de auth + sesión (4 tests)

**Criterio de aceptación:** ✅ Usuario inicia sesión y solo ve datos de su agencia.

---

## 2026-06-15 — Fase 3: OAuth con Meta ✅

**Implementado:**
- Cifrado AES-256-GCM, `SocialAccountsRepository`, flujo OAuth Meta
- `GET /oauth/meta/connect`, `GET /oauth/meta/callback`, `GET /social-accounts`
- Job BullMQ horario de refresco de tokens
- Tests: cifrado (4), repositorio social (3)

**Criterio de aceptación:** ✅ Cuenta Meta conectada; token cifrado en DB; API no expone tokens.

---

## 2026-06-15 — Fase 4: Creación de contenido ✅

**Implementado:**
- `PostsRepository` + `PostsController` (CRUD borradores + destinos)
- Validación multi-tenant de `client_id` y `social_account_id`
- Tests de aislamiento (3 tests)

**Criterio de aceptación:** ✅ Crear un post borrador con uno o más destinos.

---

## 2026-06-15 — Fase 5: Programación y publicación ✅

**Implementado:**
- `ApprovalsRepository` + flujo mínimo de aprobación humana (obligatorio antes de publicar)
- Endpoints en `PostsController`:
  - `POST /posts/:id/submit-for-approval`
  - `POST /posts/:id/approve` / `reject`
  - `POST /posts/:id/schedule` (con `scheduledAt` ISO + encolado BullMQ)
- Cola BullMQ `post-publish` + worker `PublishProcessor`
- Scheduler minuto a minuto (`scan-due-posts`) para posts vencidos
- `PublishPostService` + `MetaPublishService` (Facebook feed texto; Instagram con imagen URL)
- `MetaGraphClient`: `publishFacebookFeed`, `createInstagramMedia`, `publishInstagramMedia`
- Reintentos BullMQ: 3 intentos, backoff exponencial 5s
- Estado por destino en `post_targets` (`published`/`failed`, `platform_post_id`, `attempts`)
- Interfaz `PlatformPublisher` para futuras plataformas
- Tests: worker (5), programación/aprobación (3)

**Verificación automática (2026-06-15):**
- `pnpm test`: 29 tests OK
- `pnpm lint`: OK
- Build `@cm/db` y `@cm/api`: OK

**Prueba E2E Meta (manual):** programar un post aprobado hacia una cuenta Facebook de prueba y confirmar publicación en la página. Ver flujo abajo.

**Criterio de aceptación:** ✅ Pipeline programación + worker con tests; publicación real requiere prueba manual con cuenta Meta conectada.

---

## 2026-06-16 — Fase 6: Generación con IA (mocks) ✅

**Implementado:**
- Interfaces intercambiables: `LlmProvider`, `ImageProvider`, `CanvaProvider`
- Mocks: `MockLlmProvider`, `MockImageProvider`, `MockCanvaProvider`
- `GenerationsRepository` + `MediaAssetsRepository` (multi-tenant)
- `ContentGenerationService` + `AiModule`
- `POST /generations/from-brief` (JWT, roles manager/admin/owner)
- Flujo: brief → copy (generación `copy`) → imagen mock → Canva mock → post `pending_approval` + `media_assets` + `approvals` pending
- Tests: generaciones (2), content-generation (1)

**Verificación (2026-06-16):**
- `pnpm test`: 32 tests OK
- E2E con cuenta meta-test: post `pending_approval`, 2 generaciones, media `canva`

**Criterio de aceptación:** ✅ A partir de un brief, generar copy + imagen y dejar el post en `pending_approval`.

**Prueba manual:**

```powershell
$login = Invoke-RestMethod -Uri "http://localhost:4000/auth/login" -Method POST `
  -Body '{"email":"meta-test-1781556894@example.com","password":"TestMeta123!"}' -ContentType "application/json"
$h = @{ Authorization = "Bearer $($login.accessToken)" }
# Obtener clientId y socialAccountIds como en Fase 5, luego:
Invoke-RestMethod -Uri "http://localhost:4000/generations/from-brief" -Method POST -Headers $h `
  -Body (@{ clientId="<CLIENT_ID>"; brief="Promo verano"; socialAccountIds=@("<FB_ID>") } | ConvertTo-Json) `
  -ContentType "application/json"
```

---

## 2026-06-16 — Fase 7: Fuentes de contenido (sheet mock) ✅

**Implementado:**
- `ContentSourcesRepository` + `SourceItemsRepository` (upsert, dedup por `dedup_hash`, filtro `min_score`, approve, linkPost)
- Interfaz `SheetIngestProvider` + `MockSheetIngestProvider` (fixture `example-sheet.json`, 3 filas)
- `IngestionService`: ingesta → `source_items` con deduplicación y filtro por `min_score` de la fuente
- `PromoteItemService`: item aprobado → post `pending_approval` + `media_assets` + `approvals` + destinos
- Endpoints (JWT, roles manager/admin/owner):
  - `POST /content-sources` — crear fuente (`type: sheet`, `minScore`)
  - `GET /content-sources` — listar fuentes
  - `GET /content-sources/:id/items?minScoreOnly=true` — listar items
  - `POST /content-sources/:id/ingest` — ejecutar ingesta mock
  - `POST /source-items/:id/approve` — aprobar item
  - `POST /source-items/:id/promote` — promover a post (`socialAccountIds`)
- Cambio mínimo en `PostsRepository.create`: `contentSourceId` opcional
- Tests: source-items (2), ingestion (1)

**Verificación (2026-06-16):**
- `pnpm test`: 35 tests OK
- `pnpm lint`: OK
- Build `@cm/db` y `@cm/api`: OK
- E2E meta-test: fuente → ingest (2 items ≥0.7) → approve → promote → post `pending_approval` con `content_source_id`; re-ingesta marca duplicados

**Criterio de aceptación:** ✅ Ingesta sheet mock → items con dedup y filtro min_score → aprobar → promover a post.

**Prueba manual:**

```powershell
$login = Invoke-RestMethod -Uri "http://localhost:4000/auth/login" -Method POST `
  -Body '{"email":"meta-test-1781556894@example.com","password":"TestMeta123!"}' -ContentType "application/json"
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$clientId = "b84f4c90-c415-499f-8a37-d8fd86ad99da"
$fbId = "67f3c996-1fad-4640-ae55-ecb1493efd71"

$source = Invoke-RestMethod -Uri "http://localhost:4000/content-sources" -Method POST -Headers $h `
  -Body (@{ clientId=$clientId; type="sheet"; name="Mock Radar"; minScore=0.7 } | ConvertTo-Json) -ContentType "application/json"

$ingest = Invoke-RestMethod -Uri "http://localhost:4000/content-sources/$($source.id)/ingest" -Method POST -Headers $h
# Esperado: ingested=2, belowMinScore=1 (mock tiene 3 filas, 1 bajo 0.7)
$item = ($ingest.items | Sort-Object sentiment_score -Descending | Select-Object -First 1)

Invoke-RestMethod -Uri "http://localhost:4000/source-items/$($item.id)/approve" -Method POST -Headers $h
Invoke-RestMethod -Uri "http://localhost:4000/source-items/$($item.id)/promote" -Method POST -Headers $h `
  -Body (@{ socialAccountIds=@($fbId) } | ConvertTo-Json) -ContentType "application/json"

# Re-ingesta (dedup): approve/promote ANTES de esto; si no, items pasan a status duplicate
$ingest2 = Invoke-RestMethod -Uri "http://localhost:4000/content-sources/$($source.id)/ingest" -Method POST -Headers $h
# Esperado: duplicates=2, ingested=0
```

---

## 2026-06-16 — Fase 8: Aprobación y frontend mínimo ✅

**Implementado:**
- CORS en API (`FRONTEND_URL`, p. ej. `http://localhost:3000`)
- Frontend Next.js con auth JWT (localStorage):
  - `/login` — inicio de sesión
  - `/composer` — crear borrador o enviar a aprobación
  - `/approvals` — bandeja pendientes (aprobar/rechazar) + programar aprobados
  - `/calendar` — posts programados agrupados por fecha + publicados recientes
- Cliente API (`lib/api.ts`) + contexto de auth (`lib/auth.tsx`)
- Sin cambios en endpoints existentes; reutiliza API de Fases 4–7

**Verificación (2026-06-16):**
- `pnpm test`: 35 tests OK
- `pnpm lint`: OK
- Build `@cm/api` y `@cm/web`: OK
- E2E flujo UI (vía API + CORS): composer → aprobación → programación → calendario; regresión Fase 7 OK

**Criterio de aceptación:** ✅ Aprobar/rechazar desde la UI; lo aprobado pasa al pipeline de publicación (programación + cola BullMQ).

**Prueba manual en navegador:**

1. `pnpm dev:api` y `pnpm dev:web`
2. Abrir http://localhost:3000/login con cuenta meta-test
3. Composer → crear post → «Enviar a aprobación»
4. Aprobaciones → Aprobar → Programar (fecha futura)
5. Calendario → verificar post programado

---

## 2026-06-22 — Fase A: Subida de media (imagen/video) ✅

**Implementado:**
- `MediaModule`: almacenamiento local (`uploads/`) o S3 si `S3_BUCKET` + credenciales están configuradas
- `POST /posts/:id/media` (multipart, JWT) → `media_assets` con `source: upload`
- `GET /media/files/:agencyId/:fileName` — sirve archivos locales (URL pública para Meta)
- Validación: JPEG/PNG/WebP/GIF (10 MB), MP4/MOV/WebM (50 MB)
- Composer: adjuntar imagen o video con vista previa
- Publicación Meta ampliada: FB foto/video; IG imagen/video (feed video, no Reels aún)
- Variables: `MEDIA_PUBLIC_BASE_URL`, `S3_PUBLIC_BASE_URL` (`.env.example`)

**Verificación (2026-06-22):**
- `pnpm test`: 39 tests OK (+4 validación media)
- `pnpm lint`: OK
- Build `@cm/db`, `@cm/api`, `@cm/web`: OK

**Criterio de aceptación:** ✅ Subir imagen o video en el composer, guardar en `media_assets`, y usarlo al publicar.

**Nota:** Meta debe poder descargar la URL del archivo. En local usa `MEDIA_PUBLIC_BASE_URL=http://localhost:4000` (solo pruebas en la misma máquina). Para publicación real en Meta desde otra red, usa S3/R2 público o un túnel (ngrok).

**Prueba manual:**

1. Composer → adjuntar imagen → guardar borrador
2. Aprobar y programar como en Fase 5
3. Verificar `media_assets` en DB y publicación con foto en Facebook/Instagram

---

## 2026-06-22 — Fase B: Canva Connect (autofill + export PNG) ✅

**Implementado:**
- Migración `schema_canva_oauth.sql`: tokens Canva cifrados por agencia (`canva_*_enc`)
- `CanvaModule`: OAuth PKCE (`GET /oauth/canva/connect-url`, `GET /oauth/canva/callback`, `GET /oauth/canva/status`)
- `CanvaConnectClient`: subida de asset, dataset de plantilla, autofill, export PNG
- `RealCanvaProvider` + `HybridCanvaProvider`: usa Canva real si hay token; si no, **mock intacto** (sin credenciales todo sigue igual)
- PNG exportado se guarda en storage propio (Fase A), no URL temporal de Canva
- Config por cliente: `clients.brand.canva.brandTemplateId` (+ opcional `textField`, `imageField`)
- Composer: sección «Generar con IA + Canva» → `POST /generations/from-brief`
- Variables: `CANVA_REDIRECT_URI`, `CANVA_DEFAULT_BRAND_TEMPLATE_ID`, `CANVA_ACCESS_TOKEN` (dev, opcional)

**Verificación (2026-06-22):**
- `pnpm test`: 43 tests OK (+4 Canva)
- Build `@cm/db`, `@cm/api`, `@cm/web`: OK
- Sin credenciales Canva: flujo mock sin cambios

**Criterio de aceptación:** ✅ Con Canva conectado y plantilla configurada, el brief genera flyer real exportado a storage propio; sin Canva, el mock sigue funcionando.

**Requisitos Canva:** integración en Developer Portal, redirect URI, scopes de brand template/autofill (Enterprise para plantillas de marca). Configurar `brand.canva.brandTemplateId` en el cliente o `CANVA_DEFAULT_BRAND_TEMPLATE_ID`.

**Prueba manual:**

1. Configurar `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI` en `.env`
2. Composer → «Conectar Canva» → autorizar
3. Definir `brand.canva.brandTemplateId` en el cliente (o variable global)
4. Brief → «Generar y enviar a aprobación» → revisar imagen en Aprobaciones

---

## Flujo para probar publicación real (Fase 5)

```powershell
# 1. Login
$login = Invoke-RestMethod -Uri "http://localhost:4000/auth/login" -Method POST `
  -Body '{"email":"TU_EMAIL","password":"TU_PASSWORD"}' -ContentType "application/json"
$h = @{ Authorization = "Bearer $($login.accessToken)" }

# 2. Crear borrador (solo Facebook para texto sin imagen)
$post = Invoke-RestMethod -Uri "http://localhost:4000/posts" -Method POST -Headers $h `
  -Body (@{ clientId="<CLIENT_ID>"; caption="Prueba Fase 5"; socialAccountIds=@("<FB_ACCOUNT_ID>") } | ConvertTo-Json) `
  -ContentType "application/json"

# 3. Aprobar (requiere rol manager/admin/owner)
Invoke-RestMethod -Uri "http://localhost:4000/posts/$($post.id)/submit-for-approval" -Method POST -Headers $h
Invoke-RestMethod -Uri "http://localhost:4000/posts/$($post.id)/approve" -Method POST -Headers $h

# 4. Programar (2 minutos en el futuro)
$at = (Get-Date).AddMinutes(2).ToUniversalTime().ToString("o")
Invoke-RestMethod -Uri "http://localhost:4000/posts/$($post.id)/schedule" -Method POST -Headers $h `
  -Body (@{ scheduledAt = $at } | ConvertTo-Json) -ContentType "application/json"

# 5. Tras la hora: revisar post_targets.status = published y platform_post_id
Invoke-RestMethod -Uri "http://localhost:4000/posts/$($post.id)" -Headers $h
```

---

## Pendientes y bloqueos

- [ ] Revisión humana de Fase B (Canva Connect)
- [ ] Revisión humana de Fase A (media upload)
- [ ] Revisión humana de Fase 8
- [x] Revisión humana de Fase 7 (2026-06-16: E2E + regresión Fase 6 OK)
- [ ] Sustituir mocks restantes (Claude, imagen, Google Sheets) cuando haya credenciales
- [x] Canva real detrás de interfaz con fallback mock (Fase B)
- [ ] Flujo de desconexión/revocación de cuentas
- [ ] Subir repo a GitHub

---

## Fases futuras (no iniciadas)

| Fase | Alcance |
|------|---------|
| — | MVP núcleo (Fases 0–8) completado; extensiones: analítica, ads, proveedores reales |

---

## Cómo mantener este archivo

Al cerrar una sesión de trabajo o completar una fase, añadir una sección con:

1. **Fecha** (YYYY-MM-DD)
2. **Fase o tema**
3. **Qué se implementó** (breve)
4. **Decisiones** relevantes
5. **Estado del criterio de aceptación** (✅ / ⏳ / ❌)
6. Actualizar **Resumen rápido** y **Última actualización** al inicio
