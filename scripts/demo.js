'use strict';
// Carga voluntaria de estadías de ejemplo usando MongoDB y las nuevas reglas de identificación.
const config=require('../src/config');
const { abrirDb }=require('../src/data/db');
const { sembrarSiVacio }=require('../src/seed');
const { crearRepos }=require('../src/data/repositorios');
const { crearServicios }=require('../src/business');
const V=require('../src/business/validadores');
const rutDe=(x)=>`${x}-${V.calcularDv(x)}`;
(async()=>{
  const db=await abrirDb(config);
  try {
    await sembrarSiVacio(db,config);
    const repos=crearRepos(db),svc=crearServicios(repos,db,config);
    const actor=await repos.usuarios.porUsername('encargado');
    const fechaEntrada=V.hoyChile(),fechaSalidaEstimada=new Date(Date.now()+3*864e5).toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
    const casos=[
      { pasajero:{nombreCompleto:'Ana Torres Muñoz',rut:rutDe('15432167')},habitaciones:[{habitacionId:(await repos.habitaciones.porNumeroActiva('102')).id,ocupantes:2,
        acompanantes:[{nombreCompleto:'Luis Fuentes Soto',rut:rutDe('12345679')}]}] },
      { pasajero:{nombreCompleto:'Pedro Soto Vidal',rut:rutDe('9876543')},habitaciones:[{habitacionId:(await repos.habitaciones.porNumeroActiva('105')).id,ocupantes:1,acompanantes:[]}] },
    ];
    for (const c of casos) {
      try { await svc.asignaciones.crear({fechaEntrada,fechaSalidaEstimada,esGrupo:false,...c},actor,'127.0.0.1');console.log('OK',c.pasajero.nombreCompleto); }
      catch(e){console.log('OMITIDO',c.pasajero.nombreCompleto,e.message);}
    }
    try { await svc.habitaciones.cambiarEstado((await repos.habitaciones.porNumeroActiva('106')).id,'EN_MANTENIMIENTO',actor,'127.0.0.1'); }
    catch(e){ console.log('Habitación 106:',e.message); }
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
