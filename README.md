# Grupo El Faro — Dashboard

Sitio del Grupo El Faro desplegado en Vercel. Es una única app (`index.html`)
con todo integrado. Estructura:

- **`index.html`** → todo el sitio: portada, El Grupo, empresas, procesos,
  **calendario**, eventos y recursos. El calendario es nativo.
- **`api/db.js`** → función serverless que conecta a **Turso** (libSQL) usando las
  **variables de entorno de Vercel**. Guarda el calendario y las fuentes de datos.
  El token de Turso vive solo en el servidor y nunca se expone en el navegador.
- **`api/base.js` / `api/drive.js`** → lectura de Google Drive con una cuenta de
  servicio: la planilla base del grupo y las carpetas de cada empresa.
- **`plantillas/`** → plantillas de las planillas de Drive (base y marco conceptual).
- **`assets/simpleza-logo.png`** → imagotipo de Simpleza (blanco, transparente).

La **edición** se desbloquea con un único login (botón "Modo edición" en la barra
superior, clave `faro26`). Habilita el Calendario y la Configuración, y muestra en
cada sección de dónde sale su contenido. **No hay formularios de carga**: el
contenido se edita en Drive.

## Empresas y calendario (unificados)

Hay **una sola lista de empresas** (la de la planilla base). Esa misma lista
alimenta el **calendario**: cada reunión se asigna a una empresa del grupo o a un
tipo especial.

- El calendario permite: agregar/editar/eliminar reuniones, asignar la empresa,
  fijar una reunión (📌, no se re-genera) y **Generar futuras** (reuniones
  semanales rotando las empresas activas por mayor tiempo sin presentar,
  respetando fijadas y feriados). Se guarda en las tablas `meetings` / `config`.
- Además de las empresas, una reunión puede asignarse a un tipo especial: **Ronda
  de novedades**, **Técnica**, **Flexible** (reuniones internas o especiales del
  grupo), **Feriado** o **Sin reunión**. Las marcadas como *Flexible* se respetan
  al generar futuras, igual que las fijadas.

## De dónde sale cada cosa (no hay formularios)

El contenido del sitio **no se carga a mano**: sale de Google Drive. Turso guarda
solamente el **calendario** y las **fuentes de datos** (los ids de Drive). En modo
edición, cada sección muestra un aviso 📄 que explica qué archivo o carpeta hay
que tocar, con el link directo.

| Sección del sitio | De dónde sale |
| --- | --- |
| Dashboard · Actividad reciente | Últimos archivos subidos a las **carpetas de Drive de las empresas** |
| Dashboard · Próximas / realizadas | El **Calendario** del sitio |
| El Grupo | Planilla base: pestañas `GRUPO`, `HITOS`, `EJES_2026` |
| Empresas | Planilla base: pestaña `EMPRESAS` (👤 = columna `participantes`, 📍 = `zona`) |
| Procesos | Archivos de la carpeta de Drive de cada empresa (subcarpeta `Presentaciones`) |
| Eventos e Hitos | Planilla base: pestañas `HITOS` y `EVENTOS` |
| Recursos · Marco conceptual | Archivo **Marco Conceptual** de Drive (pestaña `CONCEPTOS`) |
| Recursos · Herramientas | Carpeta de Drive vinculada + link al sitio de Simpleza |
| Calendario | Se edita en el sitio (controles inline) y se guarda en Turso |

Los ids de la planilla base, del Marco Conceptual y de la carpeta de herramientas
se cargan en **Configuración · Fuentes de datos**. El id de la carpeta de cada
empresa va en la pestaña `CONFIG_DRIVE` de la planilla base (columna
`id_carpeta_empresa`): de ahí salen la actividad reciente, los Procesos y la
Bitácora. Para agregar una novedad al sitio, alcanza con **subir el archivo a la
carpeta de Drive que corresponda**.

### Actividad reciente

Se arma con una sola llamada, `GET /api/drive?op=actividad&folderIds=…`, que trae
los archivos de las carpetas de todas las empresas (y sus subcarpetas) ordenados
por fecha de modificación. Se muestran los 8 últimos, con la empresa, la
subcarpeta y la fecha; el click abre el archivo en Drive. La misma respuesta
alimenta la sección **Procesos**, así que es una sola lectura por visita
(además cacheada 5 minutos en el borde de Vercel).

### Agenda de eventos (Eventos e Hitos)

Sale de la pestaña `EVENTOS` de la planilla base (columnas `fecha`, `titulo`,
`descripcion`, `lugar`, `mostrar_en_web`). La fecha es **texto libre** y se
muestra tal cual: `4-5-6/8` → *Congreso Aapresid*, `23 y 24/10` → *Viaje Grupo El
Faro: Laboulaye – Buenos Aires*. Las presentaciones semanales de las empresas no
van acá: viven en el Calendario.

## Procesos → Bitácora

En **Procesos Estratégicos**, el botón **📓 Bitácora** abre directamente el
documento del proceso de esa empresa; ya no navega a la ficha completa. El sitio
busca, dentro de la carpeta de Drive de la empresa, la subcarpeta **Proceso**
(también vale *Bitácora* o *Minutas*) y de ahí el archivo cuyo nombre contenga
«bitácora»; si no hay ninguno, abre el más reciente, y si la carpeta está vacía,
abre la carpeta. Lo resuelve `GET /api/drive?op=bitacora&folderId=…`.

## Recursos del grupo

La sección tiene tres bloques:

1. **Marco conceptual** — los conceptos metodológicos (antes estaban en *Eventos
   e Hitos*). Se editan en el sitio; si además se carga el archivo *Marco
   Conceptual* en Configuración, aparece el link para abrirlo en Drive.
2. **Herramientas de Simpleza** — link al sitio de Simpleza. La URL exacta se
   configura en *Configuración → Herramientas de Simpleza (web)*; por defecto
   apunta a `https://www.simpleza.com.ar/`.
3. **Herramientas del grupo** — la carpeta de Drive embebida como iframe
   (`embeddedfolderview`): lo que se sube a la carpeta aparece solo en el sitio.
   El id de la carpeta se carga en *Configuración → Herramientas del grupo*.
   Para que el iframe se vea desde cualquier navegador, esa carpeta tiene que
   estar compartida como **«Cualquiera con el enlace · Lector»** (compartirla con
   la cuenta de servicio alcanza para el resto de las lecturas, pero no para el
   iframe, que se carga con la sesión de quien mira el sitio).

## Logo de Simpleza

El imagotipo está en `assets/simpleza-logo.png` (blanco, fondo transparente) y se
muestra en el sidebar (fondo oscuro), que es donde un logo blanco se ve bien. Si
el archivo no existe, el sitio simplemente no lo muestra.

## Puesta en marcha

### 1. Crear la base en Turso

```bash
# instalar la CLI de Turso (si no la tenés)
curl -sSfL https://get.tur.so/install.sh | bash

turso auth login
turso db create grupoelfaro          # o el nombre que prefieras

# URL de la base (empieza con libsql://)
turso db show grupoelfaro --url

# token de acceso
turso db tokens create grupoelfaro
```

Las tablas se crean solas la primera vez que se usa la app. Si querés crearlas a
mano, corré `schema.sql`:

```bash
turso db shell grupoelfaro < schema.sql
```

### 2. Configurar las variables en Vercel

En el proyecto de Vercel → **Settings → Environment Variables**, agregá:

| Variable              | Valor                                             |
| --------------------- | ------------------------------------------------- |
| `TURSO_DATABASE_URL`  | la URL `libsql://...` de `turso db show`           |
| `TURSO_AUTH_TOKEN`    | el token de `turso db tokens create`               |
| `EDIT_PASSWORD`       | (opcional) `A1234b` — protege las escrituras       |

> Si seteás `EDIT_PASSWORD`, tiene que coincidir con la constante `EDIT_PASSWORD`
> del `index.html` (hoy `A1234b`). Si no la seteás, la API acepta escrituras sin
> validar contraseña (útil para probar rápido).

Después de agregar las variables, hacé un **Redeploy** para que tomen efecto.

### 3. Conectar Drive

1. Creá una **cuenta de servicio** de Google y pegá su JSON en la variable
   `GOOGLE_SERVICE_ACCOUNT_JSON` de Vercel (o `GOOGLE_SERVICE_ACCOUNT_B64`).
2. En el sitio, entrá en **Modo edición → Configuración**: ahí figura el email de
   la cuenta de servicio. Compartí con ese email (rol **Lector**) la planilla
   base, el archivo del Marco Conceptual y la carpeta del grupo.
3. Pegá los ids en Configuración y usá **Probar conexión**.
4. En la pestaña `CONFIG_DRIVE` de la planilla base, cargá el id de la carpeta de
   cada empresa. Cada carpeta debería tener las subcarpetas **Presentaciones** y
   **Proceso**.
5. En el Calendario, con el modo edición activo, usá **Generar futuras** para
   armar la agenda de reuniones.

## Cómo funciona

- `index.html` → frontend. Le habla a `/api/db`, `/api/base` y `/api/drive` con
  `fetch` (nunca directo a la base ni a Google).
- `api/db.js` → función serverless de Vercel. Conecta a Turso con
  `@libsql/client`. Guarda **calendario** y **fuentes de datos** solamente.
- `api/base.js` → lee la planilla base de Drive y devuelve
  `{ grupo, hitos, ejes, empresas, eventos, conceptos }`. El mismo parser lee el
  archivo del Marco Conceptual (`conceptos`).
- `api/drive.js` → lectura de Drive con la cuenta de servicio:
  - `?op=whoami` → email de la cuenta de servicio
  - `?op=list&folderId=…` → archivos de una carpeta
  - `?op=empresa&folderId=…` → `{ presentaciones, minutas }` de una empresa
  - `?op=bitacora&folderId=…` → el documento de Bitácora de la carpeta *Proceso*
  - `?op=actividad&folderIds=a,b,c` → archivos de varias empresas por fecha
- `GET /api/db?group_id=grupo4` → devuelve `{ content, config, meetings }`.
- `POST /api/db` con `{ action, group_id, password, ... }` → escrituras
  (`saveConfig`, `saveMeeting`, `saveAllMeetings`, `deleteAllMeetings`,
  `saveContent`).

El campo `group_id` (`grupo4` por defecto en el HTML) permite tener varios grupos
en la misma base.
