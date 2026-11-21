# Hotel Duerme Bien — Evaluación Unidad 4

Sistema web para un hotel desarrollado con **Node.js + Express + MongoDB**. Incluye gestión de usuarios, roles, habitaciones, estadías individuales y de grupos, RUT de cada ocupante (incluido el segundo pasajero), seguridad de acceso, historial, auditoría y boleta de estadía imprimible.

## Cambios aplicados para la Evaluación 4

| Solicitud | Implementación |
|---|---|
| Número de habitación solo natural positivo | Validación en interfaz y servidor: `1`, `101`, `204` válidos; `0`, `1A`, `-5`, `12-3`, `1.5` rechazados. |
| Nombres de personas no pueden ser números | Validación de nombre y apellido del responsable y de **todos los acompañantes**. Además el nombre completo exige **nombre y apellido** (mínimo dos palabras): entradas como `yo` o `Ana` se rechazan con un mensaje claro, para que no terminen impresas en la boleta. |
| Nadie puede estar en dos habitaciones a la vez | Se verifica el RUT de cada ocupante y se bloquean registros simultáneos usando transacciones y un estado activo por pasajero. |
| Representante de grupo | Un responsable identificado con nombre y RUT, que ocupa la primera habitación; cada habitación adicional incluye sus propios huéspedes identificados. |
| $40.000 por persona y noche | `cantidad de ocupantes × noches × 40000`, por habitación y total del grupo. |
| Dos vistas | `VISTA_MAR` o `VISTA_CIUDAD`. |
| Imagen del hotel al inicio | Imagen SVG incluida en `/public/img/hotel.svg`, visible en el login. |
| Fechas | Entrada (día del check-in), salida estimada posterior a entrada, cantidad de noches y fecha real de check-out. |
| Boleta | Endpoint `GET /api/boletas/:grupoId` y página imprimible con responsable, RUT, huéspedes, habitaciones, fechas, cantidad, noches, tarifa, subtotal y total. Botón **Imprimir / Guardar como PDF**. Es un comprobante informativo, **no una boleta tributaria electrónica**. |
| Datos del emisor en la boleta | La boleta imprime los datos **ficticios** del hotel: **Nombre**, **RUT**, **Calle**, comuna y teléfono. Vienen de `src/business/reglas.js` (`EMISOR`) y se pueden cambiar con las variables `HOTEL_NOMBRE`, `HOTEL_RUT`, `HOTEL_CALLE`, `HOTEL_COMUNA` y `HOTEL_TELEFONO`. No dependen de lo que escriba el usuario. |
| Boleta inalterable | El nombre y RUT del responsable se leen del **snapshot del check-in** (`ocupantes_detalle`), no del registro vivo del pasajero: si la misma persona vuelve a registrarse con otro nombre, la boleta antigua conserva el nombre con el que se hizo el check-in. |
| RUT del segundo pasajero | Al elegir 2 ocupantes aparece un campo obligatorio para el nombre y RUT del acompañante, guardado como pasajero independiente en MongoDB y vinculado a la estadía. |
| Base de datos MongoDB | Elimina SQLite. Utiliza el driver oficial `mongodb`, colecciones `usuarios`, `pasajeros`, `habitaciones`, `asignaciones`, `auditoria`, `sesiones` y `contadores`. |

## Requisitos de instalación

- Node.js 20 o superior.
- MongoDB local o MongoDB Atlas **configurado como replica set** (MongoDB Atlas suele ofrecerlo por defecto). Se requiere replica set para garantizar la **atomicidad** de grupos y prevenir duplicidades en check-ins simultáneos. Una instalación local standalone (`mongod` sin replica set) no basta.
- Conexión a Internet para instalar las dependencias por primera vez y mostrar los servicios de clima y dólar.

### Inicio rápido con Docker + MongoDB

En una terminal:

```bash
docker run -d --name duerme-mongo -p 27017:27017 mongo:7 mongod --replSet rs0 --bind_ip_all
docker exec duerme-mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

MongoDB quedará escuchando en `127.0.0.1:27017`. En Windows PowerShell, desde la carpeta `duerme-bien`:

```powershell
npm install
$env:MONGODB_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0"
$env:MONGODB_DB="duerme_bien"
$env:SESSION_SECRET="cambia-esto-por-un-secreto-largo-y-unico"
npm start
```

Abra **http://localhost:3000**. Para una base Atlas reemplace `MONGODB_URI` por la cadena de conexión `mongodb+srv://...` proporcionada por Atlas; no la suba a Git ni la publique. El archivo `.env.example` documenta las variables. Copie ese archivo como `.env`, complete los valores y la aplicación los cargará automáticamente desde la raíz, sin sobrescribir las variables ya definidas en su terminal o hosting.

| Rol | Usuario DEMO | Contraseña DEMO |
|---|---|---|
| Administrador | `admin` | `Admin#2026` |
| Encargado | `encargado` | `Encargado#2026` |

**Solo desarrollo:** cambie estas cuentas antes de desplegar una app pública. En producción configure `NODE_ENV=production`, HTTPS, `SESSION_SECRET` privado y usuarios propios.

### Cómo registrar al segundo pasajero

1. Ingrese como `encargado` → **Registro y asignación**.
2. Complete los datos del **pasajero responsable**, su RUT y las fechas.
3. Seleccione una habitación `Doble` y cambie **Ocupantes** de `1` a `2`.
4. Aparece **Acompañante 1**. Complete **Nombre completo** y **RUT**. El servidor valida el dígito verificador.
5. Asigne. Podrá revisar el RUT individual en **Pasajeros hospedados**, historial o **Boleta de estadía**.
6. Para grupos de varias habitaciones, marque **Es un grupo**, agregue habitaciones y complete los acompañantes que corresponden a cada habitación. El representante queda contado en la primera habitación.

## Conexión con MongoDB

| Aspecto | Detalle |
|---|---|
| Variables | `MONGODB_URI` (cadena de conexión) y `MONGODB_DB` (nombre de la base, por defecto `duerme_bien`). Se leen de `.env` o del entorno; **la variable de entorno tiene prioridad** sobre el archivo `.env`. |
| Conexión | `src/data/db.js` abre un único `MongoClient` (driver oficial `mongodb`), hace `ping` para confirmar que el servidor responde y crea los índices al arrancar. Si MongoDB no está disponible, la aplicación **no arranca** y muestra el error en consola (no queda a medias). |
| Réplica set | **Obligatorio**: los check-ins y check-outs se guardan en transacciones (`withTransaction` con `readConcern: snapshot` y `writeConcern: majority`). Un MongoDB *standalone* no soporta transacciones: use Atlas, Docker con `--replSet rs0` o un `mongod` local con réplica. |
| Colecciones | `usuarios`, `pasajeros`, `habitaciones`, `asignaciones`, `auditoria`, `sesiones` (TTL) y `contadores` (secuencias con `findOneAndUpdate`). |
| Índices | `usuarios.username` y `usuarios.rut` únicos, `pasajeros.rut` único (evita duplicados de RUT), `habitaciones.numero` único entre las activas, `asignaciones` por habitación/estado y por `ocupantes_detalle.rut` (historial), `auditoria.fecha` y `sesiones.expire` con TTL (las sesiones vencidas se borran solas). |
| Sesiones | Se guardan en la colección `sesiones` (`src/presentation/sessionStore.js`), no en memoria: el reinicio del servidor no cierra las sesiones y el tiempo de inactividad (20 min) se aplica también en la base. |
| Integridad | `pasajeros.estancia_activa` se actualiza de forma condicional dentro de la transacción, por lo que una persona no puede quedar en dos habitaciones a la vez aunque dosargas lleguen al mismo tiempo. |

Comprobar la conexión desde la terminal:

```powershell
mongosh "mongodb://127.0.0.1:27017/?replicaSet=rs0" --eval "db.runCommand({ping:1})"
```

## Despliegue

El proyecto se despliega **completo** (SPA + API) en una sola plataforma: no se deben separar en
dominios distintos porque la cookie de sesión es `SameSite=Strict` y un XHR hacia otro dominio no
la enviaría (el login fallaría).

Antes de desplegar, en **MongoDB Atlas → Network Access** habilite *Allow access from anywhere*
(`0.0.0.0/0`): las IP de salida de Render y Vercel son dinámicas. Anote la **región** del cluster
(Atlas → Overview) para usarla en el servicio.

Variables de entorno obligatorias en la plataforma:

```
NODE_ENV=production
MONGODB_URI=mongodb+srv://<usuario>:<clave>@<cluster>/<base>
MONGODB_DB=duerme_bien
SESSION_SECRET=<cadena aleatoria de 32 caracteres o más>
```

Opcionales: `HOTEL_NOMBRE`, `HOTEL_RUT`, `HOTEL_CALLE`, `HOTEL_COMUNA`, `HOTEL_TELEFONO` (datos
ficticios de la boleta), `PORT` (Render la inyecta) y `MONGODB_TEST_URI` (solo para las pruebas
integradas). El archivo `.env` **no** se sube al repositorio: en Render se pueden importar las
variables con *Add from .env* y en Vercel con `vercel env add`.

### Render (recomendado)

El repositorio incluye `render.yaml` (Blueprint), pero también puede crearse a mano:

1. Render → `New` → **Web Service** → conectar GitHub → `josueparlanchin-droid/Hotel_Duerme_Bien`
   (rama `main`).
2. Runtime **Node**, Build Command `npm ci`, Start Command `npm start`, región igual a la de
   Atlas, plan **Free**.
3. *Advanced* → Health Check Path `/api/health`; *Environment* → las variables de arriba.
4. Deploy → `https://<nombre>.onrender.com`.

`GET /api/health` responde `{"ok":true,"db":"ok","app":"duerme-bien"}` y hace `ping` real a
MongoDB: sirve de sonda de disponibilidad. El plan gratuito **se duerme a los 15 minutos** de
inactividad y tarda ~1 minuto en volver a despertar (muestra una pantalla de carga).

### Vercel

Vercel detecta Express y sirve `public/` por CDN (la SPA queda en `/`); la API en `/api/*` la
atiende la función `api/[...slug].js`, que reutiliza la conexión a MongoDB cacheada en
`src/arranque.js`.

```powershell
npm i -g vercel
vercel link                             # vincula el proyecto con el repositorio
vercel env add MONGODB_URI production  # y MONGODB_DB, SESSION_SECRET
vercel dev                              # prueba en local antes de subir
vercel --prod                           # despliegue de producción
```

`NODE_ENV=production` lo define Vercel automáticamente. `vercel dev` permite comprobar que
`/api/health` y `POST /api/auth/login` responden antes de publicar.

### Antes de publicar

- Cambie las credenciales de demostración (`admin` / `encargado` en `src/seed.js`) o defina las
  suyas en la plataforma; nunca publique las de prueba.
- `SESSION_SECRET` debe ser distinto en cada entorno y nunca debe versionarse en Git.

## Pruebas

Pruebas de validación y flujo de negocio con repositorio simulado (sin servidor MongoDB):

```bash
npm test
```

Pruebas integradas de MongoDB, con base temporal aislada que se elimina automáticamente:

```powershell
npm run test:integration
```

Configure `MONGODB_TEST_URI` en `.env` o en las variables de entorno antes de ejecutarlas.

El archivo `tests/mongodb.test.js` cubre registro de RUT del acompañante, duplicidad simultánea, validaciones, boleta, grupos, salida, seguridad CSRF e historial. La suite integrada fue verificada contra MongoDB Atlas usando una base temporal aislada que se elimina al finalizar. La documentación y los 52 casos de la versión anterior en SQLite se conservan como referencia histórica en `docs/`; **no constituyen resultados actuales de la nueva versión**.

## Arquitectura y seguridad

`public/` (SPA HTML/CSS/JS) → `src/presentation/app.js` (API Express, sesiones MongoDB, CSRF, RBAC) → `src/business/` (reglas) → `src/data/` (driver MongoDB e índices únicos). El acceso a datos de hospedaje está restringido al Encargado. El Administrador gestiona cuentas y auditoría, no ve pasajeros. La contraseña utiliza bcrypt. Cookies HttpOnly y SameSite Strict, Helmet y CSP. Las entradas se validan y se muestran mediante nodos de texto para mitigar inyección y XSS. Las sesiones tienen expiración y se guardan en MongoDB. Los check-ins y check-outs utilizan transacciones MongoDB; las habitaciones se mantienen en limpieza después del check-out hasta habilitarlas.

Los servicios de Open-Meteo (clima) y mindicador.cl (dólar) funcionan con caché y pueden fallar sin bloquear la operación del hotel. La imagen de portada se incluye en el ZIP.

## Archivos relevantes

- `src/data/db.js` — conexión MongoDB, índices y transacciones.
- `src/data/repositorios.js` — colecciones MongoDB, consultas y registros de ocupantes.
- `src/business/asignacionService.js` — validaciones, acompañantes, duplicidad, grupos, boletas.
- `src/business/validadores.js` — RUT, nombres, habitaciones y fechas.
- `src/presentation/sessionStore.js` — sesiones en MongoDB con TTL.
- `src/presentation/app.js` — endpoints protegidos.
- `public/js/app.js` — interfaz de registro, listado y boleta imprimible.
- `tests/` — pruebas nuevas de Unidad 4.
