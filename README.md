# Sitio de Directorio Colaborativo

Plantilla de sitio para un grupo de directorio colaborativo, desplegada en
Vercel. Es una sola app (`index.html`) más funciones serverless.

**Regla base del proyecto: en el código no hay contenido.** Ni nombres, ni
empresas, ni hitos, ni textos del grupo. Todo sale de Google Drive. Lo único que
se edita adentro del sitio es el **Calendario**. No hay formularios de carga.

Por eso el mismo repo sirve para cualquier grupo: se conecta otra planilla y el
sitio es otro.

## Estructura

| Archivo | Rol |
| --- | --- |
| `index.html` | Todo el front (secciones, sin build) |
| `api/base.js` | Lee la planilla base del grupo desde Drive y la parsea |
| `api/drive.js` | Lee carpetas de Drive (archivos, árboles, actividad, bitácora) |
| `api/db.js` | Turso (libSQL): calendario y configuración |
| `api/auth.js` | Registro, ingreso, autorización de cuentas y log de accesos |
| `api/_auth.js` | Sesiones y portero compartido por las funciones de lectura |
| `plantillas/` | Planillas modelo para armar un grupo nuevo |
| `pruebas/` | Pruebas en navegador (ver `pruebas/LEEME.md`) |

## De dónde sale cada cosa

En el sitio esto está a la vista: **Configuración → «Qué se ve y de dónde sale»**
muestra, sección por sección, qué la alimenta y cómo está esa fuente hoy
(conectada, sin conectar o fallando), con un link directo al campo que hay que
completar.

| Lo que se ve | De dónde sale |
| --- | --- |
| Nombre del grupo, bajada, logo y equipo del menú | Planilla base: pestañas `GRUPO` y `EQUIPO` |
| El Grupo (identidad, objetivos, principios) | Planilla base: pestaña `GRUPO` |
| Hitos · Ejes | Planilla base: pestañas `HITOS` y `EJES_2026` |
| Empresas | Planilla base: pestaña `EMPRESAS` |
| Carpeta de Drive de cada empresa | Planilla base: pestaña `CONFIG_DRIVE`, columna `id_carpeta_empresa` |
| Procesos y documentos de cada ficha | Carpeta de la empresa (subcarpetas `Presentaciones` y `Proceso`) |
| Dashboard · Actividad reciente | Últimos archivos de las carpetas de las empresas |
| Dashboard · Reuniones realizadas | **Bitácora** de cada empresa (subcarpeta `Proceso`) + carpeta de técnicas |
| Dashboard · Próximas reuniones | El Calendario del sitio |
| Dashboard · Ronda de novedades | Carpeta de Drive de novedades (última pieza subida) |
| Agenda de eventos | Planilla base: pestaña `EVENTOS` (fecha en texto libre) |
| Recursos · Marco conceptual | Archivo Marco Conceptual (pestaña `CONCEPTOS`) |
| Recursos · Reuniones técnicas | Carpeta de Drive de material técnico (con subcarpetas) |
| Recursos · Herramientas | Carpeta de Drive embebida + URL del facilitador |
| Quién puede crear cuenta | Planilla base: pestaña `ACCESOS` |
| Calendario | Se edita en el sitio y se guarda en Turso |

Para agregar contenido, se sube el archivo a la carpeta de Drive que corresponda
o se edita la fila de la planilla. El sitio lo toma solo.

### Reuniones realizadas

Se cuentan desde la **bitácora**: cada archivo de la subcarpeta `Proceso` de una
empresa es un registro de reunión. Una reunión = **una fecha**, así la minuta y
la presentación del mismo encuentro no cuentan doble. La fecha se toma del nombre
del archivo (`Minuta 2025-06-12`, `12-06-25 …`) y, si no la tiene, de la fecha de
modificación en Drive. El Calendario **no** interviene acá: de él salen solo las
fechas próximas.

### Qué se muestra

Un bloque sin datos se oculta solo, pero eso es **opcional**: en
*Configuración → Qué se muestra* se puede apagar el ocultamiento automático y
además prender o apagar cada bloque a mano. Si una sección entera queda vacía, el
sitio explica qué fuente le falta en vez de mostrar una página en blanco.

## Acceso al sitio

Pensado para que adentro pueda haber información privada de las empresas:

1. **Quién puede registrarse** sale de la pestaña `ACCESOS` de la planilla
   (columnas `email`, `empresa`, `nombre`). Si esa pestaña tiene filas, **solo
   esos emails pueden crear cuenta**: cualquier otro rebota al registrarse. Si la
   pestaña no está, el registro queda abierto (y el sitio lo avisa en
   Configuración).
2. **Una cuenta por empresa**, que la empresa comparte con su equipo.
3. **Autorización manual**: toda cuenta nace `pendiente` y no ve nada hasta que
   la coordinación la autoriza en *Configuración → Quién puede entrar*.
4. **Registro de accesos**: quién entró y cuándo.
5. El **portero** (pedir cuenta para entrar) se prende y apaga desde
   Configuración. Con el portero prendido, `/api/db`, `/api/base` y `/api/drive`
   dejan de responder sin sesión.

El token de sesión viaja en `Authorization: Bearer`, no en cookie, porque el
sitio se embebe en un iframe y las cookies de terceros no son confiables ahí.

> El reset de contraseña **no manda mail**: no hay proveedor de correo
> configurado. El pedido queda registrado y desde el panel se copia el link de
> reset para pasárselo a la persona.

## Puesta en marcha

### 1. Base en Turso

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create migrupo
turso db show migrupo --url          # TURSO_DATABASE_URL
turso db tokens create migrupo       # TURSO_AUTH_TOKEN
```

Las tablas se crean solas. `schema.sql` está como referencia.

### 2. Variables en Vercel

| Variable | Para qué |
| --- | --- |
| `TURSO_DATABASE_URL` | base de datos |
| `TURSO_AUTH_TOKEN` | token de la base |
| `EDIT_PASSWORD` | clave de edición del sitio. **Sin esto nadie puede editar** |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON de la cuenta de servicio de Google |
| `BASE_FILE_ID` | *(opcional)* id de la planilla base, si no se carga desde Configuración |

La clave de edición **no está en el HTML**: el sitio la valida contra el
servidor. Cambiar `EDIT_PASSWORD` en Vercel alcanza.

### 3. Conectar Drive

1. Descargá `plantillas/Plantilla_Base_Grupo.xlsx`, completala y subila a Drive.
2. Entrá al sitio con **Modo edición → Configuración**. Ahí figura el email de la
   cuenta de servicio: compartí con ese email (rol **Lector**) la planilla y las
   carpetas del grupo.
3. Pegá el id de la planilla y usá **Probar conexión**.
4. En la pestaña `CONFIG_DRIVE`, cargá el id de la carpeta de cada empresa. Cada
   carpeta debería tener las subcarpetas `Presentaciones` y `Proceso`.
5. Conectá las carpetas opcionales (técnicas, novedades, herramientas) y el
   archivo del Marco Conceptual.
6. En el Calendario, usá **Generar futuras** para armar la agenda.

La carpeta de **Herramientas del grupo** se muestra embebida (iframe), así que
además tiene que estar compartida como *«Cualquiera con el enlace · Lector»*:
compartirla con la cuenta de servicio alcanza para todo lo demás, pero no para el
iframe, que se carga con la sesión de quien mira el sitio.

## API

- `GET /api/base?fileId=…` → `{ grupo, hitos, ejes, empresas, eventos, conceptos }`.
  La lista de accesos se parsea pero **nunca** se devuelve al navegador.
- `GET /api/drive`
  - `?op=whoami` → email de la cuenta de servicio
  - `?op=list&folderId=…` → archivos de una carpeta
  - `?op=arbol&folderId=…&depth=n` → árbol anidado de carpetas y archivos
  - `?op=empresa&folderId=…` → `{ presentaciones, minutas }`
  - `?op=bitacora&folderId=…` → documento de bitácora de la carpeta `Proceso`
  - `?op=actividad&folderIds=a,b,c&depth=n` → archivos de varias carpetas por fecha
- `GET /api/db?group_id=…` → `{ env, config, companies, meetings, content }`
- `POST /api/db` → escrituras del calendario y la configuración (requiere la clave)
- `GET /api/auth` → `{ requireLogin, grupo, usuario }`
- `POST /api/auth` → `registro`, `login`, `logout`, `yo`, `pedirReset`,
  `resetear` y, con la clave de edición, `adminLogin`, `usuarios`, `estado`,
  `borrar`, `accesos`, `requerirLogin`

`group_id` (por defecto `grupo4`) permite tener varios grupos en la misma base.

## Pruebas

Ver `pruebas/LEEME.md`. Incluye una prueba que corre el sitio **como un grupo
nuevo sin nada conectado** y falla si aparece contenido de algún grupo concreto:
es la que sostiene la regla de que en el código no hay contenido.
