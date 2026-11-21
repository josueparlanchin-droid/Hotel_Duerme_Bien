'use strict';
// Persistencia MongoDB real (driver oficial). Requiere MongoDB en replica set para transacciones.
const { MongoClient } = require('mongodb');

async function abrirDb(config) {
  const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 8000, appName: 'duerme-bien' });
  try {
    await client.connect();
    const database = client.db(config.MONGODB_DB);
    await database.command({ ping: 1 });
    const db = {
      client, database,
      collection: (nombre) => database.collection(nombre),
      async withTransaction(fn) {
        const session = client.startSession();
        try {
          return await session.withTransaction(() => fn(session), {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
          });
        } finally { await session.endSession(); }
      },
      close: () => client.close(),
    };
    await Promise.all([
      // Los contadores se usan dentro de las transacciones: se crean antes para no depender de la
      // creación implícita de colecciones dentro de una transacción (código 48 = ya existe).
      database.createCollection('contadores').catch((e) => { if (e.code !== 48) throw e; }),
      db.collection('usuarios').createIndex({ username: 1 }, { unique: true }),
      db.collection('usuarios').createIndex({ rut: 1 }, { unique: true }),
      db.collection('pasajeros').createIndex({ rut: 1 }, { unique: true }),
      db.collection('habitaciones').createIndex({ numero: 1 }, { unique: true, partialFilterExpression: { activa: true } }),
      db.collection('asignaciones').createIndex({ habitacion_id: 1, estado: 1 }),
      db.collection('asignaciones').createIndex({ 'ocupantes_detalle.rut': 1, fecha_entrada: 1 }),
      db.collection('auditoria').createIndex({ fecha: -1 }),
      db.collection('sesiones').createIndex({ expire: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return db;
  } catch (error) {
    await client.close();
    throw error;
  }
}

module.exports = { abrirDb };
