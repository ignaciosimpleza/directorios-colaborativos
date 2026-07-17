# Grupo El Faro — Dashboard

Sitio del Grupo El Faro desplegado en Vercel. Es una única app (`index.html`)
con todo integrado. Estructura:

- **`index.html`** → todo el sitio: portada, empresas, procesos, **calendario**,
  eventos y recursos. El calendario es nativo (no hay iframes ni apps embebidas).
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

## Edición del contenido

En modo edición, cada sección muestra un botón **✏️ Editar** con un formulario
para agregar/editar/eliminar. Todo se guarda en Turso (tabla `content`, un blob
JSON por sección) y queda visible para todos: **Portada**, **Empresas**,
**Procesos**, **Eventos** y **Recursos**. El **Calendario** se edita con sus
propios controles inline. Las tablas se crean solas; no hay que tocar Turso.

## Recursos y enlaces (dónde llevan los links)

Las tarjetas de **Recursos**, las **minutas** y los **documentos** de cada empresa
abren el enlace que cargues en su campo `URL / enlace` (se abre en una pestaña
nueva). No hay almacenamiento de archivos en el sitio, así que la recomendación es
**pegar enlaces de Google Drive / Google Docs** (o cualquier URL pública):

1. Subí el archivo a una carpeta de Drive del grupo.
2. Compartilo ("Cualquiera con el enlace puede ver").
3. Copiá el link y pegalo en el campo del recurso/minuta/documento en modo edición.

Si un recurso todavía no tiene enlace (queda en `#`), al hacer click avisa que
falta cargar la URL.

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
