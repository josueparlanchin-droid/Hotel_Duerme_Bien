'use strict';
const bcrypt = require('bcryptjs');
const { AppError } = require('../errors');
function crearAuthService(repos, config) {
  const falso = bcrypt.hashSync('contraseña-inexistente', config.BCRYPT_ROUNDS);
  const generico = 'Usuario o contraseña incorrectos.';
  return {
    async iniciarSesion(username, password, ip) {
      const u = typeof username === 'string' ? await repos.usuarios.porUsername(username.trim().toLowerCase()) : null;
      const clave = typeof password === 'string' ? password.slice(0, 72) : '';
      if (!u) {
        bcrypt.compareSync(clave, falso);
        await repos.auditoria.registrar({ username: String(username).slice(0,30), accion: 'LOGIN_FALLIDO', detalle: 'Usuario inexistente', ip });
        throw new AppError(401, generico, 'CREDENCIALES');
      }
      if (u.bloqueado_hasta && u.bloqueado_hasta > Date.now()) {
        await repos.auditoria.registrar({ usuarioId:u.id, username:u.username, accion:'LOGIN_BLOQUEADO', ip });
        throw new AppError(423,'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.','BLOQUEADO');
      }
      const ok = bcrypt.compareSync(clave, u.password_hash);
      if (!ok || !u.activo) {
        const intentos = (u.intentos_fallidos || 0) + 1;
        const bloqueo = intentos >= config.MAX_INTENTOS;
        await repos.usuarios.registrarFallo(u.id, bloqueo ? 0 : intentos, bloqueo ? Date.now() + config.BLOQUEO_MS : null);
        await repos.auditoria.registrar({ usuarioId:u.id, username:u.username, accion:'LOGIN_FALLIDO', detalle:!u.activo ? 'Cuenta desactivada' : bloqueo ? 'Cuenta bloqueada' : `Intento ${intentos}`, ip });
        throw new AppError(401,generico,'CREDENCIALES');
      }
      await repos.usuarios.limpiarFallos(u.id);
      await repos.auditoria.registrar({ usuarioId:u.id, username:u.username, accion:'LOGIN_OK', ip });
      return { id:u.id, username:u.username, nombre:u.nombre_completo, rol:u.rol };
    },
  };
}
module.exports = { crearAuthService };
