# Pruebas del sitio

No hay build: el sitio es un `index.html` con funciones serverless. Estas
pruebas levantan un servidor local que sirve el sitio real y **simula** las
funciones de `/api`, y después lo manejan con un navegador de verdad.

## Cómo correrlas

```bash
npm install --no-save playwright-core     # ojo: un `npm install` normal lo borra
node pruebas/mock-server.mjs &            # sirve el sitio en http://localhost:8099
node pruebas/check.mjs                    # dashboard, reuniones desde la bitácora, recursos, visibilidad
node pruebas/check-limpio.mjs             # que NADA de contenido esté escrito en el código
node pruebas/check-auth.mjs               # registro, autorización, sesión y portero
node pruebas/check-dashboard.mjs          # números por empresa desde la bitácora, gráfico, año, técnicas
node pruebas/check-config.mjs             # cargar el grupo desde Configuración y que impacte en el sitio
```

El Chromium ya viene instalado en el entorno
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Si en tu máquina está
en otro lado, cambiá `executablePath` en los tres `check-*.mjs`.

## Qué verifica cada una

- **check.mjs** — que las reuniones se cuenten desde la bitácora sin contar dos
  veces el mismo día, que el filtro por año dé bien, que el árbol de Reuniones
  Técnicas se arme con sus subcarpetas, y que apagar un bloque lo oculte.
- **check-limpio.mjs** — corre el sitio como si fuera **un grupo nuevo sin nada
  conectado** y falla si aparece cualquier dato de un grupo concreto. Después lo
  corre con la planilla conectada y verifica que la identidad (nombre, equipo,
  logo) salga de ahí. También prueba que un email que no está en la lista no
  pueda registrarse.
- **check-auth.mjs** — el circuito completo de acceso: registro → pendiente →
  autorización → ingreso → sesión que sobrevive al reload → salida, y que la API
  no entregue datos sin sesión cuando el portero está prendido.
- **check-config.mjs** — que se pueda configurar todo el grupo desde el sitio:
  importar una planilla, editar textos, agregar y desactivar empresas, validar
  «cuándo no puede presentar» y que la agenda salga con esas reglas.
- **check-dashboard.mjs** — lo que el grupo pidió ver: el número de reuniones de
  cada empresa sacado de su bitácora, el gráfico, el filtro por año, la actividad
  reciente con fecha y tema, las reuniones técnicas visibles en Recursos, la
  autodetección de carpetas y el logo como imagen.

Aparte, sin navegador:

```bash
node --test pruebas/bitacora.test.mjs    # el parser, contra encabezados reales
node --test pruebas/calendario.test.mjs  # las reglas de la agenda
node --test pruebas/plantilla.test.mjs   # la plantilla que se entrega, leída por el parser del sitio
```

`plantilla.test.mjs` es la que sostiene que la herramienta sea estandarizable:
abre el `.xlsx` que se le da a un grupo nuevo y lo pasa por el mismo parser que
usa el sitio. Si alguien cambia una columna de un lado y no del otro, falla.

Las capturas quedan en `pruebas/capturas/`.

## Sobre el mock

`mock-server.mjs` no ejecuta las funciones reales de `/api` (necesitan Turso y
la cuenta de servicio de Google): las imita con datos de prueba. Sirve para
verificar el navegador. Lo que corre del lado del servidor se prueba en Vercel.
