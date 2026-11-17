# Verificación de la Evaluación Unidad 4 — Hotel Duerme Bien

**Alcance:** nueva implementación MongoDB, validación de nombre / número, identificación individual por RUT, control de duplicidad y boleta de estadía.

## Resultados comprobados en el entorno de edición

Se ejecutó `node --test tests/validaciones.test.js`:

| Caso | Validación | Resultado |
|---|---|---|
| EV4-01 | Solo números naturales positivos para habitación | Aprobado |
| EV4-02 | Nombres de personas no numéricos ni HTML | Aprobado |
| EV4-03 | RUT chileno, módulo 11 | Aprobado |
| EV4-04 | Dos vistas de habitación y capacidades por tipo | Aprobado |
| EV4-05 | Cálculo de noches y validación de fechas | Aprobado |
| EV4-06 (mock) | Flujo de creación, duplicidad, boleta y salida con repositorio simulado | Aprobado; **no sustituye prueba con MongoDB real** |

## Pruebas de integración pendientes de ejecutar con MongoDB real

`MONGODB_TEST_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" npm run test:integration` (Linux/macOS; en PowerShell, definir primero la variable). Archivo `tests/mongodb.test.js`:

| Caso | Verificación esperada | Estado |
|---|---|---|
| INT-01 | API rechaza 0, letras, guiones, decimales | Pendiente: sin servidor MongoDB disponible aquí |
| INT-02 | API rechaza nombre numérico | Pendiente |
| INT-03 | Guarda segundo RUT en `pasajeros` y `asignaciones.ocupantes_detalle` | Pendiente |
| INT-04 | Rechaza estadía con acompañante sin datos | Pendiente |
| INT-05 | Rechaza huésped ocupado en segunda habitación | Pendiente |
| INT-06 | Boleta incluye nombre, RUT, tarifa, noches y total | Pendiente |
| INT-07 | Check-out desocupa persona y habitación queda en limpieza | Pendiente |
| INT-08 | Grupo con representante y acompañantes en habitaciones distintas | Pendiente |
| INT-09 | Petición sin CSRF es rechazada | Pendiente |
| INT-10 | Historial por RUT de acompañante | Pendiente |

Los 52 casos del documento `CASOS_DE_PRUEBA.md` original fueron registrados para la versión SQLite de octubre 2026; no deben presentarse como pruebas ejecutadas sobre esta versión sin repetirlos.
