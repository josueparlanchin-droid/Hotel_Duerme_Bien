'use strict';
const V=require('./validadores');
const {AppError}=require('../errors');
function crearPasajeroService(repos) {
  return {
    async buscarPorRut(rutEntrada) {
      const p=await repos.pasajeros.porRut(V.rut(rutEntrada));
      if (!p) throw new AppError(404,'Pasajero no registrado.','NO_ENCONTRADO');
      return p;
    },
    async actualizarContacto(id,datos,actor,ip) {
      const p=await repos.pasajeros.porId(id);
      if (!p) throw new AppError(404,'Pasajero no encontrado.','NO_ENCONTRADO');
      await repos.pasajeros.actualizar(id,{ email:V.emailOpcional(datos.email),telefono:V.telefonoOpcional(datos.telefono) });
      await repos.auditoria.registrar({usuarioId:actor.id,username:actor.username,accion:'PASAJERO_ACTUALIZADO',detalle:p.rut,ip});
      return repos.pasajeros.porId(id);
    },
  };
}
module.exports={crearPasajeroService};
