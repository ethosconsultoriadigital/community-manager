# Activación de X (Twitter) — Community Manager

Guía operativa para conectar cuentas X sin tocar Meta/Threads.

## Qué hace el producto

- Botón **Conectar X** en Cuentas (si el flag está activo).
- OAuth 2.0 con PKCE → token + refresh cifrados en `social_accounts` (`platform = x`).
- Publicación: `POST /2/tweets` (texto). Captions largos → hilo (reply chain).
- Media (imagen/video): **aún no** se adjunta; se publica solo el caption.
- Refresh horario de access tokens (ventana ~6 h).

## App en developer.x.com

1. Crea un proyecto/app en [developer.x.com](https://developer.x.com).
2. Tipo de app con **OAuth 2.0** (User authentication).
3. Client type: **Confidential** (usa Client Secret).
4. Callback / Redirect URI (exacta):
   - Local: `http://localhost:4000/oauth/x/callback`
   - Prod: `https://community-manager-api.onrender.com/oauth/x/callback`
5. Scopes necesarios: `tweet.read`, `tweet.write`, `users.read`, `offline.access`.
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

## Checklist de prueba

1. En Cuentas, elegir cliente → **Conectar X**.
2. Autorizar en X → volver a `/cuentas?connected=x`.
3. La cuenta aparece como plataforma **X** con `@username`.
4. Composer: crear post de **texto** destino X → aprobación → publicar.
5. Verificar tweet (o hilo si el caption > 280 caracteres).

## Errores frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| Botón «Conectar X» no aparece | Flag/credenciales incompletos (`GET /platforms/features` → `x: false`) |
| 503 al conectar | `X_PUBLISH_ENABLED` false o faltan vars |
| Invalid redirect | URI distinta a la de la app X |
| 403 / write not permitted | Plan sin write o scopes incompletos |
| Token refresh falla | Falta `offline.access` (sin refresh_token) |

## Límites MVP

- Solo texto (sin media upload).
- Stories no aplican.
- No métricas de X (Fase 4 del plan de redes).

Ver también: `docs/Plan_Redes_Adicionales.md` (Fase 2).
