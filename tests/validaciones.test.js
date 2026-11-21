'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const V=require('../src/business/validadores');
const {CAPACIDAD_POR_TIPO,ORIENTACIONES,EMISOR}=require('../src/business/reglas');

test('EV4-01: número de habitación natural positivo',()=>{
  for(const x of ['1','101','2500',101]) assert.equal(V.numeroHabitacion(x),String(x));
  for(const x of ['0','-5','A101','101B','100-2','1.2','01','  ','@123',1.5]) assert.throws(()=>V.numeroHabitacion(x));
});
test('EV4-02: los nombres no pueden ser solo números ni código HTML',()=>{
  for(const x of ['12345','2 Pedro','<script>','Ana2','']) assert.throws(()=>V.nombre(x));
  assert.equal(V.nombre('María José Pérez'),'María José Pérez');
});
test('EV4-03: RUT chileno en formato normalizado con dígito verificador',()=>{
  const cuerpo='15432167',r=`${cuerpo}-${V.calcularDv(cuerpo)}`;
  assert.equal(V.rut(r),r);
  assert.throws(()=>V.rut('12345678-9'));
});
test('EV4-04: ambas vistas y capacidades definidas por tipo',()=>{
  assert.deepEqual(ORIENTACIONES,['VISTA_MAR','VISTA_CIUDAD']);
  assert.deepEqual(CAPACIDAD_POR_TIPO,{SIMPLE:1,DOBLE:2,SUITE:3,FAMILIAR:4});
});
test('EV4-05: cálculo de noches y fecha cronológica',()=>{
  assert.equal(V.nochesEntre('2026-11-17','2026-11-20'),3);
  assert.throws(()=>V.fecha('2026-02-31','Fecha'));
});
test('EV4-07: el nombre completo exige nombre y apellido (rechaza "yo")',()=>{
  for(const x of ['yo','Yo','Ana','J.','A','12345','Ana2','','<script>']) assert.throws(()=>V.nombre(x),/nombre y apellido|debe tener al menos 2 letras|inválido/);
  assert.equal(V.nombre('Ana Torres Muñoz'),'Ana Torres Muñoz');
  assert.equal(V.nombre('J. Pérez Soto'),'J. Pérez Soto');
  assert.equal(V.nombre('María  José  Pérez'),'María José Pérez');
});
test('EV4-08: datos ficticios del emisor para la boleta (nombre, RUT y calle)',()=>{
  assert.equal(EMISOR.rut,V.rut(EMISOR.rut));
  assert.ok(EMISOR.nombre.length>3 && EMISOR.calle.length>3 && EMISOR.comuna.length>2 && EMISOR.telefono.length>6);
});
