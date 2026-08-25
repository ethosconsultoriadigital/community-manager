# Guía de despliegue a producción

Checklist **paso a paso** para hostear Community Manager Automático y luego seguir implementando módulos.

**Antes de desplegar:** lee `Arquitectura_Hosting.md` (qué es Vercel, Render, Neon, Upstash y R2).  
En la API, `GET /` da **404** a propósito; la prueba correcta es `GET /health`.

**Stack recomendado (estable y simple):**

| Pieza | Servicio | Por qué |
|-------|----------|---------|
| Web (Next.js) | [Vercel](https://vercel.com) | Encaja con `apps/web` — **esto es lo que abre el usuario** |
| API + workers BullMQ | [Render](https://render.com) o [Railway](https://railway.app) | Proceso Node 24/7 (no serverless) — **no es la web** |
| PostgreSQL | [Neon](https://neon.tech) | `DATABASE_URL` + backups |
| Redis | [Upstash](https://upstash.com) | Colas BullMQ (publicar, tokens, métricas) |
| Media | [Cloudflare R2](https://developers.cloudflare.com/r2/) | URLs HTTPS públicas para Meta |
| DNS / HTTPS | Cloudflare (o el registrar) | `app.` + `api.` |

> **No uses solo Vercel** para todo: la API NestJS con BullMQ **no** debe vivir en serverless.

Dominios de ejemplo (cámbialos por los tuyos):

- Web: `https://app.tudominio.com`
- API: `https://api.tudominio.com`
- Media: `https://media.tudominio.com`

---

## Antes de empezar (checklist)

- [ ] Repo en GitHub actualizado (`main` limpio)
- [ ] Cuentas creadas: Vercel, Railway (o Render), Neon, Upstash, Cloudflare
- [ ] Dominio listo (o usar URLs temporales `*.vercel.app` / `*.up.railway.app` al inicio)
- [ ] App Meta Developer con redirect OAuth preparado (se actualiza al tener URL de API)
- [ ] Generar secretos **nuevos** para producción (no reutilizar los de local si es posible)

Generar secretos en PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Ejecuta **dos veces**: una para `JWT_SECRET` y otra para `TOKEN_ENCRYPTION_KEY`.  
Guárdalos en un gestor de contraseñas. **`TOKEN_ENCRYPTION_KEY` no se puede rotar** sin invalidar todos los tokens OAuth cifrados.

---

## Paso 1 — Neon (PostgreSQL)

1. Crear proyecto en Neon (región cercana a tus usuarios, p. ej. US East o EU).
2. Copiar la connection string **con SSL** (`DATABASE_URL`).
3. En tu PC, apunta temporalmente `.env` local a Neon **solo para migrar** (o usa una variable en la sesión):

```powershell
$env:DATABASE_URL = "postgresql://USER:PASS@HOST/DB?sslmode=require"
pnpm migrate
```

4. Debe imprimir migraciones aplicadas / omitidas sin errores.
5. Activar backups automáticos en Neon.
6. [ ] Neon listo + migraciones aplicadas

---

## Paso 2 — Upstash (Redis)

1. Crear base Redis (región similar a la API).
2. Copiar `REDIS_URL` (suele ser `rediss://...` con TLS).
3. [ ] Upstash listo

---

## Paso 3 — Cloudflare R2 (media)

1. En Cloudflare → R2 → Create bucket (ej. `cm-media-prod`).
2. Crear API token con permiso de lectura/escritura al bucket.
3. Activar acceso público al bucket **o** dominio custom `media.tudominio.com`.
4. Anotar:

| Variable | Ejemplo |
|----------|---------|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | `cm-media-prod` |
| `S3_ACCESS_KEY_ID` | … |
| `S3_SECRET_ACCESS_KEY` | … |
| `S3_REGION` | `auto` |
| `S3_PUBLIC_BASE_URL` | `https://media.tudominio.com` |
| `MEDIA_PUBLIC_BASE_URL` | **igual** que `S3_PUBLIC_BASE_URL` |

5. [ ] R2 listo (Meta debe poder hacer GET a una URL pública de prueba)

---

## Paso 4 — API en Railway (NestJS + BullMQ)

### 4.1 Crear servicio

1. New Project → Deploy from GitHub → este repo.
2. Añadir un servicio **API**.

### 4.2 Build y start (monorepo pnpm)

Configura (Settings → Build / Deploy):

**Build command (Render — recomendado):**

```bash
npx pnpm@9 install --frozen-lockfile && npx pnpm@9 db:generate && npx pnpm@9 --filter @cm/shared build && npx pnpm@9 --filter @cm/db build && npx pnpm@9 --filter @cm/api build
```

> En Render **no uses** `corepack enable` ni `npm install -g pnpm`: el filesystem es de solo lectura (`EROFS`).

**Build command (Railway u otros con write en global):**

```bash
npm install -g pnpm@9 && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @cm/shared build && pnpm --filter @cm/db build && pnpm --filter @cm/api build
```
**Start command:**

```bash
cd apps/api && API_PORT=$PORT node dist/main
```

(Alternativa: `pnpm --filter @cm/api start:prod` desde la raíz, con `API_PORT=$PORT`.)

**Importante — puerto:** la API lee `API_PORT` (no solo `PORT`). En Render/Railway el host inyecta `PORT`; el start command de arriba lo reutiliza.

Sin esto, el healthcheck puede fallar.

### 4.3 Variables de entorno (API)

Copia todas estas en Railway (valores de **producción**):

```
DATABASE_URL=...          # Neon
REDIS_URL=...             # Upstash
JWT_SECRET=...
JWT_EXPIRES_IN=7d
TOKEN_ENCRYPTION_KEY=...  # fijo para siempre en este entorno
META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=https://api.tudominio.com/oauth/meta/callback
FRONTEND_URL=https://app.tudominio.com
API_PORT=4000             # o el PORT que use Railway
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto
S3_PUBLIC_BASE_URL=https://media.tudominio.com
MEDIA_PUBLIC_BASE_URL=https://media.tudominio.com
IMAGE_API_KEY=...         # opcional; sin ella usa mock de imagen
IMAGE_MODEL=dall-e-3
METRICS_STALE_HOURS=6
```

`NEXT_PUBLIC_API_URL` **no** va en la API (solo en Vercel).

### 4.4 Dominio API

1. Settings → Domains → `api.tudominio.com` (o usa el `*.onrender.com` / `*.up.railway.app` temporal).
2. Probar: `https://api.tudominio.com/health` → `{"status":"ok"}`.
3. **Nota:** `https://api.tudominio.com/` (raíz) suele devolver **404** — es normal; la API no tiene página home.
4. [ ] API en HTTPS con health OK

---

## Paso 5 — Web en Vercel (Next.js)

1. Importar el mismo repo en Vercel.
2. **Root Directory:** `apps/web`  
   (si el monorepo falla el install, en Project Settings → General / Install Command usa la raíz; alternativa robusta abajo).

**Opción A — root `apps/web`:**  
Vercel detecta Next.js. Variable:

```
NEXT_PUBLIC_API_URL=https://api.tudominio.com
```

**Opción B — monorepo desde raíz (si hace falta):**

- Install: `pnpm install --frozen-lockfile`
- Build: `pnpm --filter @cm/web build`
- Output: Next default en `apps/web`

3. Dominio: `app.tudominio.com` (o `*.vercel.app` temporal).
4. **Importante:** `NEXT_PUBLIC_*` se fija en **build**. Si cambias la URL de la API, **redeploy**.
5. [ ] Web carga y el login apunta a la API correcta

---

## Paso 6 — CORS y URLs cruzadas

En la API, `FRONTEND_URL` debe ser **exactamente** la URL pública de la web (con `https://`, **sin barra final**).

| Variable | Dónde | Valor |
|----------|-------|-------|
| `FRONTEND_URL` | Render/Railway (API) | `https://community-manager-web.vercel.app` (sin `/` al final) |
| `NEXT_PUBLIC_API_URL` | Vercel (Web) | `https://community-manager-api.onrender.com` |
| `META_REDIRECT_URI` | API + Meta Dashboard | `https://…api…/oauth/meta/callback` |

> Si pones `https://….vercel.app/` con `/` al final, el navegador envía Origin sin barra y **CORS bloquea el login** (parece un error de “no se pudo conectar con la API”).

1. [ ] Login desde la web sin error CORS
2. [ ] `GET /auth/me` con el JWT funciona

---

## Paso 7 — Meta OAuth (producción / desarrollo)

1. [developers.facebook.com](https://developers.facebook.com) → tu app.
2. Valid OAuth Redirect URI: `https://api.tudominio.com/oauth/meta/callback`.
3. En modo **Development** solo cuentas de prueba; para clientes reales harán falta App Review + Live (después del deploy).
4. En la web: `/cuentas` → Conectar Meta.
5. [ ] Cuenta Meta conectada (token cifrado en Neon)

---

## Paso 8 — Smoke test de producción

Hazlo en orden:

1. [ ] `https://api…/health` → ok  
2. [ ] Abrir landing `https://app…/`  
3. [ ] Login (registrar agencia si es entorno limpio, o usar usuario de prueba)  
4. [ ] Crear cliente vía API si la lista está vacía:

```powershell
$auth = Invoke-RestMethod -Uri "https://api.tudominio.com/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"TU_EMAIL","password":"TU_PASS"}'
$headers = @{ Authorization = "Bearer $($auth.accessToken)" }
Invoke-RestMethod -Uri "https://api.tudominio.com/clients" -Method POST `
  -ContentType "application/json" -Headers $headers `
  -Body '{"name":"Cliente Demo"}'
```

5. [ ] Composer → subir imagen o generar → enviar a aprobación  
6. [ ] Aprobar → programar (unos minutos) → verificar publicación / estado  
7. [ ] `/reportes` → Sincronizar (si hay posts publicados)  
8. [ ] Revisar logs de Railway (sin tokens en claro)

---

## Paso 9 — DNS (cuando tengas dominio propio)

Ejemplo Cloudflare:

| Tipo | Nombre | Destino |
|------|--------|---------|
| CNAME | `app` | cname de Vercel |
| CNAME | `api` | dominio de Railway |
| CNAME | `media` | R2 custom domain |

Activa HTTPS (proxied / certificados automáticos).  
Tras cambiar dominios, actualiza variables y **redeploy** web + API.

---

## Paso 10 — Operación mínima (no saltar)

- [ ] Backups Neon verificados (restaurar una vez de prueba)
- [ ] Alerta uptime sobre `https://api…/health` (UptimeRobot / Better Stack)
- [ ] Secretos solo en paneles (nunca en Git)
- [ ] Una sola réplica de API al inicio (BullMQ en el mismo proceso)

---

## Coste orientativo (inicio)

~35–80 USD/mes según tráfico y planes free/hobby. Neon + Upstash free tiers suelen bastar para demos.

---

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| CORS en login | `FRONTEND_URL` ≠ URL real de la web | Igualar exactamente (https, sin `/`) |
| Web llama a localhost | `NEXT_PUBLIC_API_URL` mal o sin redeploy | Corregir y **Rebuild** en Vercel |
| Health falla / 502 | `API_PORT` ≠ puerto del host | Alinear `API_PORT` con Railway `PORT` |
| Meta no publica media | URL no pública / R2 mal | Probar GET del `storage_url` en el navegador |
| Jobs no corren | Redis caído o API dormida | Revisar Upstash + que la API no esté en sleep |
| Tokens Meta rotos tras redeploy | Cambiaste `TOKEN_ENCRYPTION_KEY` | Restaurar la clave original o reconectar cuentas |
| Build monorepo falla | pnpm/workspace | Build por filtros `@cm/shared` → `@cm/db` → `@cm/api` |

---

## Alternativa “todo en Railway”

Si prefieres un solo panel: Web + API + (opcional) Postgres/Redis en Railway, y R2 aparte.  
Vercel + Neon sigue siendo mejor para el frontend y la DB; Railway para la API es el punto crítico.

---

## Después del deploy (siguiente fase de producto)

Con el hosting estable, continúa por módulos **sin rehacer el núcleo**:

1. Clientes en UI (hoy se crean por API)
2. LLM copy real (`LLM_API_KEY` / proveedor)
3. Imagen OpenAI en prod (`IMAGE_API_KEY` de OpenAI, no Anthropic)
4. Meta App Review si hay clientes reales
5. Fuentes de contenido (Fase H), etc.

---

## Referencias en el repo

| Documento | Uso |
|-----------|-----|
| `.env.example` | Lista de variables |
| `docs/Instrucciones de puesta en marcha.md` | Desarrollo local |
| `docs/Estado del Proyecto.md` | Bitácora de fases |
| `scripts/verify-project.ps1` | Verificación local previa |

---

## Resumen de orden (imprimible)

1. Neon → migrar  
2. Upstash Redis  
3. R2 media  
4. Railway API + vars + `/health`  
5. Vercel web + `NEXT_PUBLIC_API_URL`  
6. CORS / dominios  
7. Meta redirect  
8. Smoke test  
9. DNS definitivo  
10. Backups + uptime → seguir módulos  
