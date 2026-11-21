'use strict';
// Reglas de dominio del hotel en un solo lugar (fáciles de cambiar)

// La capacidad máxima de una habitación depende de su tipo
const CAPACIDAD_POR_TIPO = { SIMPLE: 1, DOBLE: 2, SUITE: 3, FAMILIAR: 4 };
const TIPOS = Object.keys(CAPACIDAD_POR_TIPO);

// Orientación de la habitación: lo que se ve desde la ventana
const ORIENTACIONES = ['VISTA_MAR', 'VISTA_CIUDAD'];

// Datos del emisor que se imprimen en la boleta. Son FICTICIOS (no corresponden a un hotel real)
// y se pueden reemplazar por variables de entorno (ver src/config.js).
const EMISOR = {
  nombre: 'Hotel Duerme Bien Ltda.',
  rut: '76543210-3',
  calle: 'Av. Drake 1234',
  comuna: 'Viña del Mar',
  telefono: '+56 32 210 1234',
};

module.exports = { CAPACIDAD_POR_TIPO, TIPOS, ORIENTACIONES, EMISOR };
