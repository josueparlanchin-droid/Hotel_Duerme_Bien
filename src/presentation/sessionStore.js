'use strict';
// Almacén de sesiones persistentes en MongoDB, con índice TTL en la colección sesiones.
const session = require('express-session');
class MongoSessionStore extends session.Store {
  constructor(db, idleMs) { super(); this.col = db.collection('sesiones'); this.idleMs = idleMs; }
  expire(sess) { return new Date(sess?.cookie?.expires || Date.now() + this.idleMs); }
  get(sid, cb) {
    this.col.findOne({ sid, expire: { $gt: new Date() } })
      .then((r) => cb(null, r ? JSON.parse(r.sess) : null)).catch(cb);
  }
  set(sid, sess, cb) {
    this.col.updateOne({ sid }, { $set: { sess: JSON.stringify(sess), expire: this.expire(sess) } }, { upsert: true })
      .then(() => cb?.(null)).catch((e) => cb?.(e));
  }
  touch(sid, sess, cb) {
    this.col.updateOne({ sid }, { $set: { expire: this.expire(sess) } })
      .then(() => cb?.(null)).catch((e) => cb?.(e));
  }
  destroy(sid, cb) { this.col.deleteOne({ sid }).then(() => cb?.(null)).catch((e) => cb?.(e)); }
}
module.exports = { MongoSessionStore };
