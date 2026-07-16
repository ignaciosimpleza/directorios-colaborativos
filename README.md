# Grupo El Faro — Calendario de Reuniones

App de una sola página (`index.html`) desplegada en Vercel. Los datos se guardan
en **Turso** (libSQL) a través de una función serverless (`/api/db.js`) que usa
las **variables de entorno de Vercel**. El token de Turso vive solo en el
servidor y nunca se expone en el navegador.

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
