# Hotel Duerme Bien — Evaluación Unidad 4

Sistema web para un hotel desarrollado con **Node.js + Express + MongoDB**. Incluye gestión de usuarios, roles, habitaciones, estadías individuales y de grupos, RUT de cada ocupante (incluido el segundo pasajero), seguridad de acceso, historial, auditoría y boleta de estadía imprimible.

## Cambios aplicados para la Evaluación 4

| Solicitud | Implementación |
|---|---|
| Número de habitación solo natural positivo | Validación en interfaz y servidor: `1`, `101`, `204` válidos; `0`, `1A`, `-5`, `12-3`, `1.5` rechazados. |
| Nombres de personas no pueden ser números | Validación de nombre y apellido del responsable y de **todos los acompañantes**. |
| Nadie puede estar en dos habitaciones a la vez | Se verifica el RUT de cada ocupante y se bloquean registros simultáneos usando transacciones y un estado activo por pasajero. |
| Representante de grupo | Un responsable identificado con nombre y RUT, que ocupa la primera habitación; cada habitación adicional incluye sus propios huéspedes identificados. |
| $40.000 por persona y noche | `cantidad de ocupantes × noches × 40000`, por habitación y total del grupo. |
| Dos vistas | `VISTA_MAR` o `VISTA_CIUDAD`. |
| Imagen del hotel al inicio | Imagen SVG incluida en `/public/img/hotel.svg`, visible en el login. |
| Fechas | Entrada (día del check-in), salida estimada posterior a entrada, cantidad de noches y fecha real de check-out. |
| Boleta | Endpoint `GET /api/boletas/:grupoId` y página imprimible con responsable, RUT, huéspedes, habitaciones, fechas, cantidad, noches, tarifa, subtotal y total. Botón **Imprimir / Guardar como PDF**. Es un comprobante informativo, **no una boleta tributaria electrónica**. |
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
