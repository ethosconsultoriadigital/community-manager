# Arquitectura de hosting — qué es cada pieza

Guía simple para no confundir **web**, **API** y servicios.  
El despliegue paso a paso está en `Guia_Despliegue_Produccion.md`.

---

## Mapa visual

```text
Usuario (navegador)
        │
        ▼
┌──────────────────────────┐
│  VERCEL  = WEB           │  Landing, login, Composer, panel
│  Next.js (apps/web)      │  Lo que VE y usa el usuario
└────────────┬─────────────┘
             │ HTTPS (JSON)
             ▼
┌──────────────────────────┐
│  RENDER  = API           │  Auth, posts, Meta, jobs BullMQ
│  NestJS (apps/api)       │  NO es una página web bonita
└───┬──────────┬────────┬──┘
    │          │        │
    ▼          ▼        ▼
┌────────┐ ┌────────┐ ┌────────────┐
│ Neon   │ │Upstash │ │Cloudflare  │
│Postgres│ │ Redis  │ │ R2 (media) │
└────────┘ └────────┘ └────────────┘
```

---

## 1. Vercel → la web (frontend)

| | |
|--|--|
| **Qué es** | Interfaz: landing, login, Composer, Aprobaciones, Calendario, Reportes, Cuentas |
| **Código** | `apps/web` |
| **URL típica** | `https://algo.vercel.app` (o tu dominio `app.`) |
| **Para qué** | Que el usuario vea pantallas y pulse botones |
| **Qué NO hace** | No guarda en DB, no publica en Meta, no corre colas |

**Variable obligatoria (Vercel → Environment → Production):**

```text
NEXT_PUBLIC_API_URL=https://community-manager-api.onrender.com
```

- Sin barra final.
- Las variables `NEXT_PUBLIC_*` se fijan en el **build**: si la cambias, haz **Redeploy**.

Si falta, el front usa por defecto `http://localhost:4000` y el login falla en producción con el mensaje de “API en el puerto 4000”.

---

## 2. Render → la API (backend)

| | |
|--|--|
| **Qué es** | Cerebro del sistema: JWT, posts, OAuth Meta, uploads, workers |
| **Código** | `apps/api` |
| **URL** | `https://community-manager-api.onrender.com` |
| **Para qué** | Recibir peticiones del front y ejecutar la lógica |
| **Qué NO es** | No es el sitio donde “entras a usar el producto” |

### URLs importantes en la API

| URL | Qué esperas |
|-----|-------------|
| `https://…onrender.com/` | **404** `Cannot GET /` → **normal** (no hay home) |
| `https://…onrender.com/health` | `{"status":"ok"}` → API viva |
| `POST /auth/login` | Login (no se abre como página en el navegador) |

**Variables clave en Render:**  
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`,  
`FRONTEND_URL` (= URL exacta de Vercel), `META_*`, `S3_*`, `MEDIA_PUBLIC_BASE_URL`,  
`RESEND_API_KEY`, `EMAIL_FROM` (Fase E — recuperación de contraseña).

```text
FRONTEND_URL=https://tu-app.vercel.app
META_REDIRECT_URI=https://community-manager-api.onrender.com/oauth/meta/callback
REDIS_URL=rediss://default:…@….upstash.io:6379
```

`REDIS_URL` debe ser solo la URL `rediss://…`, **no** el comando `redis-cli --tls -u …`.

---

## 3. Neon → base de datos (PostgreSQL)

| | |
|--|--|
| **Qué es** | Tablas: agencias, usuarios, clientes, posts, tokens cifrados, métricas… |
| **Para qué** | Guardar datos de forma permanente |
| **Cómo se usa** | Solo vía `DATABASE_URL` en Render (no se abre como sitio web) |

Migraciones: `pnpm migrate` contra Neon (ver guía de despliegue).

---

## 4. Upstash → Redis (colas)

| | |
|--|--|
| **Qué es** | Cola BullMQ |
| **Para qué** | Publicar en Meta, refrescar tokens, sincronizar métricas |
| **Variable** | `REDIS_URL=rediss://…` |

Sin Redis la API puede arrancar, pero los jobs de publicación/tokens fallan.

---

## 5. Cloudflare R2 → archivos (fotos / videos)

| | |
|--|--|
| **Qué es** | Almacenamiento S3-compatible |
| **Para qué** | URLs HTTPS públicas para que Meta descargue media |
| **Variables** | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`, `S3_PUBLIC_BASE_URL`, `MEDIA_PUBLIC_BASE_URL` |

`S3_PUBLIC_BASE_URL` y `MEDIA_PUBLIC_BASE_URL` deben ser **iguales** (URL pública `r2.dev` o dominio custom).

---

## Flujo del login (cómo se conectan)

1. Usuario abre **Vercel** (web).
2. Escribe email/contraseña.
3. El navegador llama a  
   `https://community-manager-api.onrender.com/auth/login`.
4. **Render** valida en **Neon** y devuelve un JWT.
5. Si `FRONTEND_URL` en Render ≠ URL de Vercel → CORS / error de conexión.
6. Si `NEXT_PUBLIC_API_URL` apunta a localhost → el mensaje del puerto 4000.

---

## Qué abrir según lo que quieras hacer

| Quieres… | Abre… |
|----------|--------|
| Usar el producto (landing, login, panel) | URL de **Vercel** |
| Comprobar que la API está viva | `https://community-manager-api.onrender.com/health` |
| Abrir la raíz de Render `/` | Verás 404 → **es correcto** |
| Ver datos | Neon (consola SQL), no el navegador de la API |
| Ver colas | Upstash dashboard |
| Ver archivos subidos | URL pública R2 |

---

## Checklist si el login falla en Vercel

1. [ ] `https://community-manager-api.onrender.com/health` → `{"status":"ok"}`
2. [ ] Vercel tiene `NEXT_PUBLIC_API_URL=https://community-manager-api.onrender.com`
3. [ ] Tras cambiar esa variable → **Redeploy** en Vercel
4. [ ] Render tiene `FRONTEND_URL` = URL exacta de Vercel (https, sin `/` final)
5. [ ] Tras cambiar `FRONTEND_URL` → redeploy en Render
6. [ ] En el navegador (F12 → Network) el login va a `…onrender.com/auth/login`, no a `localhost:4000`

---

## Resumen en una frase

- **Vercel** = lo que ves  
- **Render** = lo que calcula  
- **Neon** = lo que guarda  
- **Upstash** = las tareas en segundo plano  
- **R2** = las fotos y videos  

---

## Documentos relacionados

| Documento | Contenido |
|-----------|-----------|
| `Guia_Despliegue_Produccion.md` | Checklist Neon → Redis → R2 → Render → Vercel → Meta |
| `Instrucciones de puesta en marcha.md` | Desarrollo local |
| `Estado del Proyecto.md` | Bitácora de fases |
