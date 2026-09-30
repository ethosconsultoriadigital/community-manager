# Activación de TikTok (OAuth / conexión) — Community Manager

Guía para **conectar** cuentas TikTok. La publicación de videos no forma parte de esta fase.

## Qué hace el producto

- Botón **Conectar TikTok** en Cuentas (si el flag está activo).
- OAuth 2.0 (sin PKCE, cliente confidencial) → tokens cifrados en `social_accounts`.
- Perfil: `display_name` + `avatar_url`.
- Refresh horario (ventana 2 h) + revoke al desconectar.
- Aviso en UI: publicaciones privadas hasta auditoría de TikTok.

## App en developers.tiktok.com

1. Crea una app Login Kit / Content Posting.
2. Redirect URI exacta:
   - Local: `http://localhost:4000/oauth/tiktok/callback`
   - Prod: `https://community-manager-api.onrender.com/oauth/tiktok/callback`
3. Scopes: `user.info.basic`, `video.upload`, `video.publish`.

## Variables (API / Render)

```env
TIKTOK_PUBLISH_ENABLED=true
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://community-manager-api.onrender.com/oauth/tiktok/callback
```

También: `REDIS_URL`, `TOKEN_ENCRYPTION_KEY`, `FRONTEND_URL`.

Migración: `schema_tiktok_oauth.sql` (columnas `avatar_url`, `connection_status`, `refresh_expires_at`).

## Checklist

1. Aplicar migración en Neon / local (`pnpm migrate`).
2. Vars en Render + redeploy API y web.
3. Cuentas → **Conectar TikTok** → autorizar → ver nombre/avatar.
4. Desconectar debe revocar en TikTok y marcar inactiva.

## Errores

| Síntoma | Causa |
|---------|--------|
| Sin botón | Flag/credenciales incompletos |
| `?error=tiktok_state` | State Redis expirado o reutilizado |
| `?error=tiktok_denied` | Usuario canceló o app rechazó |
| `permisos_incompletos` | Falta `video.upload` o `video.publish` |
| `requiere_reconexion` | Refresh falló; volver a conectar |

Ver `docs/Plan_Redes_Adicionales.md` (Fase 3).
