# Instrucciones de puesta en marcha

Guía para levantar el proyecto en una máquina nueva (otra PC, otro desarrollador).  
Para el estado actual del desarrollo, ver `Estado del Proyecto.md`.

---

## 1. Requisitos previos

| Herramienta | Versión recomendada | Notas |
|-------------|---------------------|-------|
| **Node.js** | 20 LTS o superior | Incluye npm |
| **pnpm** | 9+ | `npm install -g pnpm` |
| **Docker Desktop** | Reciente | Para Postgres y Redis |
| **Git** | Cualquiera reciente | Para clonar el repo |

Opcional: **curl** o PowerShell para probar endpoints.

---

## 2. Obtener el código

```bash
git clone <url-del-repositorio>
cd "Community Manager Automatico"
```

Si aún no está en GitHub, copiar la carpeta del proyecto por otro medio (USB, sincronización, etc.).

---

## 3. Variables de entorno

```bash
# En la raíz del proyecto
cp .env.example .env   # En Windows: copiar .env.example a .env manualmente
```

Editar `.env` y completar al menos:

| Variable | Descripción | Ejemplo / cómo generar |
|----------|-------------|------------------------|
| `DATABASE_URL` | Conexión Postgres | Ya viene con puerto **5433** |
| `REDIS_URL` | Redis local | `redis://localhost:6379` |
| `JWT_SECRET` | Firma de sesión JWT | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `TOKEN_ENCRYPTION_KEY` | Cifrado tokens OAuth (32 bytes base64) | Mismo comando que arriba |
| `META_APP_ID` | App de Meta | Developer Dashboard |
| `META_APP_SECRET` | Secret de Meta | Developer Dashboard |
| `META_REDIRECT_URI` | Callback OAuth | `http://localhost:4000/oauth/meta/callback` |
| `FRONTEND_URL` | Redirección tras OAuth | `http://localhost:3000` |

**Importante:**
- Sin espacios después del `=` en `.env` (ej. `META_APP_ID=123`, no `META_APP_ID= 123`).
- **Nunca** commitear `.env` (ya está en `.gitignore`).

---

## 4. Infraestructura (Docker)

```bash
docker compose up -d
docker compose ps
```

Debe mostrar `cm-postgres` y `cm-redis` en estado **healthy**.

| Servicio | Puerto en host |
|----------|----------------|
| PostgreSQL 16 | **5433** (no 5432; evita conflicto con Postgres local) |
| Redis 7 | **6379** |

Base de datos: `community_manager` — usuario `postgres` — contraseña `devpass` (solo desarrollo).

---

## 5. Dependencias y migraciones

```bash
pnpm install
pnpm migrate
```

El runner aplica en orden:

1. `schema_base.sql`
2. `schema_content_sources.sql`
3. `schema_auth_password.sql`

Verificar tablas (opcional):

```bash
docker compose exec postgres psql -U postgres -d community_manager -c "\dt"
```

Deben aparecer 11 tablas de negocio + `schema_migrations`.

---

## 6. Generar cliente Prisma (si hace falta)

Tras cambios en el esquema SQL o en otra máquina:

```bash
pnpm db:pull      # introspección desde Postgres
pnpm db:generate  # generar @prisma/client
pnpm --filter @cm/db build
```

Si `prisma generate` falla por permisos en Windows (archivo bloqueado), cerrar la API y reintentar.

---

## 7. Arrancar las aplicaciones

En **terminales separadas** (o en background):

```bash
# API NestJS — puerto 4000
pnpm dev:api

# Frontend Next.js — puerto 3000
pnpm dev:web
```

Comprobación rápida:

- API: http://localhost:4000/health → `{"status":"ok"}`
- Web: http://localhost:3000

---

## 8. Scripts útiles (raíz del monorepo)

| Comando | Uso |
|---------|-----|
| `pnpm migrate` | Aplicar migraciones SQL |
| `pnpm dev:api` | API en modo desarrollo |
| `pnpm dev:web` | Web en modo desarrollo |
| `pnpm build` | Build de todos los paquetes |
| `pnpm test` | Tests (`@cm/shared` + `@cm/db`) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |

---

## 9. Probar autenticación (Fase 2)

```powershell
# Registrar agencia + usuario
$auth = Invoke-RestMethod -Uri "http://localhost:4000/auth/register" -Method POST `
  -ContentType "application/json" `
  -Body '{"agencyName":"Mi Agencia","email":"yo@ejemplo.com","password":"TuPass123!"}'

$token = $auth.accessToken
$headers = @{ Authorization = "Bearer $token" }

# Crear cliente (marca)
Invoke-RestMethod -Uri "http://localhost:4000/clients" -Method POST `
  -ContentType "application/json" -Headers $headers `
  -Body '{"name":"Mi Marca"}'
```

---

## 10. Probar OAuth Meta (Fase 3)

### En Meta Developer Dashboard

1. App en modo **Development**.
2. **Valid OAuth Redirect URI:** `http://localhost:4000/oauth/meta/callback`
3. **Use cases:** activar permisos hasta **Ready for testing**, entre otros:
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
   - `business_management`
   - `instagram_basic`, `instagram_content_publish`

### En local

```powershell
# Tras login, obtener clientId y token
curl.exe -v -H "Authorization: Bearer <TOKEN>" `
  "http://localhost:4000/oauth/meta/connect?clientId=<CLIENT_UUID>"
```

Abrir en el navegador la URL del header `Location:` (Facebook). Tras autorizar, verificar:

```powershell
Invoke-RestMethod -Uri "http://localhost:4000/social-accounts" -Headers $headers
```

```bash
docker compose exec postgres psql -U postgres -d community_manager -c \
  "SELECT platform, external_account_id, left(encode(access_token_enc,'hex'),32) FROM social_accounts;"
```

El token debe verse como hex aleatorio, **no** como texto `EAAB...`.

---

## 11. Problemas frecuentes

| Problema | Solución |
|----------|----------|
| `password authentication failed` en Postgres | Otro Postgres en 5432; usar `DATABASE_URL` con puerto **5433** |
| API no arranca: `JWT_SECRET no está definida` | Completar `.env` |
| `Invalid Scopes` en Facebook | Permisos no añadidos al use case en Meta Dashboard |
| `401` en `/oauth/meta/connect` | Falta header `Authorization: Bearer <token>` |
| `EADDRINUSE` puerto 4000 | Cerrar proceso anterior en ese puerto |
| `prisma generate` EPERM | Cerrar API/node que use el cliente Prisma |

---

## 12. Estructura del monorepo (referencia)

```
/apps/api          → NestJS (backend)
/apps/web          → Next.js (frontend)
/packages/db       → Prisma + repositorios
/packages/shared   → Tipos + cifrado tokens
/migrations        → SQL fuente de verdad + runner
docker-compose.yml → Postgres + Redis
.env.example       → Plantilla de variables (versionada)
```

Documentación relacionada:

- `docs/PROMPT_CURSOR_community_manager.md` — plan por fases
- `docs/CONTEXTO_PRODUCTO.md` — visión de producto
- `docs/Estado del Proyecto.md` — bitácora de lo implementado
