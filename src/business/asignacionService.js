'use strict';
// Check-in individual / grupos con identificación de CADA ocupante y transacciones MongoDB.
const crypto = require('crypto');
const V = require('./validadores');
const { AppError } = require('../errors');
const { crearRepos } = require('../data/repositorios');
const { EMISOR } = require('./reglas');
const ETIQUETA = { DISPONIBLE:'Disponible',OCUPADA:'Ocupada',EN_LIMPIEZA:'En limpieza',EN_MANTENIMIENTO:'En mantenimiento' };

function crearAsignacionService(repos, db, config) {
  const parsear = (datos) => {
    const d = datos || {};
    const raw = d.pasajero || {};
    const p = { nombre:V.nombre(raw.nombreCompleto,'Nombre del pasajero responsable'),
      rut:V.rut(raw.rut,'RUT del pasajero responsable'), email:V.emailOpcional(raw.email),telefono:V.telefonoOpcional(raw.telefono) };
    const entrada=V.fecha(d.fechaEntrada,'Fecha de entrada');
    const salida=V.fecha(d.fechaSalidaEstimada,'Fecha estimada de salida');
    if (entrada!==V.hoyChile()) throw new AppError(400,'La fecha de entrada debe ser la fecha actual (check-in).','VALIDACION');
    if (salida<=entrada) throw new AppError(400,'La fecha de salida debe ser posterior a la de entrada.','VALIDACION');
    if (!Array.isArray(d.habitaciones)||!d.habitaciones.length||d.habitaciones.length>10) throw new AppError(400,'Seleccione entre 1 y 10 habitaciones.','VALIDACION');
    if (d.habitaciones.length>1 && d.esGrupo!==true) throw new AppError(400,'Para asignar varias habitaciones debe indicar que es un grupo.','VALIDACION');
    const items=d.habitaciones.map((h,i)=>{
      const ocupantes=V.entero(h?.ocupantes,'La cantidad de ocupantes',1,10);
      const habitacionId=V.entero(h?.habitacionId,'Habitación',1,1e9);
      const esperados=ocupantes-(i===0?1:0); // responsable físicamente en primera habitación
      if (!Array.isArray(h?.acompanantes)||h.acompanantes.length!==esperados) {
        throw new AppError(400,`Habitación ${i+1}: registre nombre y RUT de ${esperados} acompañante(s).`,'VALIDACION');
      }
      const acompanantes=h.acompanantes.map((x,j)=>({
        nombre:V.nombre(x?.nombreCompleto,`Nombre del acompañante ${j+1}`),
        rut:V.rut(x?.rut,`RUT del acompañante ${j+1}`),
      }));
      return { habitacionId,ocupantes,acompanantes };
    });
    if (new Set(items.map((it)=>it.habitacionId)).size!==items.length) throw new AppError(400,'No puede repetir una habitación.','VALIDACION');
    const todos=[p,...items.flatMap((it)=>it.acompanantes)];
    if (new Set(todos.map((it)=>it.rut)).size!==todos.length) throw new AppError(409,'Una persona no puede registrarse dos veces en la misma estadía o en habitaciones distintas.','DUPLICADO');
    return {p,items,entrada,salida,noches:V.nochesEntre(entrada,salida),esGrupo:d.esGrupo===true};
  };

  return {
    async crear(datos,actor,ip) {
      const ctx=parsear(datos);
      try { return await db.withTransaction(async (session)=>{
        const trx=crearRepos(db,session);
        const {p,items,entrada,salida,noches}=ctx;
        const habitaciones=[];
        for (const it of items) {
          const h=await trx.habitaciones.porId(it.habitacionId);
          if (!h||!h.activa) throw new AppError(404,'Habitación no encontrada.','NO_ENCONTRADO');
          if (h.estado!=='DISPONIBLE') throw new AppError(409,`La habitación ${h.numero} no está disponible (estado actual: ${ETIQUETA[h.estado]}).`,'NO_DISPONIBLE');
          if (it.ocupantes>h.capacidad_maxima) throw new AppError(422,`La habitación ${h.numero} admite un máximo de ${h.capacidad_maxima} ocupantes.`,'CAPACIDAD');
          habitaciones.push(h);
        }
        const grupoId=crypto.randomUUID(),creadoEn=new Date().toISOString(),personas=new Map();
        for (const persona of [p,...items.flatMap((it)=>it.acompanantes)]) {
          let existente=await trx.pasajeros.porRut(persona.rut), id;
          if (existente) {
            if (existente.estancia_activa) throw new AppError(409,`El RUT ${persona.rut} ya está hospedado en otra habitación con fechas superpuestas.`,'ESTADIA_DUPLICADA');
            id=existente.id;
            await trx.pasajeros.actualizar(id,{ nombre_completo:persona.nombre,
              ...(persona.rut===p.rut?{email:p.email??existente.email,telefono:p.telefono??existente.telefono}:{}) });
          } else {
            id=await trx.pasajeros.crear({ rut:persona.rut,nombre_completo:persona.nombre,
              email:persona.rut===p.rut?p.email:null,telefono:persona.rut===p.rut?p.telefono:null,creado_en:creadoEn });
          }
          personas.set(persona.rut,{ id,rut:persona.rut,nombre_completo:persona.nombre });
        }
        const responsableId=personas.get(p.rut).id, asignaciones=[];
        for (let i=0;i<items.length;i++) {
          const it=items[i],h=habitaciones[i];
          const miembros=[...(i===0?[p]:[]),...it.acompanantes];
          const detalles=miembros.map((x)=>({ pasajero_id:personas.get(x.rut).id,
            rut:x.rut,nombre_completo:x.nombre,es_responsable:x.rut===p.rut }));
          const costo=it.ocupantes*noches*config.TARIFA_POR_PASAJERO;
          const id=await trx.asignaciones.crear({ grupo_id:grupoId,habitacion_id:h.id,pasajero_id:responsableId,
            cantidad_ocupantes:it.ocupantes,acompanantes:it.acompanantes.map(x=>x.nombre).join(', ')||null,
            ocupantes_detalle:detalles,fecha_entrada:entrada,fecha_salida_estimada:salida,
            noches,tarifa_noche:config.TARIFA_POR_PASAJERO,costo_total:costo,creado_en:creadoEn,usuario_id:actor.id });
          for (const persona of detalles) {
            const r=await trx.pasajeros.ocupar(persona.pasajero_id,{ asignacionId:id,grupoId,habitacionId:h.id,entrada,salida });
            if (r.modifiedCount!==1) throw new AppError(409,`El RUT ${persona.rut} ya tiene una estadía activa.`,'ESTADIA_DUPLICADA');
          }
          await trx.habitaciones.setEstado(h.id,'OCUPADA');
          asignaciones.push({ id,habitacion:h.numero,ocupantes:it.ocupantes,noches,costo,personas:detalles });
        }
        await trx.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:'ASIGNACION_CREADA',
          detalle:`${p.rut} -> hab. ${asignaciones.map(a=>a.habitacion).join(', ')}`,ip });
        return { grupoId,creadoEn,pasajeroId:responsableId,responsable:{rut:p.rut,nombre:p.nombre},
          asignaciones,costoTotal:asignaciones.reduce((s,a)=>s+a.costo,0),fechaEntrada:entrada,
          fechaSalidaEstimada:salida,noches,tarifaPorNoche:config.TARIFA_POR_PASAJERO,
          totalPersonas:asignaciones.reduce((s,a)=>s+a.ocupantes,0) };
      }); } catch (e) {
        if (e.code === 11000) throw new AppError(409, 'RUT duplicado o registro modificado concurrentemente.','ESTADIA_DUPLICADA');
        if (e.hasErrorLabel?.('TransientTransactionError')) throw new AppError(409,'Otra operación modificó los registros. Vuelva a intentarlo.','CONFLICTO');
        throw e;
      }
    },
    activas:()=>repos.asignaciones.activas(),
    async checkout(id,actor,ip) {
      return db.withTransaction(async(session)=>{
        const trx=crearRepos(db,session);
        const a=await trx.asignaciones.porId(id);
        if (!a) throw new AppError(404,'Asignación no encontrada.','NO_ENCONTRADO');
        if (a.estado!=='ACTIVA') throw new AppError(409,'La estadía ya fue finalizada.','CONFLICTO');
        await trx.asignaciones.finalizar(id,new Date().toISOString());
        for (const p of a.ocupantes_detalle) await trx.pasajeros.desocupar(p.pasajero_id,id);
        await trx.habitaciones.setEstado(a.habitacion_id,'EN_LIMPIEZA');
        await trx.auditoria.registrar({ usuarioId:actor.id,username:actor.username,accion:'CHECKOUT',detalle:`Hab. ${a.habitacion_numero} - ${a.pasajero_rut}`,ip });
        return trx.asignaciones.porId(id);
      });
    },
    async historial({habitacionId,rut}) {
      return repos.asignaciones.historial({ habitacionId:habitacionId?V.idParam(habitacionId):undefined,
        rut:rut?V.rut(rut):undefined });
    },
    async boleta(grupoId) {
      if (typeof grupoId!=='string'||!/^[a-f0-9-]{36}$/i.test(grupoId)) throw new AppError(400,'Identificador de boleta inválido.','VALIDACION');
      const registros=await repos.asignaciones.porGrupo(grupoId);
      if (!registros.length) throw new AppError(404,'Estadía no encontrada.','NO_ENCONTRADO');
      const a=registros[0];
      // Los datos del huésped se leen del snapshot del check-in (ocupantes_detalle), no del registro
      // vivo del pasajero: así la boleta de una estadía antigua nunca cambia si el pasajero se
      // vuelve a registrar más adelante con otro nombre.
      const detalleResponsable=(a.ocupantes_detalle||[]).find((d)=>d&&d.es_responsable);
      return { numero:`DB-${a.grupo_id.slice(0,8).toUpperCase()}`,grupoId,emitidaEn:a.creado_en,
        creadoEn:a.creado_en,
        emisor:{ nombre:config.HOTEL_NOMBRE||EMISOR.nombre,rut:config.HOTEL_RUT||EMISOR.rut,
          calle:config.HOTEL_CALLE||EMISOR.calle,comuna:config.HOTEL_COMUNA||EMISOR.comuna,
          telefono:config.HOTEL_TELEFONO||EMISOR.telefono },
        responsable:{ nombre:detalleResponsable?.nombre_completo||a.pasajero_nombre,
          rut:detalleResponsable?.rut||a.pasajero_rut },
        fechaEntrada:a.fecha_entrada,fechaSalidaEstimada:a.fecha_salida_estimada,noches:a.noches,
        tarifaPorPersonaNoche:a.tarifa_noche,totalPersonas:registros.reduce((s,x)=>s+x.cantidad_ocupantes,0),
        habitaciones:registros.map(x=>({numero:x.habitacion_numero,tipo:x.habitacion_tipo,
          cantidad:x.cantidad_ocupantes,ocupantes:x.ocupantes_detalle,subtotal:x.costo_total,estado:x.estado})),
        total:registros.reduce((s,x)=>s+x.costo_total,0),tipo:'Comprobante informativo de estadía (no es documento tributario)' };
    },
  };
}
module.exports={crearAsignacionService};
