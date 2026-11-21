'use strict';
// Función serverless para Vercel: reenvía /api/* a la misma app Express que usa Render.
// El archivo api/[...slug].js es la convención "catch-all" de Vercel: captura todas las rutas
// /api/* (donde vive la API: /api/auth, /api/asignaciones, /api/boletas...). La SPA en public/
// la sirve el CDN de Vercel sin tocar nada.
const { obtenerApp } = require('../src/arranque');

module.exports = async (req, res) => {
  const { app } = await obtenerApp();
  // En Vercel la ruta original llega en req.originalUrl; se restaura si req.url viene recortada.
  const original = req.originalUrl || req.url;
  if (original && !original.startsWith('/api')) req.url = original;
  return app(req, res);
};
