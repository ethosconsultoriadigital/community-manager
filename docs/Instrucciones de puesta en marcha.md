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
| `NEXT_PUBLIC_API_URL` | URL de la API para el frontend | `http://localhost:4000` |
| `MEDIA_PUBLIC_BASE_URL` | URL base para media subida en local | `http://localhost:4000` |
| `S3_PUBLIC_BASE_URL` | URL pública del bucket (si usas S3/R2) | Opcional |

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
- Web: http://localhost:3000 → login; tras autenticarse: composer, aprobaciones y calendario

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
| `.\scripts\e2e-publish-with-photo.ps1` | Prueba E2E post con foto → Meta |
| `.\scripts\start-media-tunnel.ps1` | Túnel HTTPS para `MEDIA_PUBLIC_BASE_URL` |

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
| `EADDRINUSE` puerto 4000 | Cerrar proceso anterior en ese puerto (`Get-NetTCPConnection -LocalPort 4000`) o usar la API ya levantada |
| `prisma generate` EPERM | Cerrar API/node que use el cliente Prisma |
| Backup `.sql` de 0 bytes | Postgres no estaba levantado; verificar `docker compose ps` |
| `database is being accessed` al restaurar | Parar la API antes de `DROP DATABASE` |
| OAuth falla tras restore en otra PC | `TOKEN_ENCRYPTION_KEY` debe ser idéntica en `.env` |

---

## 12. Backup y restauración de Postgres (desarrollo)

Guía para **exportar** la base de datos de esta máquina e **importarla** en otra PC sin repetir OAuth ni recrear datos de prueba (p. ej. cuenta meta-test).

### Contexto

| Dato | Valor en local |
|------|----------------|
| Contenedor | `cm-postgres` |
| Base de datos | `community_manager` |
| Usuario | `postgres` |
| Contraseña | `devpass` (solo desarrollo) |
| Puerto en host | **5433** |

Los backups incluyen **esquema + datos** (usuarios, clientes, cuentas Meta, posts, etc.).

### Qué copiar a la otra PC

1. **Archivo de backup** (`.sql` o `.dump`) desde la carpeta `backups/`.
2. **`.env`** por separado (no va dentro del dump). Copiar manualmente o recrear desde `.env.example`.
3. **Mismas claves críticas** en la otra máquina:
   - `TOKEN_ENCRYPTION_KEY` → **debe ser idéntica** o los tokens OAuth cifrados dejarán de funcionar.
   - `JWT_SECRET` → puede cambiar (solo invalida sesiones JWT antiguas; el login email/password sigue).
   - Credenciales Meta (`META_APP_ID`, `META_APP_SECRET`, etc.).

**No commitear backups en Git:** contienen datos sensibles. La carpeta `backups/` está en `.gitignore`.

---

### Exportar (generar backup)

**Requisito:** Docker levantado y Postgres healthy (`docker compose up -d`).

**PowerShell (Windows):**

```powershell
# Desde la raíz del proyecto
New-Item -ItemType Directory -Force -Path backups

# SQL plano (recomendado: portable, fácil de inspeccionar)
docker compose exec -T postgres pg_dump -U postgres -d community_manager --no-owner --no-acl `
  | Out-File -Encoding utf8 "backups\community_manager_$(Get-Date -Format 'yyyy-MM-dd').sql"
```

Verificar que el archivo no esté vacío:

```powershell
Get-Item backups\*.sql | Select-Object Name, Length, LastWriteTime
```

**Alternativa compacta** (formato custom, restaurar con `pg_restore`):

```powershell
docker compose exec -T postgres pg_dump -U postgres -d community_manager -Fc -f /tmp/backup.dump
docker compose cp cm-postgres:/tmp/backup.dump "backups\community_manager_$(Get-Date -Format 'yyyy-MM-dd').dump"
```

**Linux / macOS (bash):**

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U postgres -d community_manager --no-owner --no-acl \
  > "backups/community_manager_$(date +%Y-%m-%d).sql"
```

---

### Restaurar en otra PC (máquina nueva)

**Orden recomendado:**

1. Clonar o copiar el repo.
2. Copiar `.env` (o crearlo con las **mismas** claves de cifrado).
3. Copiar el archivo de `backups/` al mismo path del proyecto.
4. Levantar infra:

```powershell
docker compose up -d
docker compose ps   # cm-postgres y cm-redis en healthy
```

5. **Parar la API** si está corriendo (libera conexiones a Postgres).
6. Reemplazar la base vacía por el backup:

```powershell
# Sustituir YYYY-MM-DD por la fecha del archivo
$backup = "backups\community_manager_YYYY-MM-DD.sql"

docker compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS community_manager;"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE community_manager;"

Get-Content $backup -Raw | docker compose exec -T postgres psql -U postgres -d community_manager
```

7. Verificar:

```powershell
docker compose exec postgres psql -U postgres -d community_manager -c "\dt"
docker compose exec postgres psql -U postgres -d community_manager -c "SELECT email, role FROM users;"
```

8. Instalar dependencias y arrancar apps:

```powershell
pnpm install
pnpm dev:api    # terminal 1 — solo una instancia en puerto 4000
pnpm dev:web    # terminal 2
```

9. Probar login (cuenta de pruebas en `Estado del Proyecto.md`):

- http://localhost:3000/login
- `meta-test-1781556894@example.com` / `TestMeta123!`

**Nota:** No hace falta `pnpm migrate` si el backup ya incluye el esquema completo. Si la DB ya tenía datos, usa siempre DROP/CREATE antes de importar.

---

### Restaurar formato `.dump` (custom)

```powershell
docker compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS community_manager;"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE community_manager;"

docker compose cp "backups\community_manager_YYYY-MM-DD.dump" cm-postgres:/tmp/restore.dump
docker compose exec postgres pg_restore -U postgres -d community_manager --no-owner --no-acl /tmp/restore.dump
```

---

### Escenario alternativo: esquema vacío + solo datos

Si en la máquina nueva prefieres aplicar migraciones y cargar solo datos:

**En origen (exportar solo datos):**

```powershell
docker compose exec -T postgres pg_dump -U postgres -d community_manager --data-only --no-owner --no-acl `
  | Out-File -Encoding utf8 "backups\community_manager_data_only.sql"
```

**En destino:**

```powershell
pnpm migrate
Get-Content backups\community_manager_data_only.sql -Raw `
  | docker compose exec -T postgres psql -U postgres -d community_manager
```

Útil cuando el esquema SQL del repo cambió y quieres migraciones frescas; para clonar el entorno de pruebas tal cual, el **dump completo** es más simple.

---

## 13. Prueba E2E: publicar post con foto en Meta

Meta no puede descargar imágenes en `http://localhost:4000`. Para validar publicación con adjunto:

1. `docker compose up -d` + `pnpm dev:api`
2. `.\scripts\start-media-tunnel.ps1` → copiar URL en `.env` como `MEDIA_PUBLIC_BASE_URL`
3. Reiniciar API
4. `.\scripts\e2e-publish-with-photo.ps1`

Con localhost el pipeline funciona pero Meta falla; con túnel público debería publicar.

---

## 15. Editor Canva manual (Fase C)

Flujo: crear borrador → abrir editor Canva → volver a la app → imagen PNG en el post → enviar a aprobación.

### Configuración en Canva Developer Portal

1. Crear integración Connect con los mismos scopes que Fase B
2. **OAuth redirect URI:** `http://localhost:4000/oauth/canva/callback`
3. **Return navigation URL:** `http://localhost:4000/oauth/canva/return` (debe coincidir con `CANVA_RETURN_URL` en `.env`)

### Variables `.env`

```
CANVA_CLIENT_ID=...
CANVA_CLIENT_SECRET=...
CANVA_REDIRECT_URI=http://localhost:4000/oauth/canva/callback
CANVA_RETURN_URL=http://localhost:4000/oauth/canva/return
```

### Prueba manual

1. `pnpm dev:api` + `pnpm dev:web`
2. Login → Composer → **Conectar Canva** (si no está conectado)
3. Escribe caption, selecciona destinos → **Editar en Canva**
4. Edita el diseño en Canva → botón de retorno a la app
5. El Composer carga el borrador con la imagen exportada
6. **Enviar a aprobación** → Aprobaciones → programar → publicar

Si el retorno falla, verás el error en el Composer (`canva_error` en la URL). Revisa logs de la API y que la Return URL del portal coincida exactamente.

---

## 16. Video y Reels en Meta (Fase D)

### Composer

1. Adjuntar un video (MP4, MOV o WebM, hasta 50 MB)
2. Opcional: marcar **«Publicar como Reel en Instagram»**
3. Flujo normal: borrador → aprobación → programación

- **Feed (por defecto):** video en feed de Instagram y Facebook
- **Reel:** Instagram usa `media_type: REELS`; Facebook sigue con video en feed

### Requisito de URL pública

Igual que con fotos: Meta debe descargar el video. Usa túnel o S3/R2:

```powershell
.\scripts\start-media-tunnel.ps1
# → MEDIA_PUBLIC_BASE_URL en .env → reiniciar pnpm dev:api
```

### Script E2E

```powershell
.\scripts\e2e-publish-with-video.ps1 -VideoPath C:\ruta\test.mp4
.\scripts\e2e-publish-with-video.ps1 -VideoPath C:\ruta\test.mp4 -AsReel
```

---

## 14. Estructura del monorepo (referencia)

```
/apps/api          → NestJS (backend)
/apps/web          → Next.js (frontend)
/packages/db       → Prisma + repositorios
/packages/shared   → Tipos + cifrado tokens
/migrations        → SQL fuente de verdad + runner
/backups           → Dumps locales de Postgres (no versionados)
docker-compose.yml → Postgres + Redis
.env.example       → Plantilla de variables (versionada)
```

Documentación relacionada:

- `docs/PROMPT_CURSOR_community_manager.md` — plan por fases
- `docs/CONTEXTO_PRODUCTO.md` — visión de producto
- `docs/Estado del Proyecto.md` — bitácora de lo implementado
