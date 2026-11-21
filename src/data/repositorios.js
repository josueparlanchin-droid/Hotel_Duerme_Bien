'use strict';
// Acceso a MongoDB mediante objetos de filtro, sin ejecutar consultas desde entradas de usuario.
function crearRepos(db, session = null) {
  const opts = session ? { session } : {};
  const col = (n) => db.collection(n);
  const limpio = (d) => d ? (({ _id, ...rest }) => rest)(d) : null;
  const listos = (arr) => arr.map(limpio);
  const nextId = async (nombre) => {
    const r = await col('contadores').findOneAndUpdate(
      { _id: nombre }, { $inc: { seq: 1 } }, { ...opts, upsert: true, returnDocument: 'after' }
    );
    return r.seq;
  };
  const insertar = async (nombre, datos) => {
    const id = await nextId(nombre);
    await col(nombre).insertOne({ id, ...datos }, opts);
    return id;
  };
  const usuarios = {
    porUsername: async (username) => limpio(await col('usuarios').findOne({ username }, opts)),
    porId: async (id) => limpio(await col('usuarios').findOne({ id }, opts)),
    porRut: async (rut) => limpio(await col('usuarios').findOne({ rut }, opts)),
    listar: async () => listos(await col('usuarios').find({}, { ...opts, projection: { _id: 0, password_hash: 0, intentos_fallidos: 0, bloqueado_hasta: 0 } }).sort({ id: 1 }).toArray()),
    crear: (u) => insertar('usuarios', { ...u, activo: true, intentos_fallidos: 0, bloqueado_hasta: null }),
    setActivo: (id, activo) => col('usuarios').updateOne({ id }, { $set: { activo: !!activo } }, opts),
    registrarFallo: (id, intentos, bloqueadoHasta) => col('usuarios').updateOne({ id }, { $set: { intentos_fallidos: intentos, bloqueado_hasta: bloqueadoHasta } }, opts),
    limpiarFallos: (id) => col('usuarios').updateOne({ id }, { $set: { intentos_fallidos: 0, bloqueado_hasta: null } }, opts),
  };
  const habitaciones = {
    listar: async () => listos(await col('habitaciones').find({ activa: true }, opts).sort({ numero: 1 }).toArray()),
    porId: async (id) => limpio(await col('habitaciones').findOne({ id }, opts)),
    porNumeroActiva: async (numero) => limpio(await col('habitaciones').findOne({ numero, activa: true }, opts)),
    crear: (h) => insertar('habitaciones', { ...h, activa: true, estado: 'DISPONIBLE' }),
    actualizar: (id, h) => col('habitaciones').updateOne({ id }, { $set: h }, opts),
    setEstado: (id, estado) => col('habitaciones').updateOne({ id }, { $set: { estado } }, opts),
    desactivar: (id) => col('habitaciones').updateOne({ id }, { $set: { activa: false } }, opts),
    contar: () => col('habitaciones').countDocuments({}, opts),
  };
  const pasajeros = {
    porRut: async (rut) => limpio(await col('pasajeros').findOne({ rut }, opts)),
    porId: async (id) => limpio(await col('pasajeros').findOne({ id }, opts)),
    crear: (p) => insertar('pasajeros', { ...p, estancia_activa: null }),
    actualizar: (id, p) => col('pasajeros').updateOne({ id }, { $set: p }, opts),
    // Bloquea al pasajero de manera atómica; dos check-ins no pueden ocuparlo a la vez.
    ocupar: (id, estancia) => col('pasajeros').updateOne(
      { id, estancia_activa: null }, { $set: { estancia_activa: estancia } }, opts
    ),
    desocupar: (id, asignacionId) => col('pasajeros').updateOne(
      { id, 'estancia_activa.asignacionId': asignacionId }, { $set: { estancia_activa: null } }, opts
    ),
  };
  const enriquecer = async (documentos) => {
    if (!documentos.length) return [];
    const habIds = [...new Set(documentos.map((a) => a.habitacion_id))];
    const rutIds = [...new Set(documentos.map((a) => a.pasajero_id))];
    const [habs, reps] = await Promise.all([
      col('habitaciones').find({ id: { $in: habIds } }, opts).toArray(),
      col('pasajeros').find({ id: { $in: rutIds } }, opts).toArray(),
    ]);
    const porHab = new Map(habs.map((x) => [x.id, x]));
    const porRep = new Map(reps.map((x) => [x.id, x]));
    return documentos.map((raw) => {
      const a = limpio(raw); const h = porHab.get(a.habitacion_id); const p = porRep.get(a.pasajero_id);
      // El nombre y RUT del responsable se toman del snapshot del check-in (ocupantes_detalle)
      // para que el historial y la boleta no cambien si el pasajero se vuelve a registrar.
      const detalle = (a.ocupantes_detalle || []).find((d) => d && d.es_responsable);
      return { ...a, habitacion_numero: h?.numero, habitacion_tipo: h?.tipo,
        pasajero_nombre: detalle?.nombre_completo ?? p?.nombre_completo,
        pasajero_rut: detalle?.rut ?? p?.rut };
    });
  };
  const asignaciones = {
    crear: (a) => insertar('asignaciones', { ...a, estado: 'ACTIVA', fecha_salida_real: null }),
    porId: async (id) => (await enriquecer(await col('asignaciones').find({ id }, opts).toArray()))[0] || null,
    porGrupo: async (grupoId) => enriquecer(await col('asignaciones').find({ grupo_id: grupoId }, opts).sort({ id: 1 }).toArray()),
    activas: async () => enriquecer(await col('asignaciones').find({ estado: 'ACTIVA' }, opts).sort({ habitacion_id: 1 }).toArray()),
    finalizar: (id, fecha) => col('asignaciones').updateOne({ id, estado: 'ACTIVA' }, { $set: { estado: 'FINALIZADA', fecha_salida_real: fecha } }, opts),
    historial: async ({ habitacionId, rut }) => {
      const filtro = {};
      if (habitacionId) filtro.habitacion_id = habitacionId;
      if (rut) filtro['ocupantes_detalle.rut'] = rut;
      return enriquecer(await col('asignaciones').find(filtro, opts).sort({ creado_en: -1 }).limit(100).toArray());
    },
  };
  const auditoria = {
    registrar: (r) => insertar('auditoria', { fecha: new Date().toISOString(), usuario_id: r.usuarioId ?? null,
      username: r.username ?? null, accion: r.accion, detalle: r.detalle ?? null, ip: r.ip ?? null }),
    listar: async (limite = 200) => listos(await col('auditoria').find({}, opts).sort({ id: -1 }).limit(limite).toArray()),
  };
  return { usuarios, habitaciones, pasajeros, asignaciones, auditoria };
}
module.exports = { crearRepos };
