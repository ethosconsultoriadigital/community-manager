# Activación de X (Twitter) — Community Manager

Guía operativa para conectar cuentas X sin tocar Meta/Threads.

## Qué hace el producto

- Botón **Conectar X** en Cuentas (si el flag está activo).
- OAuth 2.0 con PKCE → token + refresh cifrados en `social_accounts` (`platform = x`).
- Publicación: `POST /2/tweets` (texto + hasta 4 imágenes). Captions largos → hilo.
- Imágenes: se descargan desde storage y se suben a `POST /2/media/upload` (no se envía la URL a X).
- Refresh horario de access tokens (ventana ~6 h).

## App en developer.x.com

1. Crea un proyecto/app en [developer.x.com](https://developer.x.com).
2. Tipo de app con **OAuth 2.0** (User authentication).
3. Client type: **Confidential** (usa Client Secret).
4. Callback / Redirect URI (exacta):
   - Local: `http://localhost:4000/oauth/x/callback`
   - Prod: `https://community-manager-api.onrender.com/oauth/x/callback`
5. Scopes necesarios: `tweet.read`, `tweet.write`, `users.read`, `media.write`, `offline.access`.
6. Plan con permiso de **escritura** (sin write no se puede publicar).

## Variables de entorno (API)

```env
X_PUBLISH_ENABLED=true
X_CLIENT_ID=...
X_CLIENT_SECRET=...
X_REDIRECT_URI=https://community-manager-api.onrender.com/oauth/x/callback
```

También requiere `TOKEN_ENCRYPTION_KEY`, `JWT_SECRET`, `FRONTEND_URL` (ya usadas por Meta/Threads).

Tras guardar en Render: **redeploy** de la API (y web si hace falta el botón).

**Importante:** si la cuenta X se conectó **antes** de añadir `media.write`, hay que **desconectar y volver a conectar** para obtener el scope nuevo.

## Checklist de prueba

1. En Cuentas, elegir cliente → **Conectar X**.
2. Autorizar en X → volver a `/cuentas?connected=x`.
3. La cuenta aparece como plataforma **X** con `@username`.
4. Composer: post de **texto** o **texto + imagen** destino X → aprobación → publicar.
5. Verificar tweet (o hilo si el caption > 280 caracteres) y adjuntos.

## Errores frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| Botón «Conectar X» no aparece | Flag/credenciales incompletos (`GET /platforms/features` → `x: false`) |
| 503 al conectar | `X_PUBLISH_ENABLED` false o faltan vars |
| Invalid redirect | URI distinta a la de la app X |
| 403 / Token sin media.write | Reconectar cuenta X (falta scope) o plan sin write |
| Token refresh falla | Falta `offline.access` (sin refresh_token) |

## Límites actuales

- Hasta **4** imágenes (JPG/PNG/WEBP/GIF, máx. 5 MB c/u).
- Video aún no.
- Stories no aplican.
- No métricas de X (Fase 4 del plan de redes).

Ver también: `docs/Plan_Redes_Adicionales.md` (Fase 2).
