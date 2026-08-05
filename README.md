# Sitio de Directorio Colaborativo

Plantilla de sitio para un grupo de directorio colaborativo, desplegada en
Vercel. Es una sola app (`index.html`) más funciones serverless.

**La planilla ES la configuración del grupo.** En el código no hay contenido ni
reglas: ni nombres, ni empresas, ni hitos, ni cada cuánto se reúnen. Todo sale de
la planilla y de las carpetas de Drive.

Para armar otro grupo: se copia la plantilla, se completa, se sube a la carpeta
del grupo y se pega su link en el sitio. Nada más.

Lo único que se guarda fuera de la planilla son **las reuniones ya agendadas**
(se editan en el sitio) y **los ids de Drive** (se pegan en Configuración).

## Estructura

| Archivo | Rol |
| --- | --- |
| `index.html` | Todo el front (secciones, sin build) |
| `api/base.js` | Lee la planilla base del grupo desde Drive y la parsea |
| `api/bitacora.js` | Lee la bitácora de cada empresa y saca de ahí sus reuniones |
| `api/drive.js` | Lee carpetas de Drive (archivos, árboles, actividad, bitácora) |
| `api/db.js` | Turso (libSQL): calendario y configuración |
| `api/auth.js` | Registro, ingreso, autorización de cuentas y log de accesos |
| `api/_auth.js` | Sesiones y portero compartido por las funciones de lectura |
| `api/_calendario.js` | Las reglas de la agenda (disponibilidad, cadencia), probadas aparte |
| `plantillas/` | Planillas modelo + `generar_plantillas.py` que las produce |
| `pruebas/` | Pruebas en navegador (ver `pruebas/LEEME.md`) |

## De dónde sale cada cosa

En el sitio esto está a la vista: **Configuración → «Qué se ve y de dónde sale»**
muestra, sección por sección, qué la alimenta y cómo está esa fuente hoy
(conectada, sin conectar o fallando), con un link directo al campo que hay que
completar.

| Lo que se ve | De dónde sale |
| --- | --- |
| Nombre del grupo, bajada y equipo del menú | Planilla base: pestañas `GRUPO` y `EQUIPO` |
| Logo del grupo | Una imagen subida a Drive y conectada en Configuración |
| El Grupo (identidad, objetivos, principios) | Planilla base: pestaña `GRUPO` |
| Hitos · Ejes | Planilla base: pestañas `HITOS` y `EJES_2026` |
| Empresas | Planilla base: pestaña `EMPRESAS` |
| Carpeta de Drive de cada empresa | Se vincula sola por nombre dentro de la «Carpeta de las empresas». `CONFIG_DRIVE` manda si está cargada |
| Procesos y documentos de cada ficha | Carpeta de la empresa (subcarpetas `Presentaciones` y `Proceso`) |
| Dashboard · Reuniones realizadas | **Bitácora** de cada empresa: cada encabezado con fecha es una reunión |
| Dashboard · Actividad reciente | Las últimas reuniones de las bitácoras, con su fecha y su tema |
| Dashboard · Próximas reuniones | El Calendario del sitio |
| Dashboard · Ronda de novedades | Carpeta de Drive de novedades (última pieza subida) |
| Agenda de eventos | Planilla base: pestaña `EVENTOS` (fecha en texto libre) |
| Recursos · Marco conceptual | Archivo Marco Conceptual (pestaña `CONCEPTOS`) |
| Recursos · Reuniones técnicas | Carpeta de Drive de material técnico (con subcarpetas) |
| Recursos · Herramientas | Carpeta de Drive embebida + URL del facilitador |
| Quién puede crear cuenta | Planilla base: pestaña `ACCESOS` |
| Reglas de la agenda | Planilla base: pestaña `CALENDARIO` |
| Semanas sin reunión | Planilla base: pestaña `SIN_REUNION` |
| Qué empresas rotan y cuándo no pueden | Planilla base: columnas `activa` y `no_disponible` de `EMPRESAS` |
| Las reuniones ya agendadas | Se editan en el Calendario del sitio y se guardan en Turso |

Para agregar contenido, se sube el archivo a la carpeta de Drive que corresponda
o se edita la fila de la planilla. El sitio lo toma solo.

### Reuniones realizadas

Salen de la **bitácora**: el documento que cada empresa tiene en su subcarpeta
`Proceso`. Adentro, **cada reunión es un encabezado con su fecha**, tal como ya
las escriben los facilitadores:

```
# Lunes 3 Agosto de 2026 Reunión MACSA — Crecimiento empresarial
# 13 DE ABRIL DE 2026 – Avance Líneas Estratégicas
# Brechas, causas y línea estratégica | 29 de Septiembre 2022
```

`api/bitacora.js` abre ese documento (Google Doc o `.docx`, también si es un
acceso directo), lee los encabezados y arma la lista de reuniones con su fecha y
su tema. De ahí salen los números del Dashboard, el gráfico por empresa, el
filtro por año y la actividad reciente.

Para que una reunión cuente tiene que estar como **encabezado** (Título 1 o
Título 2), no como texto suelto, y tener la fecha en el título. Si el documento
no se puede leer o no se reconoce ninguna fecha, el sitio lo dice con nombre y
apellido de la empresa en vez de mostrar un cero sin explicación.

El Calendario **no** interviene acá: de él salen solo las fechas próximas.

### Cómo se arma la agenda

El sitio genera las reuniones con estas reglas, **en este orden**:

1. Las reuniones fijadas (📌) y las marcadas **Flexible** no se tocan nunca.
2. Si cae feriado y `CALENDARIO.saltar_feriados` = TRUE → **Feriado**.
3. Si cae dentro de un rango de `SIN_REUNION` → **Sin reunión**.
4. Si toca según `ronda_novedades_cada` / `tecnica_cada` → esa.
5. Si no: presenta la empresa **activa** que hace más tiempo que no presenta y
   que esté **disponible** esa fecha.
6. Si ninguna está disponible, la fecha queda **Flexible** y el sitio avisa cuál.

`activa` y `no_disponible` son dos cosas distintas:

- **`activa` = FALSE** → la empresa dejó de participar. Sale de la rotación y de
  los números del tablero, pero conserva su ficha, su carpeta y su historial.
- **`no_disponible`** → la empresa participa, pero hay fechas en las que no puede
  presentar. Se escribe en criollo, separando con comas: `enero`,
  `diciembre a febrero`, `julio 2026`, `6/7/2026`, `1/9/2026 a 20/9/2026`. Lo que
  no se entienda, el sitio lo lista en *Configuración → Revisión de la planilla*
  en vez de ignorarlo en silencio.

Las reglas **no se editan en el sitio**: se ven en el Calendario (modo edición) y
se cambian en la planilla. Si se pudieran editar en los dos lados, nunca se
sabría cuál manda.

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

**Atajo:** pegá en Configuración la **carpeta del grupo** (la carpeta madre) y
tocá **Detectar contenido**. El sitio mira adentro y completa solo la planilla,
el material técnico, las novedades, las herramientas y el logo. Después revisás.

A mano, paso por paso:

1. Descargá `plantillas/Plantilla_Base_Grupo.xlsx`, completala y subila a Drive.
   La primera pestaña (`LEEME`) explica qué alimenta cada una y cuáles son las
   reglas. Las plantillas se regeneran con
   `python3 plantillas/generar_plantillas.py`.
2. Entrá al sitio con **Modo edición → Configuración**. Ahí figura el email de la
   cuenta de servicio: compartí con ese email (rol **Lector**) la planilla y las
   carpetas del grupo.
3. Pegá el id de la planilla y usá **Probar conexión**.
4. Conectá la **carpeta de las empresas** (la que tiene una subcarpeta por
   empresa). El sitio las vincula solas comparando el nombre de la carpeta con
   el de la empresa en la planilla, así que **no hace falta pegar un id por
   empresa**. En *Configuración → Qué se ve y de dónde sale* se ve qué empresa
   quedó con qué carpeta. Si alguna no matchea, cargá su id en `CONFIG_DRIVE`:
   eso siempre tiene prioridad. Cada carpeta de empresa debería tener adentro
   `Presentaciones` y `Proceso`.
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
