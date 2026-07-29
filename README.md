# Grupo El Faro — Dashboard

Sitio del Grupo El Faro desplegado en Vercel. Es una única app (`index.html`)
con todo integrado. Estructura:

- **`index.html`** → todo el sitio: portada, El Grupo, empresas, procesos,
  **calendario**, eventos y recursos. El calendario es nativo.
- **`api/db.js`** → función serverless que conecta a **Turso** (libSQL) usando las
  **variables de entorno de Vercel**. El token de Turso vive solo en el servidor y
  nunca se expone en el navegador.
- **`assets/simpleza-logo.png`** → imagotipo de Simpleza (blanco, transparente).

La **edición** se desbloquea con un único login (botón "Modo edición" en la barra
superior, clave `faro26`). Ese login habilita la edición en todo el sitio.

## Empresas y calendario (unificados)

Hay **una sola lista de empresas** (la sección Empresas). Esa misma lista
alimenta el **calendario**: cada reunión se asigna a una empresa del grupo (o a
un tipo especial: Ronda de novedades, Técnica, Feriado, Sin reunión).

- En la ficha de cada empresa hay un check **"Activa en el calendario"**: solo
  las activas entran en la rotación de la generación automática.
- El calendario permite: agregar/editar/eliminar reuniones, asignar la empresa,
  fijar una reunión (📌, no se re-genera) y **Generar futuras** (reuniones
  semanales rotando las empresas activas por mayor tiempo sin presentar,
  respetando fijadas y feriados). Se guarda en las tablas `meetings` / `config`.
- Además de las empresas, una reunión puede asignarse a un tipo especial: **Ronda
  de novedades**, **Técnica**, **Flexible** (reuniones internas o especiales del
  grupo), **Feriado** o **Sin reunión**. Las marcadas como *Flexible* se respetan
  al generar futuras, igual que las fijadas.

## Edición del contenido

En modo edición, cada sección muestra un botón **✏️ Editar** con un formulario
para agregar/editar/eliminar. Todo se guarda en Turso (tabla `content`, un blob
JSON por sección) y queda visible para todos: **Portada** (actividad reciente),
**Procesos**, **Eventos** (agenda) y **Recursos** (marco conceptual). El
**Calendario** se edita con sus propios controles inline. Las tablas se crean
solas; no hay que tocar Turso.

**El Grupo** y **Empresas** no se editan en el sitio: salen de la planilla base
de Drive (pestañas `GRUPO`, `HITOS`, `EJES_2026`, `EMPRESAS`, `CONFIG_DRIVE`).
Por ejemplo, los nombres que aparecen con 👤 en cada ficha son la columna
`participantes` de la pestaña `EMPRESAS`. El id de esa planilla se configura en
**Configuración · Fuentes de datos**.

### Agenda de eventos (Eventos e Hitos)

La fecha de cada evento es **texto libre**, así que se carga tal cual se quiere
leer: `4-5-6/8` → *Congreso Aapresid*, `23 y 24/10` → *Viaje Grupo El Faro:
Laboulaye – Buenos Aires*. El campo de lugar/organizador es opcional. Las
presentaciones semanales de las empresas no van acá: viven en el Calendario.

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

### 3. Cargar los datos iniciales

La base arranca vacía. Entrá a la app, tocá **Ingresar** con la contraseña de
edición y usá el botón de **reset** en la pestaña Configuración: eso siembra las
empresas por defecto, el histórico inicial y genera las reuniones futuras,
guardando todo en Turso.

## Cómo funciona

- `index.html` → frontend. Le habla a `/api/db` con `fetch` (nunca directo a la base).
- `api/db.js` → función serverless de Vercel. Conecta a Turso con `@libsql/client`.
- `GET /api/db?group_id=grupo4` → devuelve `{ config, companies, meetings }`.
- `POST /api/db` con `{ action, group_id, password, ... }` → escrituras
  (`saveConfig`, `saveMeeting`, `saveAllMeetings`, `deleteAllMeetings`,
  `saveCompany`, `saveAllCompanies`, `deleteCompany`).

El campo `group_id` (`grupo4` por defecto en el HTML) permite tener varios grupos
en la misma base.
