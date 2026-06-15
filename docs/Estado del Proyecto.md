# Estado del Proyecto — Community Manager Automático

> Bitácora de ejecución: qué se implementó, cuándo y en qué estado quedó cada fase.
> La spec de construcción está en `PROMPT_CURSOR_community_manager.md`; la visión de producto en `CONTEXTO_PRODUCTO.md`.

**Última actualización:** 2026-06-15

---

## Resumen rápido

| Ítem | Estado |
|------|--------|
| **Fase actual** | 5 — cerrada, pendiente de tu revisión |
| **Fases completadas** | 0, 1, 2, 3, 4, 5 |
| **Próximo paso** | Revisar Fase 5 → Fase 6 (generación IA + Canva) |
| **API en local** | `http://localhost:4000` (Postgres :5433, Redis :6379) |

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

- [ ] Revisión humana de Fase 5 (incl. publicación real en cuenta de prueba Meta)
- [ ] Flujo de desconexión/revocación de cuentas
- [ ] Subir repo a GitHub

---

## Fases futuras (no iniciadas)

| Fase | Alcance |
|------|---------|
| 6 | Generación IA + Canva |
| 7 | Fuentes de contenido (sheet/RSS) |
| 8 | UI aprobación + calendario |

---

## Cómo mantener este archivo

Al cerrar una sesión de trabajo o completar una fase, añadir una sección con:

1. **Fecha** (YYYY-MM-DD)
2. **Fase o tema**
3. **Qué se implementó** (breve)
4. **Decisiones** relevantes
5. **Estado del criterio de aceptación** (✅ / ⏳ / ❌)
6. Actualizar **Resumen rápido** y **Última actualización** al inicio
