'use strict';
// Arranque compartido entre el servidor HTTP (Render/local) y la función serverless (Vercel).
// La conexión a MongoDB y la app de Express se crean una sola vez y se reutilizan: en Vercel cada
// petición reutiliza la instancia viva de la función, por eso la conexión no se abre por request.
const config = require('./config');
const { abrirDb } = require('./data/db');
const { sembrarSiVacio, USUARIOS } = require('./seed');
const { crearApp } = require('./presentation/app');

let promesa = null; // promesa de arranque, cacheada a nivel de módulo

// Devuelve { app, db }. Si el arranque falla se limpia la caché para poder reintentar.
async function obtenerApp() {
  if (!promesa) {
    promesa = (async () => {
      const db = await abrirDb(config);
      if (await sembrarSiVacio(db, config)) {
        console.log('Datos de demostración creados (cambiar credenciales en producción):');
        for (const u of USUARIOS) console.log(`  ${u.rol}: ${u.username} / ${u.pass}`);
      }
      return { app: crearApp(db, config), db };
    })().catch((e) => { promesa = null; throw e; });
  }
  return promesa;
}

module.exports = { obtenerApp, config };
