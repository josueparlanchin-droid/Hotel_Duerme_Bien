'use strict';
// Se ejecuta SOLO con MONGODB_TEST_URI: usa una BD aislada y la elimina al finalizar.
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const V=require('../src/business/validadores');
const configBase=require('../src/config');
const testUri=process.env.MONGODB_TEST_URI;
const rutDe=(c)=>`${c}-${V.calcularDv(c)}`;

test('Integración completa MongoDB (requiere replica set y MONGODB_TEST_URI)',{skip:!testUri},async(t)=>{
  const request=require('supertest');
  const {abrirDb}=require('../src/data/db');
  const {crearApp}=require('../src/presentation/app');
  const {sembrarSiVacio}=require('../src/seed');
  const config={...configBase,MONGODB_URI:testUri,MONGODB_DB:`duerme_test_${crypto.randomUUID().replace(/-/g,'').slice(0,26)}`};
  const db=await abrirDb(config);
  t.after(async()=>{try{await db.database.dropDatabase();}finally{await db.close();}});
  await sembrarSiVacio(db,config);
  const app=crearApp(db,config);
  const agent=request.agent(app);
  const login=await agent.post('/api/auth/login').send({username:'encargado',password:'Encargado#2026'});
  assert.equal(login.status,200,JSON.stringify(login.body));
  const csrf=login.body.csrfToken;
  const post=(url,body)=>agent.post(url).set('x-csrf-token',csrf).send(body);
  const patch=(url,body)=>agent.patch(url).set('x-csrf-token',csrf).send(body);
  const habs=(await agent.get('/api/habitaciones')).body;
  const id=(n)=>habs.find(h=>h.numero===n).id;
  const hoy=V.hoyChile();
  const manana=new Date(Date.now()+2*86400000).toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
  const entrada={fechaEntrada:hoy,fechaSalidaEstimada:manana};
  const primero={nombreCompleto:'Ana Torres Muñoz',rut:rutDe('15432167')};
  const segundo={nombreCompleto:'Luis Fuentes Soto',rut:rutDe('12345679')};
  const tercero={nombreCompleto:'Carla Fuentes Soto',rut:rutDe('12345670')};
  const cuarto={nombreCompleto:'Marta Fuentes Soto',rut:rutDe('12345671')};

  await t.test('INT-00: health check publico con ping a MongoDB',async()=>{
    const r=await agent.get('/api/health');
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(r.body.ok,true);
    assert.equal(r.body.db,'ok');
  });
  await t.test('INT-01: solo número natural para habitación (API)',async()=>{
    for(const numero of ['ABC','12-3','0','123.4','-8']) {
      const r=await post('/api/habitaciones',{numero,tipo:'DOBLE',orientacion:'VISTA_MAR'});
      assert.equal(r.status,400,JSON.stringify(r.body));
    }
  });
  await t.test('INT-02: nombres solo numéricos rechazados',async()=>{
    const r=await post('/api/asignaciones',{...entrada,pasajero:{...primero,nombreCompleto:'12345'},
      habitaciones:[{habitacionId:id('101'),ocupantes:1,acompanantes:[]}]});
    assert.equal(r.status,400);
  });
  await t.test('INT-02b: nombre sin apellido ("yo") es rechazado por la API',async()=>{
    const r=await post('/api/asignaciones',{...entrada,pasajero:{nombreCompleto:'yo',rut:rutDe('11111112')},
      habitaciones:[{habitacionId:id('105'),ocupantes:1,acompanantes:[]}]});
    assert.equal(r.status,400,JSON.stringify(r.body));
    assert.equal((await db.collection('habitaciones').findOne({numero:'105'})).estado,'DISPONIBLE');
  });
  let grupoId,asignacionId;
  await t.test('INT-03: registra RUT del segundo pasajero en MongoDB',async()=>{
    const r=await post('/api/asignaciones',{...entrada,pasajero:primero,
      habitaciones:[{habitacionId:id('101'),ocupantes:2,acompanantes:[segundo]}]});
    assert.equal(r.status,201,JSON.stringify(r.body));
    assert.equal(r.body.costoTotal,160000);
    grupoId=r.body.grupoId; asignacionId=r.body.asignaciones[0].id;
    const p=await db.collection('pasajeros').findOne({rut:segundo.rut});
    assert.equal(p.nombre_completo,segundo.nombreCompleto);
    assert.equal(p.estancia_activa.habitacionId,id('101'));
    const a=await db.collection('asignaciones').findOne({grupo_id:grupoId});
    assert.equal(a.ocupantes_detalle[1].rut,segundo.rut);
  });
  await t.test('INT-04: faltan los datos del acompañante: 400',async()=>{
    const r=await post('/api/asignaciones',{...entrada,pasajero:{nombreCompleto:'Pedro Soto Vidal',rut:rutDe('9876543')},
      habitaciones:[{habitacionId:id('102'),ocupantes:2,acompanantes:[]}]});
    assert.equal(r.status,400);
  });
  await t.test('INT-05: misma persona no puede habitar dos habitaciones superpuestas',async()=>{
    const r=await post('/api/asignaciones',{...entrada,pasajero:segundo,
      habitaciones:[{habitacionId:id('102'),ocupantes:1,acompanantes:[]}]});
    assert.equal(r.status,409,JSON.stringify(r.body));
    assert.equal((await db.collection('habitaciones').findOne({numero:'102'})).estado,'DISPONIBLE');
  });
  await t.test('INT-06: consulta boleta completa desde API',async()=>{
    const r=await agent.get(`/api/boletas/${grupoId}`);
    assert.equal(r.status,200);
    assert.equal(r.body.totalPersonas,2);
    assert.equal(r.body.noches,2);
    assert.equal(r.body.tarifaPorPersonaNoche,40000);
    assert.equal(r.body.total,160000);
    assert.equal(r.body.habitaciones[0].ocupantes[1].rut,segundo.rut);
    // datos ficticios del emisor impresos en la boleta
    assert.equal(r.body.emisor.nombre,'Hotel Duerme Bien Ltda.');
    assert.ok(r.body.emisor.calle.length>3 && r.body.emisor.comuna.length>2);
    assert.equal(r.body.responsable.nombre,primero.nombreCompleto);
    assert.equal(r.body.responsable.rut,primero.rut);
  });
  await t.test('INT-07: check-out libera RUT y pasa a limpieza',async()=>{
    assert.equal((await post(`/api/asignaciones/${asignacionId}/checkout`,{})).status,200);
    assert.equal((await db.collection('habitaciones').findOne({numero:'101'})).estado,'EN_LIMPIEZA');
    assert.equal((await db.collection('pasajeros').findOne({rut:segundo.rut})).estancia_activa,null);
    assert.equal((await patch(`/api/habitaciones/${id('101')}/estado`,{estado:'DISPONIBLE'})).status,200);
  });
  await t.test('INT-08: grupo con acompañantes y representante en habitaciones distintas',async()=>{
    const r=await post('/api/asignaciones',{...entrada,esGrupo:true,
      pasajero:{nombreCompleto:'Pedro Soto Vidal',rut:rutDe('9876543')},habitaciones:[
        {habitacionId:id('103'),ocupantes:1,acompanantes:[]},
        {habitacionId:id('104'),ocupantes:2,acompanantes:[tercero,cuarto]},
      ]});
    assert.equal(r.status,201,JSON.stringify(r.body));
    assert.equal(r.body.asignaciones.length,2);
    assert.equal(r.body.costoTotal,240000);
    const b=await agent.get(`/api/boletas/${r.body.grupoId}`);
    assert.equal(b.body.habitaciones.length,2);
    assert.equal(b.body.totalPersonas,3);
  });
  await t.test('INT-09: CSRF obligatorio',async()=>{
    const r=await agent.post('/api/habitaciones').send({numero:'500',tipo:'DOBLE',orientacion:'VISTA_CIUDAD'});
    assert.equal(r.status,403);
  });
  await t.test('INT-10: historial consultable por RUT del acompañante',async()=>{
    const r=await agent.get(`/api/historial?rut=${encodeURIComponent(segundo.rut)}`);
    assert.equal(r.status,200);
    assert.equal(r.body.length,1);
    assert.equal(r.body[0].estado,'FINALIZADA');
  });
});
