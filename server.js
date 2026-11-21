'use strict';
const { obtenerApp, config } = require('./src/arranque');

// Servidor HTTP: Render, Docker o `npm start` en local.
if (require.main === module) {
  (async () => {
    const { app, db } = await obtenerApp();
    const server = app.listen(config.PORT, () =>
      console.log(`Duerme Bien: http://localhost:${config.PORT} (MongoDB: ${config.MONGODB_DB})`));
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
      server.close(); await db.close(); process.exit(0);
    });
  })().catch((e) => { console.error('No fue posible iniciar Duerme Bien:', e.message); process.exitCode = 1; });
}

// Vercel / funciones serverless: se exporta el manejador que reenvía a la misma app.
module.exports = async (req, res) => {
  const { app } = await obtenerApp();
  return app(req, res);
};
