'use strict';
const config = require('./src/config');
const { abrirDb } = require('./src/data/db');
const { crearApp } = require('./src/presentation/app');
const { sembrarSiVacio, USUARIOS } = require('./src/seed');

(async () => {
  const db = await abrirDb(config);
  if (await sembrarSiVacio(db, config)) {
    console.log('Datos de demostración creados (cambiar credenciales en producción):');
    for (const u of USUARIOS) console.log(`  ${u.rol}: ${u.username} / ${u.pass}`);
  }
  const app = crearApp(db, config);
  const server = app.listen(config.PORT, () => console.log(`Duerme Bien: http://localhost:${config.PORT} (MongoDB: ${config.MONGODB_DB})`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
    server.close(); await db.close(); process.exit(0);
  });
})().catch((e) => { console.error('No fue posible iniciar Duerme Bien:', e.message); process.exitCode = 1; });
