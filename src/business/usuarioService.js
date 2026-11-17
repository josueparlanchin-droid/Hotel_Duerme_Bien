'use strict';
const bcrypt = require('bcryptjs');
const V = require('./validadores');
const { AppError } = require('../errors');
function crearUsuarioService(repos, config) {
  return {
    listar: () => repos.usuarios.listar(),
    async crear(datos, actor, ip) {
      const nuevo = { username: V.username(datos.username), nombre_completo: V.nombre(datos.nombreCompleto,'Nombre completo'),
        rut: V.rut(datos.rut), rol: V.opcion(datos.rol,['ADMINISTRADOR','ENCARGADO'],'Rol'), creado_en: new Date().toISOString() };
      const pass = V.password(datos.password);
      if (await repos.usuarios.porUsername(nuevo.username)) throw new AppError(409,'El nombre de usuario ya existe.','DUPLICADO');
      if (await repos.usuarios.porRut(nuevo.rut)) throw new AppError(409,'Ya existe un usuario con ese RUT.','DUPLICADO');
      nuevo.password_hash = bcrypt.hashSync(pass, config.BCRYPT_ROUNDS);
      let id;
      try { id = await repos.usuarios.crear(nuevo); }
      catch (e) { if (e.code === 11000) throw new AppError(409,'Usuario o RUT duplicado.','DUPLICADO'); throw e; }
      await repos.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:'USUARIO_CREADO',detalle:`${nuevo.username} (${nuevo.rol})`,ip });
      return { id, username:nuevo.username,nombre_completo:nuevo.nombre_completo,rut:nuevo.rut,rol:nuevo.rol,activo:true };
    },
    async cambiarActivo(id, activo, actor, ip) {
      if (typeof activo !== 'boolean') throw new AppError(400,'El campo "activo" debe ser verdadero o falso.','VALIDACION');
      const u = await repos.usuarios.porId(id);
      if (!u) throw new AppError(404,'Usuario no encontrado.','NO_ENCONTRADO');
      if (u.id === actor.id) throw new AppError(409,'No puede desactivar su propia cuenta.','CONFLICTO');
      await repos.usuarios.setActivo(id,activo);
      if (activo) await repos.usuarios.limpiarFallos(id);
      await repos.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:activo?'USUARIO_ACTIVADO':'USUARIO_DESACTIVADO',detalle:u.username,ip });
    },
  };
}
module.exports = { crearUsuarioService };
