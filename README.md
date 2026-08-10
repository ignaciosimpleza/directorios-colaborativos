# Sitio de Directorio Colaborativo

Plantilla de sitio para un grupo de directorio colaborativo, desplegada en
Vercel. Es una sola app (`index.html`) más funciones serverless.

**El grupo se configura en el sitio, en Configuración.** En el código no hay
contenido ni reglas: ni nombres, ni empresas, ni hitos, ni cada cuánto se reúnen.
Todo eso se carga desde el sitio y se guarda en la base.

**Drive queda para los documentos**: presentaciones, bitácoras, material técnico,
la gaceta. Eso el sitio lo lee, no lo administra.

Para armar otro grupo: se despliega **el mismo repositorio** como un proyecto
nuevo en Vercel con otro `GRUPO_ID`, y se carga todo desde Configuración. No se
copia ni se bifurca el código, así una mejora llega a todos los grupos con solo
volver a desplegar. Los pasos completos están en el sitio, en **Configuración →
Instrucciones**, y resumidos más abajo.

### Configuración, en cuatro pestañas

| Pestaña | Qué se carga |
| --- | --- |
| **Instrucciones** | Cómo se estructura Drive, qué datos hacen falta y en qué orden se completa. Sirve para cualquier grupo |
| **El grupo** | Identidad, principios, equipo, empresas, hitos, ejes, eventos y marco conceptual |
| **Archivos** | Las carpetas y archivos de Drive (documentos, bitácoras, logo) |
| **El sitio** | Qué secciones se muestran y quién puede entrar |

Las reglas de la agenda no están acá: se administran en el **Calendario**, que es
donde se ven sus efectos.

Se guarda solo mientras se escribe. Cada campo dice para qué sirve y dónde se ve,
y lo que no se entiende se avisa en el momento (por ejemplo, al escribir cuándo
una empresa no puede presentar).

## Montar el sitio para otro grupo

El código es idéntico para todos los grupos: **no hay nada del grupo escrito en
él**, ni siquiera su identificador. El navegador se entera de a qué grupo
pertenece el sitio en el primer pedido a `/api/auth`, que se lo informa desde su
variable de entorno.

| Variable | |
|---|---|
| `GRUPO_ID` | **obligatoria, y hay que cargarla antes del primer despliegue.** Identificador corto y único (`grupo7`). Separa los datos de un grupo de los de otro. Si falta, el sitio no adivina: avisa en pantalla que no sabe a qué grupo pertenece, en vez de mostrarse vacío como si se hubieran borrado los datos |
| `EDIT_PASSWORD` | obligatoria. La clave de coordinación de ese grupo, distinta para cada uno |
| `TURSO_DATABASE_URL` · `TURSO_AUTH_TOKEN` | pueden ser los mismos: todas las tablas están particionadas por `group_id` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | la misma cuenta de servicio; lo que cambia es con qué carpetas de Drive se la comparte |
| `SITIO_URL` | solo si se va a mandar correo |

Después: armar las carpetas de Drive del grupo y compartirlas con la cuenta de
servicio, entrar con **«Ingresar como coordinación»** y cargar todo desde
Configuración. El sitio arranca vacío: nada de lo que se cargue en un grupo
aparece en otro, aunque compartan la base y la cuenta de servicio.

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
| `api/_mail.js` | Envío de correo por Resend. Si no está configurado, el sitio funciona igual |
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
| Dashboard · Reuniones y rotación | **Bitácora** de cada empresa (reuniones, primera y última) + Calendario (la próxima) |
| Dashboard · Actividad reciente | Las últimas reuniones de las bitácoras, con su fecha y su tema |
| Dashboard · Próximas reuniones | El Calendario del sitio. La empresa asignada lleva a su ficha; el horario sale de las reglas del Calendario |
| Dashboard · Ronda de novedades | Carpeta de Drive de novedades (última pieza subida) |
| Recursos · Marco conceptual | Configuración → El grupo → Marco conceptual |
| Recursos · Reuniones técnicas | Carpeta de Drive de material técnico (con subcarpetas) |
| Recursos · Herramientas | Carpeta de Drive embebida + URL del facilitador |
| Quién puede crear cuenta | Planilla base: pestaña `ACCESOS` (no se edita en el sitio: son emails) |
| A quién avisar de cuentas nuevas | Configuración → El grupo → Equipo (columna Email). Si nadie tiene, la variable `AVISOS_A` |
| Reglas de la agenda | Calendario (en modo edición) |
| Semanas sin reunión | Calendario (en modo edición) |
| Cuándo no puede presentar cada empresa | Calendario → Disponibilidad de las empresas |
| Qué empresas rotan | Configuración → El grupo → Empresas («Activa») |
| Las reuniones ya agendadas | Se editan en el Calendario del sitio y se guardan en Turso |
| Calendario · Intervalo de cada fila | Se calcula: días desde la vez anterior de esa misma empresa o evento, sobre la agenda entera. No se carga en ningún lado |

Para agregar un documento, se sube a la carpeta de Drive que corresponda: el
sitio lo toma solo. Para cambiar un texto o una regla, se entra a Configuración.

### Reuniones realizadas

Salen de la **bitácora**: un documento por empresa. Lo que se cuenta no es el
documento ni los archivos, es **cada fecha de reunión que aparece adentro**.

Las bitácoras del grupo no están escritas todas igual, y casi ninguna usa
encabezados de Word: pedirlos era el modelo equivocado. En `Proceso | El Motivo`
hay once reuniones y un solo encabezado. Cuenta como reunión un **renglón corto
con una fecha** que además:

```
4 de agosto de 2022                                          ← arranca con la fecha
15 de septiembre de 2025 — Avances: nueva visión
🗓️ 09 de Febrero - Primera presentación de la empresa

Reunión El Motivo – Lunes 29 de Junio de 2026                ← nombra el encuentro
🗂 Avance en LE: Minuta de Reunión – 22 de diciembre de 2025
Presentación de la empresa | 26 de agosto de 2021
Fecha: 29 de junio de 2026

# Lunes 3 Agosto de 2026 Reunión MACSA — Crecimiento          ← o es un encabezado
# FECHA Y TÍTULO: 1 DE JUNIO – Reunión de Accionistas junio 2026
```

Reglas del parser (`api/_bitacora.js`):

- Un renglón de más de 160 caracteres es prosa, no una fecha de reunión: los años
  que aparecen ahí («la empresa creció desde 2010») no cuentan.
- «Fecha» solo cuenta como etiqueta (`Fecha:`), no suelta en una oración («se
  acordó con fecha 5 de mayo»).
- Un encabezado de Word alcanza con que tenga la fecha, en cualquier parte.
- Si la fecha no trae año, se toma el de la reunión fechada más cercana del mismo
  documento, eligiendo el año que deja las dos fechas más juntas. Sirve igual si
  el documento va de la más nueva a la más vieja o al revés.
- **Dos renglones con la misma fecha son una sola reunión**, así que el índice del
  documento no duplica lo que ya está en el cuerpo.
- Una sección de primer nivel sin ninguna fecha adentro **no se cuenta y se lista**
  en el tablero, con su texto, para poder corregir el documento.

`api/bitacora.js` abre el documento (Google Doc o `.docx`, también si es un acceso
directo) y devuelve `{ reuniones, sinFecha }`. Cada reunión trae `fecha`, `numero`
(la enésima de esa empresa, contando desde la primera), `titulo` y `frase`.

#### La frase de lo que se vio

Debajo de la fecha, el facilitador ya escribe el contenido. El sitio **cita** la
primera frase de ese contenido: no interpreta ni resume nada, y no interviene
ningún modelo de lenguaje. Para encontrarla saltea las etiquetas
(`Participantes:`, `Duración:`), los títulos de sección numerados y los
encabezados sin punto —que son títulos, no frases—, y toma el primer párrafo de
diez palabras o más. Si no hay ninguno, la frase queda vacía y el sitio no
muestra nada inventado.

#### Qué muestra el tablero

**Una tarjeta por empresa en rotación**, y nada más. Sin barras, sin tabla y sin
indicadores agregados: los que había (total de reuniones, promedio de semanas
entre presentaciones, cuántas «necesitan fecha») dependían de qué tan cargada
estuviera la agenda y no decían nada útil cuando faltaba algo.

Cada tarjeta tiene los cuatro datos que sirven para seguir a una empresa:

| Dato | De dónde sale |
|---|---|
| Cantidad de reuniones | Su bitácora |
| Primera reunión | Su bitácora |
| Última reunión | Su bitácora |
| Próxima reunión | El Calendario |

Las tarjetas se ordenan por quién hace más tiempo que no presenta. La empresa que
ya tiene su próxima fecha lleva el verde de marca arriba y la fecha en verde
oscuro: es el único lugar del bloque donde aparece el acento, y significa algo.
La que no tiene fecha dice «Sin agendar» en vez de quedar en blanco.

La empresa sin bitácora conectada tiene su propia tarjeta, con borde punteado y
el link directo a donde se indica el documento. El número de reuniones se toca y
despliega las fechas que el sitio leyó, para poder auditarlas contra el documento.
Al pie, cada tarjeta lleva a la **ficha** de la empresa, a su **bitácora** en
Drive y al **Calendario**.

El selector de período recorta los tres datos de la bitácora a un año; la próxima
fecha siempre es la que viene.

#### Actividad reciente

Las últimas ocho reuniones del grupo, una línea por reunión:

```
3 AGO 2026   MACSA Agro   (Reunión 7)
La reunión se centró en el plan de inversiones para la campaña que viene…
```

Fecha, empresa, número de reunión y la frase citada de la bitácora. El nombre de
la empresa lleva a su ficha; la frase, al documento donde está escrita. Cuando la
bitácora no trae una frase de contenido, se muestra el título de la reunión en
gris: el sitio no completa el hueco con texto propio.

**Identidad visual.** Fondo crema, tinta gris oscuro, Sora en todos los pesos y un
solo acento (verde menta). Sin sombras: separan las líneas hairline. La grilla es
responsive: de cuatro columnas a una, sin scroll horizontal.

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

Para que una reunión cuente tiene que arrancar con un **encabezado** (Título 1 a
3), no con texto suelto. Si el documento no se puede leer, o si hay encabezados a
los que no se les reconoció la fecha, el sitio lo dice con nombre y apellido de la
empresa en vez de mostrar un cero sin explicación.

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
  presentar. Se escribe en criollo, separando con comas, y admite dos cosas
  distintas:
  - **Épocas del año**, que pasan y no vuelven o vuelven una vez al año:
    `enero`, `diciembre a febrero`, `julio 2026`, `6/7/2026`,
    `1/9/2026 a 20/9/2026`.
  - **Semanas del mes**, que se repiten todos los meses: `primera semana del mes`,
    `primera y segunda semana`, `primera a tercera semana`, `primeras dos semanas`,
    `última semana del mes`. Como el grupo se reúne siempre el mismo día, la
    enésima semana y la enésima reunión del mes son lo mismo. `última` se cuenta
    desde el final, no como «la quinta»: el último miércoles de marzo de 2026 es
    el 25, y los días 29 al 31 de ese mes no tienen ninguno.

  Lo que no se entienda, el sitio lo lista en *Configuración → Revisión de la
  planilla* en vez de ignorarlo en silencio.

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

`group_id` (por defecto, el `GRUPO_ID` del despliegue) permite tener varios grupos en la misma base.

## Pruebas

Ver `pruebas/LEEME.md`. Incluye una prueba que corre el sitio **como un grupo
nuevo sin nada conectado** y falla si aparece contenido de algún grupo concreto:
es la que sostiene la regla de que en el código no hay contenido.

## Cómo entra la coordinación

Con el portero prendido, la pantalla de acceso ofrece **«Ingresar como
coordinación»**: se entra con la clave de edición (`EDIT_PASSWORD`), sin cuenta de
usuario, y el sitio abre directamente en modo edición.

Sin esto un sitio recién configurado queda cerrado para todos: quien lo
administra todavía no tiene cuenta, y el panel para autorizar la primera está
detrás del mismo portero. La sesión de coordinación dura 24 horas y se registra
en el log de accesos como cualquier otro ingreso.

## Acceso sin correo

En **Configuración → El sitio → Cuentas**, cada cuenta tiene el botón **«Enlace de
acceso»**: genera un enlace de un solo uso, válido 24 horas, y lo copia al
portapapeles. La coordinación se lo pasa a la persona por donde quiera y con eso
elige su contraseña y entra. Es el mismo enlace que manda el correo, así que sirve
igual cuando el envío de correo todavía no está configurado.

El enlace lo arma el navegador con su propia dirección, así que no depende de que
`SITIO_URL` esté cargada.

## Correo

Opcional. Sin configurarlo el sitio funciona igual, pero no puede restablecer
contraseñas ni avisar de cuentas nuevas. Se envía con **Resend**; los pasos están
dentro de la herramienta, en **Configuración → Instrucciones → Correo del sitio**,
que además muestra si está configurado o no.

| Variable en Vercel | |
|---|---|
| `RESEND_API_KEY` | obligatoria |
| `MAIL_FROM` | obligatoria. `Nombre del grupo <no-responder@dominio.com>`. No hace falta que la casilla exista: alcanza con el dominio verificado |
| `MAIL_REPLY_TO` | opcional. A dónde va la respuesta si alguien contesta. Conviene cargarla cuando el remitente no es una casilla real |
| `SITIO_URL` | obligatoria. La dirección pública, sin barra final: hace falta para armar el enlace de reset, y el sitio no puede deducirla porque va embebido |
| `AVISOS_A` | opcional. Solo se usa si el equipo del grupo no tiene emails cargados |

Manda tres correos y ninguno más: el enlace para restablecer contraseña (vale 24
horas), el aviso a la coordinación de que hay una cuenta esperando autorización, y
el aviso a la persona de que ya fue autorizada. Sin imágenes ni rastreadores.

Todo lo que sale de afuera se escapa antes de armar el HTML, y un fallo de envío
se registra pero nunca corta la operación: una cuenta se crea aunque el aviso no
salga.
