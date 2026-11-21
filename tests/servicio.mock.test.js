'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const path='../';
const {crearRepos}=require(path+'src/data/repositorios');
const {crearAsignacionService}=require(path+'src/business/asignacionService');
const V=require(path+'src/business/validadores');
let state={};
const deep=(x)=>structuredClone(x);
const get=(o,k)=>k.split('.').reduce((p,a)=>p?.[a],o);
const matches=(doc,query)=>Object.entries(query).every(([k,v])=>{let a=get(doc,k);if(v&&typeof v==='object'&&!Array.isArray(v)){if('$in' in v)return v.$in.includes(a);if('$gt'in v)return a>v.$gt;}return a===v;});
const coll=(name)=>({
 async findOne(q){return deep((state[name]||[]).find(d=>matches(d,q))||null);},
 async findOneAndUpdate(q,updates,opts){state[name]??=[];let d=state[name].find(x=>matches(x,q));if(!d){d={...q,seq:0};state[name].push(d);}d.seq+=(updates.$inc?.seq||0);return deep(d);},
 async insertOne(doc){state[name]??=[];state[name].push(deep(doc));return {insertedId:doc.id};},
 async updateOne(q,upd){let d=(state[name]||[]).find(x=>matches(x,q));if(!d)return {matchedCount:0,modifiedCount:0};Object.assign(d,deep(upd.$set||{}));return{matchedCount:1,modifiedCount:1};},
 find(q){let data=(state[name]||[]).filter(x=>matches(x,q||{}));return {sort(obj){let [key,value]=Object.entries(obj)[0];data=data.sort((a,b)=>((get(a,key)>get(b,key))?1:-1)*value);return this;},limit(n){data=data.slice(0,n);return this;}, async toArray(){return deep(data);}};},
 async countDocuments(q){return (state[name]||[]).filter(d=>matches(d,q)).length;},
});
const db={collection:coll,async withTransaction(fn){const prev=deep(state);try{return await fn({})}catch(e){state=prev;throw e;}}};
const repos=crearRepos(db); const svc=crearAsignacionService(repos,db,{TARIFA_POR_PASAJERO:40000});
test('EV4-06: flujo de negocio con repositorio simulado: RUT acompañante, atomicidad, boleta y check-out',async()=>{
const num=await repos.habitaciones.crear({numero:'101',tipo:'DOBLE',orientacion:'VISTA_MAR',capacidad_maxima:2});
const num2=await repos.habitaciones.crear({numero:'102',tipo:'DOBLE',orientacion:'VISTA_CIUDAD',capacidad_maxima:2});
const rut=(x)=>`${x}-${V.calcularDv(x)}`;
const p1={nombreCompleto:'Ana Torres Muñoz',rut:rut('15432167')},p2={nombreCompleto:'Luis Fuentes Soto',rut:rut('12345679')};
const actor={id:1,username:'encargado'};
const payload={pasajero:p1,habitaciones:[{habitacionId:num,ocupantes:2,acompanantes:[p2]}],fechaEntrada:V.hoyChile(),fechaSalidaEstimada:new Date(Date.now()+2*86400000).toLocaleDateString('en-CA',{timeZone:'America/Santiago'})};
const a=await svc.crear(payload,actor,'127.0.0.1');assert.equal(a.costoTotal,160000);assert.equal((await repos.pasajeros.porRut(p2.rut)).estancia_activa.habitacionId,num);
const b=await svc.boleta(a.grupoId);assert.equal(b.habitaciones[0].ocupantes[1].rut,p2.rut);
await assert.rejects(svc.crear({...payload,pasajero:p2,habitaciones:[{habitacionId:num2,ocupantes:1,acompanantes:[]}]},actor,'127.0.0.1'),/ya está hospedado/);
assert.equal((await repos.habitaciones.porId(num2)).estado,'DISPONIBLE');
const out=await svc.checkout(a.asignaciones[0].id,actor,'127.0.0.1');assert.equal(out.estado,'FINALIZADA');
assert.equal((await repos.pasajeros.porRut(p2.rut)).estancia_activa,null);
assert.ok(true);
});
test('EV4-09: la boleta muestra los datos ficticios del emisor y conserva el snapshot del check-in',async()=>{
 const rut=(x)=>`${x}-${V.calcularDv(x)}`;
 const actor={id:1,username:'encargado'};
 const num3=await repos.habitaciones.crear({numero:'103',tipo:'SIMPLE',orientacion:'VISTA_CIUDAD',capacidad_maxima:1});
 const rAna=rut('15432167');
 const payload={pasajero:{nombreCompleto:'Ana Torres Muñoz',rut:rAna},
   fechaEntrada:V.hoyChile(),fechaSalidaEstimada:new Date(Date.now()+2*86400000).toLocaleDateString('en-CA',{timeZone:'America/Santiago'}),
   habitaciones:[{habitacionId:num3,ocupantes:1,acompanantes:[]}]};
 const a=await svc.crear(payload,actor,'127.0.0.1');
 const b=await svc.boleta(a.grupoId);
 assert.equal(b.responsable.nombre,'Ana Torres Muñoz');
 assert.equal(b.emisor.nombre,'Hotel Duerme Bien Ltda.');
 assert.equal(b.emisor.rut,V.rut(b.emisor.rut));
 assert.ok(b.emisor.calle.length>3);
 // el pasajero vuelve a registrarse con otro nombre: la boleta anterior no debe cambiar
 await svc.checkout(a.asignaciones[0].id,actor,'127.0.0.1');
 const num4=await repos.habitaciones.crear({numero:'104',tipo:'SIMPLE',orientacion:'VISTA_MAR',capacidad_maxima:1});
 await svc.crear({...payload,habitaciones:[{habitacionId:num4,ocupantes:1,acompanantes:[]}],
   pasajero:{nombreCompleto:'Ana María Torres Muñoz',rut:rAna}},actor,'127.0.0.1');
 const b2=await svc.boleta(a.grupoId);
 assert.equal(b2.responsable.nombre,'Ana Torres Muñoz');
 assert.equal((await repos.pasajeros.porRut(rAna)).nombre_completo,'Ana María Torres Muñoz');
});
