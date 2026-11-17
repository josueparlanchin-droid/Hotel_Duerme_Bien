'use strict';
const bcrypt = require('bcryptjs');
const { CAPACIDAD_POR_TIPO } = require('./business/reglas');
const { crearRepos } = require('./data/repositorios');
const HABITACIONES = [
  ['101','DOBLE','VISTA_MAR'],['102','DOBLE','VISTA_CIUDAD'],['103','SIMPLE','VISTA_CIUDAD'],
  ['104','SUITE','VISTA_MAR'],['105','SIMPLE','VISTA_CIUDAD'],['106','DOBLE','VISTA_MAR'],
  ['107','SIMPLE','VISTA_MAR'],['108','SUITE','VISTA_CIUDAD'],['109','DOBLE','VISTA_CIUDAD'],
  ['110','SIMPLE','VISTA_MAR'],['111','DOBLE','VISTA_MAR'],['112','FAMILIAR','VISTA_MAR'],
];
const USUARIOS = [
  { username: 'admin', nombre: 'Administrador del Sistema', rut: '11111111-1', rol: 'ADMINISTRADOR', pass: 'Admin#2026' },
  { username: 'encargado', nombre: 'Marcela Rojas Pérez', rut: '12345678-5', rol: 'ENCARGADO', pass: 'Encargado#2026' },
];
async function sembrarSiVacio(db, config) {
  const repos = crearRepos(db);
  const estabaVacio = !await repos.usuarios.porUsername('admin');
  const ahora = new Date().toISOString();
  for (const u of USUARIOS) {
    if (!await repos.usuarios.porUsername(u.username)) await repos.usuarios.crear({
      username: u.username, nombre_completo: u.nombre, rut: u.rut,
      password_hash: bcrypt.hashSync(u.pass, config.BCRYPT_ROUNDS), rol: u.rol, creado_en: ahora,
    });
  }
  for (const [numero, tipo, orientacion] of HABITACIONES) {
    if (!await repos.habitaciones.porNumeroActiva(numero)) await repos.habitaciones.crear({
      numero, tipo, orientacion, capacidad_maxima: CAPACIDAD_POR_TIPO[tipo],
    });
  }
  return estabaVacio;
}
module.exports = { sembrarSiVacio, USUARIOS };
