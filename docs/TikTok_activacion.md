# Activación de TikTok — Community Manager

Conectar una cuenta y publicar videos con la Content Posting API (Direct Post, `FILE_UPLOAD`).

Mientras la app no pase la auditoría, TikTok solo ofrece `SELF_ONLY`. El publisher usa esa privacidad y no publica en público.

## Qué hace el producto

- Botón **Conectar TikTok** en Cuentas (si el flag y las credenciales están puestos).
- OAuth 2.0 (cliente confidencial, sin PKCE) → tokens cifrados en `social_accounts`.
- Perfil: `display_name` + `avatar_url`.
- Refresh horario (ventana 2 h) + revoke al desconectar.
- Publicación: solo si el post tiene video. Stories y lugar se ignoran.
- Subida por fragmentos desde R2/S3 (Range) o disco local, sin cargar el MP4 entero.
- El id del post (o el `publish_id` si TikTok aún no devuelve el id público) queda en `post_targets.platform_post_id`.
- El Radar no crea posts para TikTok (solo texto/imagen).

## Checklist en TikTok for Developers

App en [developers.tiktok.com](https://developers.tiktok.com).

1. **Productos**
   - Login Kit (autorizar al usuario).
   - Content Posting API (Direct Post). El inbox (`video.upload` solo) deja el video en borradores de la app de TikTok; este producto usa `video.publish`.
2. **Scopes** (en la URL van separados por coma; el código ya los pide):
   - `user.info.basic`
   - `video.upload`
   - `video.publish`
3. **Redirect URI** exacta, sin barra final de más:
   - Local: `http://localhost:4000/oauth/tiktok/callback`
   - Prod: `https://community-manager-api.onrender.com/oauth/tiktok/callback`
   - Tiene que coincidir con `TIKTOK_REDIRECT_URI`.
4. **Dominios verificados**
   - No hacen falta para `FILE_UPLOAD` (el servidor sube los bytes).
   - Solo harían falta si en el futuro se usara `PULL_FROM_URL`: TikTok tiene que poder descargar una URL de un dominio verificado en el portal. R2 público no sustituye esa verificación.
5. **Sandbox / usuarios de prueba**
   - Con la app en Development, solo los Target Users añadidos en el portal pueden autorizar.
   - Añade la cuenta TikTok con la que vas a probar (la del cliente o una de la agencia).
   - Sin ese usuario, el authorize falla o no devuelve los scopes de publicación.
6. **Auditoría (posts públicos)**
   - Hasta que Content Posting API pase la revisión, `creator_info` devuelve solo `SELF_ONLY` y el video queda privado en el perfil de quien autorizó.
   - La auditoría pide una grabación del flujo real: conectar → aprobar un post con video → verlo publicado en privado.
   - Después de la auditoría se puede elegir `PUBLIC_TO_EVERYONE`. Hoy el código sigue forzando `SELF_ONLY` si esa opción está en la lista, para no publicar en público por accidente.
   - Clientes que no son testers solo entran cuando la app deja de estar en sandbox.

## Variables (API / Render)

```env
TIKTOK_PUBLISH_ENABLED=true
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://community-manager-api.onrender.com/oauth/tiktok/callback
```

También: `REDIS_URL`, `TOKEN_ENCRYPTION_KEY`, `FRONTEND_URL`, y el almacenamiento de media (`S3_*` / `MEDIA_PUBLIC_BASE_URL`) para que el worker lea el video por rangos.

No hay variables nuevas: el poll de estado y el tamaño de fragmento (10 MB) están en código.

Migración ya existente: `schema_tiktok_oauth.sql` (`avatar_url`, `connection_status`, `refresh_expires_at`). El enum `tiktok` viene del esquema base.

## Checklist operativo

1. Aplicar migraciones si el entorno no las tiene (`pnpm migrate`).
2. Vars en Render + redeploy de la API (el worker de publicación vive en el mismo proceso).
3. Añadir el usuario de prueba en el sandbox de TikTok.
4. Cuentas → **Conectar TikTok** → autorizar los tres scopes → ver nombre/avatar.
5. Si la fila dice `permisos_incompletos`, volver a conectar y aceptar `video.upload` y `video.publish`.
6. Crear un post con **video** (MP4 o MOV), aprobarlo y programarlo. Una foto sola falla el destino TikTok.
7. En el perfil de TikTok el video sale privado hasta la auditoría.
8. Desconectar revoca el token en TikTok y marca la cuenta inactiva.

El worker de `post-publish` reserva el lock 20 minutos para que la subida y el procesado de TikTok no caduquen en Redis.

## Errores

| Síntoma | Causa |
|---------|--------|
| Sin botón | Flag o credenciales incompletos |
| `?error=tiktok_state` | State Redis expirado o reutilizado |
| `?error=tiktok_denied` | Usuario canceló o la app rechazó |
| `permisos_incompletos` | Falta `video.upload` o `video.publish` |
| `requiere_reconexion` | El refresh falló; volver a conectar |
| Destino failed «requiere un video» | El post no tiene `media_assets` de tipo video |
| `SELF_ONLY` / sandbox | Normal hasta la auditoría: el video es privado |
| `frame_rate_check_failed` u otro `fail_reason` | TikTok rechazó el archivo; el texto queda en `post_targets.error_message` |

Ver `docs/Plan_Redes_Adicionales.md` (Fase 3).
