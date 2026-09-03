# Manual de usuario — Community Manager

> Guía operativa para el cliente final.  
> **Producto:** Community Manager (Ethos Consultoría Digital)  
> **Sitio:** [https://www.ethosconsultoriadigital.com/](https://www.ethosconsultoriadigital.com/)  
> **Última actualización:** 2026-09-03  

Este documento explica cómo usar el sistema día a día. Está pensado para entregarse al equipo operativo.  
Al incorporar nuevas funciones al producto, **este manual debe actualizarse** para mantenerse alineado con la versión en producción.

---

## 1. ¿Qué es Community Manager?

Es una plataforma multi-cliente para **planificar, generar, aprobar, programar y publicar** contenido en redes sociales (hoy Facebook e Instagram vía Meta), con apoyo de inteligencia artificial y **siempre con aprobación humana** antes de publicar.

Flujo típico:

1. Crear o importar contenido (Composer o Conectar fuente / Radar).  
2. Revisar y **aprobar** en Aprobaciones.  
3. **Programar** fecha y hora.  
4. El sistema **publica** automáticamente a la hora acordada.  
5. Revisar resultados en **Reportes** y el **Calendario**.

---

## 2. Acceso al sistema

1. Abre la URL de la aplicación que te entregó Ethos.  
2. Entra con tu **email** y **contraseña**.  
3. Si olvidaste la contraseña, usa **«Olvidé mi contraseña»** y sigue el enlace del correo.  
4. Al iniciar sesión llegarás a **Inicio**.

**Consejos**
- No compartas tu contraseña.  
- Si tu cuenta aparece desactivada, contacta a quien administra la agencia en el sistema.

---

## 3. Roles de usuario (qué puede hacer cada uno)

El sistema distingue varios perfiles. Este manual describe los roles operativos del cliente:

| Rol | Enfoque | Resumen |
|-----|---------|---------|
| **Admin** | Administración de agencia | Clientes, usuarios, panel Admin, publicación y conexión Meta |
| **Manager** | Operación diaria | Crear/editar contenido, aprobar, programar, publicar; puede tener **uno o varios** negocios asignados y elegir en cuál operar |
| **Viewer** | Solo lectura | Consultar calendario, reportes e información; **no** publica ni administra |

> Nota: puede existir un perfil técnico de máxima autoridad de la plataforma. **No se documenta aquí** porque no forma parte del uso diario del cliente.

### 3.1 Admin

Puede, entre otras cosas:

- Entrar al menú **Admin**.  
- Crear y editar **clientes** (negocios/marcas).  
- Crear usuarios **manager**, **viewer** u otros perfiles administrativos según la configuración.  
- Conectar cuentas Meta desde Admin o desde **Cuentas**.  
- Usar Composer, Aprobaciones, Calendario, Radar, Reportes y Cuentas.

### 3.2 Manager

Puede:

- Trabajar sobre el/los **cliente(s) asignado(s)**. Si tiene varios negocios, elige en el selector **en cuál publicar o consultar**.  
- Generar contenido (IA, subida de archivo, Reel).  
- Conectar fuente / Radar.  
- Aprobar y programar posts.  
- Conectar o desconectar Meta en **Cuentas** (del cliente seleccionado).  
- Ver reportes y sincronizar métricas.  
- **No** gestiona el panel Admin de usuarios/clientes de toda la agencia.

### 3.3 Viewer

Puede:

- Ver Inicio, Calendario, Reportes y listados según su alcance.  
- **No** crear posts, aprobar, programar, conectar Meta ni administrar usuarios.

---

## 4. Menú principal (módulos)

| Módulo | Para qué sirve |
|--------|----------------|
| **Inicio** | Resumen visual: pendientes, aprobados, programados y publicados |
| **Generar Contenido** | Crear posts (IA, archivo o Reel) y enviarlos a aprobación |
| **Conectar fuente** | Radar / Google Sheets: ingerir noticias o filas y promover a pendientes |
| **Aprobaciones** | Revisar, editar, aprobar o rechazar; programar fecha |
| **Calendario** | Ver lo programado y publicado; editar, desprogramar o reintentar errores |
| **Reportes** | Métricas (likes, comentarios, engagement), gráficos y PDF |
| **Cuentas** | Ver y conectar/desconectar Facebook e Instagram del cliente |
| **Perfil** | Datos de tu usuario |
| **Admin** | Solo admin: clientes, usuarios y atajos a Meta |

---

## 5. Primeros pasos recomendados

1. **Crear el cliente** (negocio) en Admin — rol admin.  
2. **Crear usuarios** manager/viewer y asignarles **uno o varios** clientes.  
3. **Conectar Meta** (Facebook Page + Instagram Business/Creator vinculado) por cada negocio.  
4. Crear un post de prueba en **Generar Contenido**.  
5. **Aprobar** y programar unos minutos adelante.  
6. Verificar en redes y en **Calendario** / **Reportes**.

---

## 6. Conectar Meta (Facebook e Instagram) — paso a paso

La publicación oficial usa la **Graph API de Meta**. Sin esta conexión no se puede publicar.

### 6.1 Requisitos previos (fuera del sistema)

Antes de pulsar «Conectar Meta», asegúrate de:

1. Tener una cuenta de **Facebook** con acceso de administrador a la **Página** del negocio.  
2. Tener un perfil de **Instagram** tipo **Business** o **Creator**.  
3. Que Instagram esté **vinculado** a esa Página de Facebook (App Instagram → Configuración → Cuenta → Compartir en Facebook / cuentas vinculadas).  
4. Que quien haga la conexión sea un usuario **admin** o **manager** en Community Manager.  
5. Aceptar los permisos que Meta solicite (páginas, Instagram, publicación).

### 6.2 Desde la aplicación

**Opción A — Cuentas (recomendada para el día a día)**

1. Inicia sesión.  
2. Ve a **Cuentas**.  
3. Si ves selector de cliente, elige el negocio correcto.  
4. Pulsa **Conectar Meta**.  
5. Se abre Facebook: inicia sesión si hace falta.  
6. Selecciona la **Página** (y cuenta Instagram asociada) que quieres autorizar.  
7. Confirma los permisos.  
8. Volverás a Community Manager con un mensaje tipo *«Cuenta Meta conectada correctamente»*.  
9. Debes ver en la lista las cuentas **Facebook** e **Instagram** activas.

**Opción B — Panel Admin**

1. Entra a **Admin**.  
2. En la lista de clientes, pulsa **Conectar Meta** junto al negocio.  
3. Completa el mismo flujo OAuth de Facebook.  
4. Verifica el resultado en **Cuentas**.

### 6.3 Buenas prácticas al conectar

- Usa la cuenta de Facebook de la **persona administradora real** de la Página.  
- No cierres la ventana a mitad del proceso.  
- Si conectas la Página equivocada, **Desconecta** en Cuentas y vuelve a conectar.  
- Tras cambios de contraseña o revocación de apps en Facebook, puede ser necesario **reconectar**.

### 6.4 Problemas frecuentes al conectar Meta

| Síntoma | Qué revisar |
|---------|-------------|
| No aparece Instagram | Instagram no está vinculado a la Página, o no es Business/Creator |
| Error de permisos | La cuenta de Facebook no es admin de la Página |
| Vuelve al login sin conectar | Sesión caducada; inicia sesión otra vez y reintenta |
| Publica en FB pero no en IG | Revisa que exista destino Instagram activo en Cuentas |
| Token / cuenta inactiva | Desconectar y volver a conectar Meta |

### 6.5 Desconectar una cuenta

1. **Cuentas** → elige el cliente.  
2. Pulsa **Desconectar** en la cuenta deseada.  
3. Esa red dejará de aparecer como destino en Composer hasta que la vuelvas a conectar.

---

## 7. Generar Contenido (Composer)

1. Elige el **cliente** (si aplica).  
2. Escribe el **caption** y **hashtags**.  
3. Marca los **destinos** (Facebook / Instagram conectados).  
4. Elige el tipo de media:  
   - **Generar contenido visual con IA** — brief + opcional referencia (imagen/PDF/Word).  
   - **Subir archivo** — imagen o video.  
   - **Reel (video)** — video vertical; en Instagram puede publicarse como Reel.  
5. Opcional: **También colgar como historia (24 h)**. En fotos, la historia incluye el texto del post en la imagen.  
6. Envía a **aprobación** (o guarda según el flujo de la pantalla).

**Importante:** nada se publica a Meta sin pasar por aprobación (salvo que el proceso de negocio lo cambie en el futuro; hoy la regla es aprobación humana).

---

## 8. Conectar fuente (Radar)

1. Configura la fuente (p. ej. Google Sheet) según lo acordado con Ethos.  
2. Sincroniza para ingerir items.  
3. Los items relevantes pueden pasar a **pendientes de aprobación**.  
4. Puedes **eliminar/descartar** items de la bandeja (no borra el Sheet original; es un descarte operativo).

---

## 9. Aprobaciones

1. Abre **Aprobaciones**.  
2. Filtra por red si lo necesitas.  
3. Revisa caption, media y destinos.  
4. Puedes editar el post, marcar historia, etc.  
5. **Aprobar** y elegir fecha/hora de publicación.  
6. El post pasa a **programado** y aparece en Calendario.

También puedes limpiar pendientes antiguos del Radar con las acciones masivas disponibles en pantalla (usa con cuidado).

---

## 10. Calendario

- Vista de posts **programados**, **publicados** y con **errores**.  
- Acciones frecuentes:  
  - Ver detalle  
  - Editar caption/media (según estado)  
  - Cambiar horario / desprogramar  
  - Reintentar publicación si hubo error  
- En publicados pueden mostrarse likes y comentarios si ya se sincronizaron métricas.

---

## 11. Reportes

1. Elige cliente y rango de días.  
2. Filtra por red (Todas / Facebook / Instagram).  
3. Revisa KPIs, gráficos y top posts.  
4. **Sincronizar métricas** para traer datos recientes de Meta.  
5. **Descargar reporte PDF** (incluye resumen con apoyo de IA cuando la API está configurada).

TikTok puede aparecer deshabilitado en filtros: aún no hay métricas/publicación TikTok en esta versión.

---

## 12. Historias (Stories)

- Al marcar **«También colgar como historia»** en un post con **foto**, el sistema publica el feed y además una historia.  
- En historias de **foto**, se genera una imagen vertical con el **caption** visible (Meta no permite caption de texto separado en stories vía API).  
- En **video**, la historia lleva el video; el texto embebido automático de video no aplica en esta versión.  
- Las historias duran **24 horas** en la red.

---

## 13. Checklist diario sugerido (manager)

- [ ] Revisar **Aprobaciones** pendientes  
- [ ] Revisar **Calendario** del día (programados y errores)  
- [ ] Crear o promover contenido nuevo  
- [ ] Confirmar que **Cuentas** Meta siguen activas  
- [ ] Una vez a la semana: **Reportes** + sincronizar métricas  

---

## 14. Preguntas frecuentes

**¿Por qué un post no se publicó?**  
Revisa el destino en Calendario/Aprobaciones: mensaje de error, cuenta desconectada, media inválida o falta de aprobación.

**¿Quién puede conectar Meta?**  
Admin y manager (no viewer).

**¿Puedo publicar sin aprobar?**  
No. El flujo actual exige aprobación humana previa.

**¿Dónde pido soporte?**  
Contacta a Ethos Consultoría Digital: [https://www.ethosconsultoriadigital.com/](https://www.ethosconsultoriadigital.com/)

---

## 15. Mantenimiento de este manual

| Evento | Acción |
|--------|--------|
| Nueva red social | Añadir sección y actualizar tablas de roles |
| Nuevo módulo en el menú | Documentar propósito y pasos |
| Cambio en OAuth Meta | Actualizar sección 6 |
| Cambio de roles o permisos | Actualizar sección 3 |

**Responsable sugerido:** equipo Ethos / quien despliega cada versión.

---

*Community Manager · Desarrollado por Ethos Consultoría Digital*
