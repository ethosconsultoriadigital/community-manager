# Community Manager Automático — Spec de arranque para Cursor

> **Cómo usar este documento:** pégalo como primer mensaje al agente de Cursor (o guárdalo como `PROJECT.md` en la raíz del repo y dile al agente "lee PROJECT.md y empezamos por la Fase 0"). Coloca los archivos `schema_base.sql` y `schema_content_sources.sql` en `/migrations` antes de empezar. **Trabajen fase por fase**: no dejes que el agente intente construir todo en una sola pasada.

---

Eres un ingeniero de software senior. Vamos a construir, desde cero y por fases, un SaaS multi-tenant llamado **Community Manager Automático**. Lee toda esta especificación antes de escribir código y sigue el plan de fases en orden, deteniéndote al final de cada fase para que yo la revise.

## 1. Objetivo del producto

Una plataforma que gestiona las redes sociales de múltiples clientes (marcas/empresas) de forma automatizada pero con aprobación humana: genera contenido (copy + imágenes), lo programa y lo publica vía las APIs oficiales de las plataformas, y analiza resultados. Debe ser **genérico y replicable**: un cliente nuevo se da de alta y se conecta sin tocar código.

## 2. Alcance

**Construimos ahora (en este orden de prioridad):**
1. Publicación y programación de contenido.
2. Generación de contenido con IA (copy + imágenes/flyers).
3. Analítica y reportería de métricas.
4. Gestión de campañas publicitarias (ads).

**Fuera de alcance por ahora (no implementar todavía, pero no romper su futura inclusión):** los pilares 3 y 4 se diseñan como extensiones; deja ganchos pero no los construyas hasta que te lo indique.

## 3. Restricciones duras (no negociables)

- **Solo APIs oficiales para publicar.** Para Meta se usa la Graph API (Instagram + Facebook). Nada de automatización por navegador, scraping, ni acciones masivas de like/follow: violan los ToS y banean la cuenta del cliente.
- **Contexto Meta:** la cuenta de Instagram debe ser Business/Creator vinculada a una página de Facebook. Permisos requeridos: `instagram_content_publish`, `pages_manage_posts`, `pages_read_engagement`, `business_management`. En desarrollo se trabaja con cuentas de prueba; producción requiere App Review y verificación de negocio.
- **Aprobación humana obligatoria** antes de publicar. El sistema propone; una persona aprueba. Nunca publiques automáticamente sin un registro de aprobación.
- **Tokens cifrados siempre.** Los tokens de OAuth se cifran en la capa de aplicación (AES-256-GCM con clave desde variable de entorno/KMS) antes de guardarse. Nunca en texto plano, nunca en logs, nunca en el repo.
- **Aislamiento multi-tenant.** Toda consulta a datos de clientes se filtra por `agency_id`. Ningún endpoint puede devolver datos de otra agencia.
- **Sin secretos en el repo.** Todo va en `.env` (con un `.env.example` versionado sin valores reales).

## 4. Stack tecnológico (recomendado; si prefiero otro me lo dices antes de cambiar)

- **Monorepo** con pnpm workspaces.
- **Backend:** NestJS + TypeScript.
- **Base de datos:** PostgreSQL 16. Acceso tipado con Prisma usando **introspección** (`prisma db pull`) sobre el esquema definido en los `.sql`, o Drizzle. **No redefinas el esquema a mano**: los archivos SQL son la fuente de verdad.
- **Migraciones:** carpeta `/migrations` con runner (p.ej. `node-pg-migrate` o un script propio) que aplica los `.sql` en orden.
- **Cola y scheduling:** BullMQ + Redis.
- **Almacenamiento de media:** S3-compatible (AWS S3 o Cloudflare R2).
- **Frontend:** Next.js + TypeScript + Tailwind.
- **IA:** capa de proveedores intercambiable — un LLM para copy y un modelo de imagen aparte para visuales; **Canva Connect API (Autofill + Brand Templates)** para componer flyers de marca.
- **Tests:** Vitest/Jest; el worker de publicación debe tener tests.

## 5. Estructura del repositorio

```
/apps
  /api          -> NestJS backend
  /web          -> Next.js frontend
/packages
  /db           -> cliente de base de datos y tipos
  /shared       -> tipos y utilidades compartidas
/migrations
  schema_base.sql              (= schema_base.sql)
  schema_content_sources.sql   (= schema_content_sources.sql)
docker-compose.yml          (Postgres + Redis)
.env.example
```

## 6. Base de datos

El esquema canónico está en los dos archivos SQL provistos. Aplícalos **en orden** (base primero; el segundo hace `ALTER TABLE posts`).

Entidades núcleo: `agencies`, `users`, `clients`, `social_accounts` (tokens cifrados), `posts`, `post_targets` (un post → varias cuentas, estado por destino), `media_assets`, `generations` (jobs de IA), `approvals`.

Fuentes de contenido (dos patrones que conviven sobre el mismo pipeline): `content_sources` (cada cliente configura su origen: `manual_calendar`, `news_radar`, `sheet`, `rss`) y `source_items` (staging de items ingeridos; al aprobarse se "promueven" a un `post`).

## 7. Variables de entorno (crear `.env.example`)

```
DATABASE_URL=postgresql://postgres:devpass@localhost:5432/community_manager
REDIS_URL=redis://localhost:6379
TOKEN_ENCRYPTION_KEY=          # 32 bytes en base64, para cifrar tokens OAuth
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3000/api/oauth/meta/callback
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
LLM_API_KEY=
IMAGE_API_KEY=
CANVA_CLIENT_ID=
CANVA_CLIENT_SECRET=
```

## 8. Plan de construcción por fases

Implementa una fase a la vez. Al terminar cada una: corre los tests, deja todo funcionando, y para para que yo revise. No avances solo.

**Fase 0 — Scaffolding e infraestructura.** Monorepo, `docker-compose.yml` con Postgres y Redis, carpeta `/migrations` con runner que aplica los dos `.sql`, `.env.example`, configuración base de NestJS y Next.js, linter y formato.
*Aceptación:* `docker compose up` levanta Postgres y Redis; el runner aplica las migraciones; `\dt` muestra las 11 tablas.

**Fase 1 — Capa de datos.** Cliente de base de datos tipado (Prisma por introspección o Drizzle) en `/packages/db`. Helper de scoping multi-tenant que obliga a filtrar por `agency_id`.
*Aceptación:* CRUD básico de `agencies`/`clients` con aislamiento por tenant probado.

**Fase 2 — Autenticación de la app.** Registro/login de usuarios de agencia, sesión, roles (`owner/admin/manager/viewer`).
*Aceptación:* un usuario inicia sesión y solo ve su agencia.

**Fase 3 — OAuth con Meta.** Flujo de conexión: el cliente autoriza la app (Facebook Login), se obtiene token de larga duración (~60 días), se cifra y se guarda en `social_accounts` con su `external_account_id`, `scopes` y `token_expires_at`. Job de refresco proactivo de tokens.
*Aceptación:* conectar una cuenta de prueba de Meta y verla en `social_accounts` con el token cifrado (no legible en DB).

**Fase 4 — Creación de contenido.** Endpoints para crear `posts` (caption, hashtags, media) y definir `post_targets` (a qué cuentas va).
*Aceptación:* crear un post borrador con uno o más destinos.

**Fase 5 — Programación y publicación.** Cola BullMQ; al aprobarse y programarse un post, se encola; un worker lo publica en Meta al vencer `scheduled_at` (crear contenedor de media → publicar), actualiza el estado por destino en `post_targets` (`published`/`failed`), guarda `platform_post_id`, y reintenta con backoff los fallos.
*Aceptación (núcleo del MVP):* programar un post y verlo publicado en una cuenta de prueba, con estado por destino y reintentos. Con tests del worker.

**Fase 6 — Generación con IA.** Capa de proveedores: LLM genera copy por plataforma; modelo de imagen genera el visual; Canva Connect (Autofill sobre Brand Template) compone el flyer de marca y exporta. Cada job se registra en `generations`.
*Aceptación:* a partir de un brief, generar copy + imagen y dejar el post en estado `pending_approval`.

**Fase 7 — Fuentes de contenido (news radar).** Ingesta configurable por `content_sources`: leer un sheet/RSS, normalizar campos, calcular `dedup_hash`, aplicar `min_score`, y dejar items en `source_items`. Acción de "promover" un item aprobado a `post`.
*Aceptación:* ingerir un sheet de ejemplo, filtrar por score, y promover un item a post.

**Fase 8 — Aprobación y frontend mínimo.** Cola de aprobación (registro en `approvals`), y UI mínima en Next.js: composer, calendario de programados, bandeja de aprobación.
*Aceptación:* aprobar/rechazar desde la UI; lo aprobado pasa al pipeline de publicación.

## 9. Reglas para ti (el agente)

- Pídeme confirmación antes de: instalar dependencias pesadas no listadas, crear o modificar configuración persistente, o cualquier acción externa con efectos (publicar, enviar, gastar).
- Nunca escribas secretos reales en el código ni en commits. Usa `.env`.
- Cifra tokens; nunca los registres en logs.
- Filtra siempre por `agency_id`. Si un query no tiene tenant, está mal.
- Migraciones inmutables: una vez aplicada, no edites una migración; crea una nueva.
- Escribe tests para la lógica crítica (worker de publicación, cifrado, scoping multi-tenant).
- Mantén la capa de IA y la de plataformas detrás de interfaces, para poder añadir TikTok/LinkedIn o cambiar de modelo sin reescribir el núcleo.
- Si algo de esta spec es ambiguo, pregúntame antes de asumir.

## 10. Definición de "primer hito logrado"

El repo se levanta con `docker compose up`, las migraciones aplican el esquema completo, puedo conectar una cuenta de prueba de Meta vía OAuth (token cifrado en DB), crear un post, programarlo y verlo publicado en esa cuenta con su estado reflejado en `post_targets`. Ese es el corazón del MVP; lo demás se construye encima.

---

Empieza por la **Fase 0**. Cuando la termines, muéstrame la estructura del repo y cómo corro el proyecto, y espera mi visto bueno antes de pasar a la Fase 1.
