'use strict';
const V = require('./validadores');
const { AppError } = require('../errors');
const { CAPACIDAD_POR_TIPO, TIPOS, ORIENTACIONES } = require('./reglas');
const TRANSICIONES = { EN_LIMPIEZA:['DISPONIBLE','EN_MANTENIMIENTO'], DISPONIBLE:['EN_MANTENIMIENTO'], EN_MANTENIMIENTO:['DISPONIBLE'], OCUPADA:[] };
function crearHabitacionService(repos) {
  const leer = (datos) => {
    const tipo = V.opcion(datos.tipo,TIPOS,'Tipo');
    return { numero:V.numeroHabitacion(datos.numero),tipo,capacidad_maxima:CAPACIDAD_POR_TIPO[tipo],orientacion:V.opcion(datos.orientacion,ORIENTACIONES,'Orientación') };
  };
  const obtener = async (id) => {
    const h = await repos.habitaciones.porId(id);
    if (!h || !h.activa) throw new AppError(404,'Habitación no encontrada.','NO_ENCONTRADO');
    return h;
  };
  return {
    listar: () => repos.habitaciones.listar(),
    async crear(datos,actor,ip) {
      const h = leer(datos);
      if (await repos.habitaciones.porNumeroActiva(h.numero)) throw new AppError(409,`Ya existe la habitación ${h.numero}.`,'DUPLICADO');
      let id;
      try { id = await repos.habitaciones.crear(h); }
      catch (e) { if (e.code === 11000) throw new AppError(409,'El número de habitación ya existe.','DUPLICADO'); throw e; }
      await repos.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:'HABITACION_CREADA',detalle:h.numero,ip });
      return repos.habitaciones.porId(id);
    },
    async actualizar(id,datos,actor,ip) {
      const actual=await obtener(id),h=leer(datos),otra=await repos.habitaciones.porNumeroActiva(h.numero);
      if (otra && otra.id!==id) throw new AppError(409,`Ya existe la habitación ${h.numero}.`,'DUPLICADO');
      if (actual.estado==='OCUPADA' && h.tipo!==actual.tipo) throw new AppError(409,'No se puede cambiar el tipo de una habitación ocupada.','CONFLICTO');
      try { await repos.habitaciones.actualizar(id,h); }
      catch (e) { if (e.code === 11000) throw new AppError(409,'El número de habitación ya existe.','DUPLICADO'); throw e; }
      await repos.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:'HABITACION_ACTUALIZADA',detalle:h.numero,ip });
      return repos.habitaciones.porId(id);
    },
    async eliminar(id,actor,ip) {
      const h=await obtener(id);
      if (h.estado==='OCUPADA') throw new AppError(409,`La habitación ${h.numero} tiene pasajeros activos y no puede eliminarse.`,'CONFLICTO');
      await repos.habitaciones.desactivar(id);
      await repos.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:'HABITACION_ELIMINADA',detalle:h.numero,ip });
    },
    async cambiarEstado(id,estado,actor,ip) {
      const h=await obtener(id),nuevo=V.opcion(estado,['DISPONIBLE','EN_MANTENIMIENTO'],'Estado');
      if (!TRANSICIONES[h.estado].includes(nuevo)) throw new AppError(409,`No se puede pasar la habitación ${h.numero} de ${h.estado} a ${nuevo}.`,'CONFLICTO');
      await repos.habitaciones.setEstado(id,nuevo);
      await repos.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:'HABITACION_ESTADO',detalle:`${h.numero}: ${h.estado} -> ${nuevo}`,ip });
      return repos.habitaciones.porId(id);
    },
  };
}
module.exports = { crearHabitacionService };
