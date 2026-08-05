# Sitio de Directorio Colaborativo

Plantilla de sitio para un grupo de directorio colaborativo, desplegada en
Vercel. Es una sola app (`index.html`) más funciones serverless.

**El grupo se configura en el sitio, en Configuración.** En el código no hay
contenido ni reglas: ni nombres, ni empresas, ni hitos, ni cada cuánto se reúnen.
Todo eso se carga desde el sitio y se guarda en la base.

**Drive queda para los documentos**: presentaciones, bitácoras, material técnico,
la gaceta. Eso el sitio lo lee, no lo administra.

Para armar otro grupo: se entra a Configuración y se carga. Si el grupo ya tenía
sus datos en una planilla, se importa de una vez y después se edita en el sitio.

### Configuración, en cuatro pestañas

| Pestaña | Qué se carga |
| --- | --- |
| **El grupo** | Identidad, principios, equipo, empresas, hitos, ejes, eventos y marco conceptual |
| **Agenda** | Las reglas del calendario y las semanas sin reunión |
| **Archivos** | Las carpetas y archivos de Drive (documentos, bitácoras, logo) |
| **El sitio** | Qué secciones se muestran y quién puede entrar |

Se guarda solo mientras se escribe. Cada campo dice para qué sirve y dónde se ve,
y lo que no se entiende se avisa en el momento (por ejemplo, al escribir cuándo
una empresa no puede presentar).

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
| `reglas.js` | Las reglas de la agenda. Lo importan el navegador **y** las funciones de `/api` |
| `plantillas/` | Planillas para importar de una vez + `generar_plantillas.py` |
| `pruebas/` | Pruebas en navegador (ver `pruebas/LEEME.md`) |

## De dónde sale cada cosa

En el sitio esto está a la vista: **Configuración → «Qué se ve y de dónde sale»**
muestra, sección por sección, qué la alimenta y cómo está esa fuente hoy
(conectada, sin conectar o fallando), con un link directo al campo que hay que
completar.

| Lo que se ve | De dónde sale |
| --- | --- |
| Nombre del grupo, bajada y equipo del menú | Configuración → El grupo |
| Logo del grupo | Una imagen subida a Drive, conectada en Configuración → Archivos |
| El Grupo (identidad, objetivos, principios) | Configuración → El grupo |
| Hitos · Ejes · Eventos · Marco conceptual | Configuración → El grupo |
| Empresas | Configuración → El grupo → Empresas |
| Carpeta de Drive de cada empresa | Se vincula sola por nombre dentro de la «Carpeta de las empresas». Se puede fijar a mano en Configuración → El grupo → Empresas → Más datos |
| Procesos y documentos de cada ficha | Carpeta de la empresa (subcarpetas `Presentaciones` y `Proceso`) |
| Dashboard · Reuniones realizadas | **Bitácora** de cada empresa: cada encabezado con fecha es una reunión |
| Dashboard · Actividad reciente | Las últimas reuniones de las bitácoras, con su fecha y su tema |
| Dashboard · Próximas reuniones | El Calendario del sitio |
| Dashboard · Ronda de novedades | Carpeta de Drive de novedades (última pieza subida) |
| Recursos · Marco conceptual | Configuración → El grupo → Marco conceptual |
| Recursos · Reuniones técnicas | Carpeta de Drive de material técnico (con subcarpetas) |
| Recursos · Herramientas | Carpeta de Drive embebida + URL del facilitador |
| Quién puede crear cuenta | Planilla base: pestaña `ACCESOS` (no se edita en el sitio: son emails) |
| Reglas de la agenda | Calendario (en modo edición) |
| Semanas sin reunión | Calendario (en modo edición) |
| Cuándo no puede presentar cada empresa | Calendario → Disponibilidad de las empresas |
| Qué empresas rotan | Configuración → El grupo → Empresas («Activa») |
| Las reuniones ya agendadas | Se editan en el Calendario del sitio y se guardan en Turso |

Para agregar un documento, se sube a la carpeta de Drive que corresponda: el
sitio lo toma solo. Para cambiar un texto o una regla, se entra a Configuración.

### Reuniones realizadas

Salen de la **bitácora**: un único documento por empresa, donde **cada reunión es
un encabezado con su fecha**, tal como ya lo escriben los facilitadores:

```
# Lunes 3 Agosto de 2026 Reunión MACSA — Crecimiento empresarial
# 13 DE ABRIL DE 2026 – Avance Líneas Estratégicas
# Brechas, causas y línea estratégica | 29 de Septiembre 2022
```

`api/bitacora.js` abre ese documento (Google Doc o `.docx`, también si es un
acceso directo), lee los encabezados y arma la lista de reuniones con su fecha y
su tema. De ahí salen los números del Dashboard, el gráfico por empresa, el
filtro por año y la actividad reciente.

#### Dónde se le indica al sitio cuál es

En **Configuración → El grupo → Empresas → Más datos** cada empresa tiene tres
campos de Drive, separados y opcionales. En cualquiera de los tres se puede pegar
el enlace completo copiado del navegador: el sitio se queda con el identificador.

| Campo | Qué se indica | Si queda vacío |
|---|---|---|
| **Carpeta de la empresa** | La carpeta con todo el material de esa empresa | El sitio la busca por nombre dentro de la «Carpeta de las empresas» |
| **Carpeta de presentaciones** | De dónde salen los documentos de la ficha | Se usa la subcarpeta `Presentaciones` de la carpeta de la empresa |
| **Documento de bitácora** | El documento del que salen las reuniones | Se busca en la subcarpeta `Proceso`, `Bitácora` o `Minutas` de la carpeta de la empresa |

El documento de bitácora es el camino directo y el más confiable: no depende de
cómo esté nombrada la subcarpeta ni de que haya un solo documento adentro.

Para que una reunión cuente tiene que estar como **encabezado** (Título 1 o
Título 2), no como texto suelto, y tener la fecha en el título. Si el documento
no se puede leer o no se reconoce ninguna fecha, el sitio lo dice con nombre y
apellido de la empresa en vez de mostrar un cero sin explicación.

El Calendario **no** interviene acá: de él salen solo las fechas próximas.

### Cómo se arma la agenda

El sitio genera las reuniones con estas reglas, **en este orden**:

1. Las reuniones fijadas (📌) y las marcadas **Flexible** no se tocan nunca.
2. Si cae feriado y `saltar_feriados` = TRUE → **Feriado**.
3. Si cae dentro de un rango de `SIN_REUNION` → **Sin reunión**.
4. Presenta la empresa **activa** que hace más tiempo que no presenta, siempre
   que haya superado `semanas_entre_presentaciones` y esté **disponible** esa
   fecha.
5. Si ninguna empresa corresponde, la fecha se completa con **Ronda de
   novedades** o **Técnica**, según `proporcion_ronda_novedades` y
   `proporcion_tecnica`.
6. Si las dos proporciones son 0, la fecha queda **Flexible** y el sitio avisa
   por qué.

`semanas_entre_presentaciones` es el mínimo que tiene que pasar entre dos
presentaciones de la misma empresa: define cada cuánto le vuelve a tocar. Con
26, cada empresa presenta unas dos veces al año y las fechas que sobran son las
que se completan con ronda y técnica. Si el número es chico y hay muchas
empresas activas, no sobra ninguna fecha y no se programa relleno.

Las proporciones se leen como una razón, no como una cantidad: con `1` y `2`, de
cada tres fechas libres una es ronda y dos son técnicas. Con `0` y `1`, todas son
técnicas.

`activa` y `no_disponible` son dos cosas distintas:

- **`activa` = FALSE** → la empresa dejó de participar. Sale de la rotación y de
  los números del tablero, pero conserva su ficha, su carpeta y su historial.
- **`no_disponible`** → la empresa participa, pero hay fechas en las que no puede
  presentar. Se escribe en criollo, separando con comas: `enero`,
  `diciembre a febrero`, `julio 2026`, `6/7/2026`, `1/9/2026 a 20/9/2026`. Lo que
  no se entienda, el sitio lo lista en *Configuración → Revisión de la planilla*
  en vez de ignorarlo en silencio.

Las reglas se cargan en *Configuración → Agenda* y se ven en el Calendario. Las
mismas reglas las aplican el navegador y las funciones del servidor porque
las dos importan **el mismo archivo**, `reglas.js`: no hay dos versiones.

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
  - `?op=actividad&folderIds=a,b,c&depth=n` → archivos de varias carpetas por fecha
  - `?op=imagen&fileId=…` → sirve una imagen de Drive sin que tenga que ser pública
  - `?op=descubrir&folderId=…` → detecta subcarpetas conocidas por su nombre
- `GET /api/bitacora` → `{ reuniones, aviso }`, las reuniones con fecha y tema
  - `?fileId=…` → lee ese documento (Google Doc, `.docx` o acceso directo)
  - `?folderId=…` → busca el documento en la subcarpeta `Proceso`/`Bitácora`/`Minutas`
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
