# Activación operativa — Threads

> El **código** de OAuth/publicación ya está (Fase 1). Este documento cubre el bloqueo real que vimos en producción: error Meta `1349245` y la confusión admin vs evaluador.

## Error que ya vimos

```json
{
  "error_message": "Invalid Request: The user has not accepted the invite to test the app.",
  "error_code": 1349245
}
```

Aparece al pulsar **Conectar Threads** (en la ventana de Meta/`threads.com`), **no** en el login de Community Manager.

### Qué significa

La app está en **modo Development**. Meta solo deja autorizar Threads a:

1. Roles de la app (Administrador / Desarrollador / Tester de Facebook), **si** la sesión OAuth es **esa** misma identidad Meta, **o**
2. **Evaluadores de Threads** (lista aparte) que **ya aceptaron** la invitación en la app Threads.

### Por qué fallaba siendo “administrador”

Meta **no deja** que un administrador se añada a sí mismo como **evaluador de Threads**. Eso es normal.

Además hay **tres identidades distintas**:

| Identidad | Ejemplo | ¿Sirve para Conectar Threads? |
|-----------|---------|--------------------------------|
| Login del SaaS (email CM) | `tu@ethos.com` | No |
| Admin de la **app** / Business / Página RadarMex | Facebook que administra la app | Solo si **esa** sesión es la que autoriza OAuth |
| Perfil **Threads** (= Instagram ligado) | `@radar.mex` | **Sí**: es la cuenta que se conecta y publica |

Admin de **Página** FB/IG ≠ permiso automático para API de Threads de ese perfil.

---

## Cómo desbloquearlo (elige una ruta)

### Ruta A — Misma sesión limpia (probar primero)

1. Cierra sesión en facebook.com, threads.com e instagram.com.
2. Abre **ventana de incógnito**.
3. Entra a facebook.com con el Facebook que es **Administrador de la app** en Developers.
4. En Community Manager → **Cuentas** → **Conectar Threads**.
5. En la ventana de Meta, autoriza **sin cambiar de cuenta**.
6. Si vuelve a Cuentas con `Threads @…` → listo.

### Ruta B — Otro usuario como evaluador de Threads (recomendada si A falla)

1. Meta Developers → tu app → **Casos de uso** → **Acceder a la API de Threads** → **Configuración**.
2. **Añadir o suprimir evaluadores de Threads** (no es lo mismo que “Roles → Admin”).
3. Invita el **username de Threads/Instagram** con el que vas a publicar (p. ej. `radar.mex`), **o** una cuenta Facebook de prueba que **no** sea ya admin.
4. Esa persona acepta el invite:
   - App Threads → Ajustes → Cuenta → Permisos del sitio web → **Invitaciones** → Aceptar  
   - y/o [developers.facebook.com/requests](https://developers.facebook.com/requests/)
5. Vuelve a **Conectar Threads** en incógnito con **esa** cuenta.

Si el invite se queda en “Pending” sin botón Aceptar (bug conocido de Meta), prueba:

- Recrear invite / esperar y reintentar, o  
- App Meta **nueva solo para Threads** e invitar ahí (varios reportes en el foro de Meta).

### Ruta C — App Review (producción / clientes reales)

Cuando la app salga de Development, usuarios externos ya no dependen de evaluadores. Requiere App Review de permisos `threads_basic` + `threads_content_publish`.

---

## Checklist técnico (ya en el proyecto)

### Variables (Render / `.env`)

```env
THREADS_PUBLISH_ENABLED=true
THREADS_APP_ID=...          # Threads App ID (Settings → Basic), no confundir con App ID de Facebook Login
THREADS_APP_SECRET=...
THREADS_REDIRECT_URI=https://community-manager-api.onrender.com/oauth/threads/callback
```

Redirect en Meta Threads debe coincidir **exacto**.

### En Community Manager

1. Migración `schema_threads_platform.sql` aplicada en Neon.  
2. Redeploy API con flag y secretos.  
3. Cuentas → **Conectar Threads** (botón visible solo si el flag + credenciales están OK).  
4. Composer / Aprobaciones: destino Threads → aprobar → programar → publicar.

### Código OAuth

- Autorizar: `https://threads.com/oauth/authorize` (docs actuales; `.net` redirige a `.com`).  
- API: `graph.threads.net` / `graph.threads.com`.  
- Scopes: `threads_basic`, `threads_content_publish`.

---

## Qué no mezclar

- **Conectar Meta** = Facebook Page + Instagram (Graph de Meta).  
- **Conectar Threads** = usuario Threads / Instagram vía API de Threads.  
- Ver `threads.com` en la barra al autorizar es **normal** (redirect desde `.net`).
