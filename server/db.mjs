import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { passwordHash, now, id, quote } from './domain.mjs';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const databasePath = process.env.DB_PATH || resolve(projectRoot, 'data', 'roxy.sqlite');
export const demoMode = process.env.DEMO_MODE !== 'false';
if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('customer','admin')),email_updates INTEGER NOT NULL DEFAULT 1,sms_updates INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS addresses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),label TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,line TEXT NOT NULL,city TEXT NOT NULL,pincode TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS couriers(id TEXT PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT NOT NULL,base_paise INTEGER NOT NULL,kg_paise INTEGER NOT NULL,days INTEGER NOT NULL,color TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shipments(id TEXT PRIMARY KEY,tracking TEXT UNIQUE NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),courier_id TEXT NOT NULL REFERENCES couriers(id),pickup_json TEXT NOT NULL,drop_json TEXT NOT NULL,parcel_json TEXT NOT NULL,quote_json TEXT NOT NULL,pickup_date TEXT NOT NULL,estimated_date TEXT NOT NULL,status TEXT NOT NULL,payment_method TEXT NOT NULL,payment_status TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',total_paise INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,idempotency_key TEXT NOT NULL,UNIQUE(user_id,idempotency_key));
CREATE INDEX IF NOT EXISTS shipments_owner ON shipments(user_id,created_at);
CREATE INDEX IF NOT EXISTS shipments_status ON shipments(status);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,shipment_id TEXT NOT NULL REFERENCES shipments(id),status TEXT NOT NULL,location TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_shipment ON events(shipment_id,created_at);
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,shipment_id TEXT,read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),subject TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES tickets(id),sender_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,entity_id TEXT NOT NULL,created_at TEXT NOT NULL);
INSERT OR IGNORE INTO schema_migrations VALUES(1,datetime('now'));
`);
export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const many = (sql, ...args) => db.prepare(sql).all(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
export function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } }
export function notify(userId, title, body, shipmentId = null) { run('INSERT INTO notifications VALUES(?,?,?,?,?,0,?)', id('nt_'), userId, title, body, shipmentId, now()); }
export function audit(userId, action, entityId) { run('INSERT INTO audit_log VALUES(?,?,?,?,?)', id('au_'), userId, action, entityId, now()); }
export function event(shipmentId, status, location, note, timestamp = now()) { run('INSERT INTO events VALUES(?,?,?,?,?,?)', id('ev_'), shipmentId, status, location, note, timestamp); }
export function unpack(row) {
  if (!row) return null;
  const {pickup_json, drop_json, parcel_json, quote_json, idempotency_key, ...rest} = row;
  return {...rest, pickup:JSON.parse(pickup_json), drop:JSON.parse(drop_json), parcel:JSON.parse(parcel_json), quote:JSON.parse(quote_json)};
}
for (const c of [ ['roxy-standard','Roxy Standard','Everyday value, handled with care',5900,2200,4,'blue'], ['roxy-express','Roxy Express','A little faster. Just as thoughtful.',9900,3500,2,'red'], ['roxy-priority','Roxy Priority','Our fastest door-to-door service',14900,4900,1,'purple'] ]) run('INSERT OR IGNORE INTO couriers VALUES(?,?,?,?,?,?,?)', ...c);

if (demoMode && !one("SELECT id FROM users WHERE email='hello@roxy.demo'")) transaction(() => {
  const userId = 'demo_customer';
  const created = now();
  run('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)', userId, 'Shivam Singh', 'hello@roxy.demo', '+91 98765 43210', passwordHash('RoxyDemo@123'), 'customer', created);
  if (!one("SELECT id FROM users WHERE email='admin@roxy.demo'")) run('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)', 'demo_admin', 'Roxy Operations', 'admin@roxy.demo', '+91 98765 40000', passwordHash('RoxyAdmin@123'), 'admin', created);
  const pickup = {name:'Shivam Singh',phone:'+91 98765 43210',line:'24, Rajpur Road, near Clock Tower',city:'Dehradun',pincode:'248001'};
  run('INSERT INTO addresses VALUES(?,?,?,?,?,?,?,?)', 'addr_demo_home', userId, 'Home', ...Object.values(pickup));
  run('INSERT INTO addresses VALUES(?,?,?,?,?,?,?,?)', 'addr_demo_work', userId, 'Studio', 'Shivam Singh', '+91 98765 43210', '12, Connaught Place, Block A', 'Delhi', '110001');
  const data = [ ['RX10482026','in_transit','Delhi','Aarav Sharma','parcel','Design samples',1.5,'roxy-express',1], ['RX10472026','out_for_delivery','Mumbai','Priya Mehta','fragile','Ceramic planter',2,'roxy-priority',2], ['RX10462026','booked','Bengaluru','Rohan Kapoor','document','Project documents',0.5,'roxy-standard',0], ['RX10452026','delivered','Jaipur','Ananya Rao','parcel','A little birthday surprise',1,'roxy-express',5], ['RX10442026','delivered','Delhi','Kabir Verma','document','Signed paperwork',0.5,'roxy-priority',6], ['RX10432026','cancelled','Pune','Neha Joshi','parcel','Notebook collection',1,'roxy-standard',7] ];
  for (const [tracking,status,city,name,type,description,weight,courierId,age] of data) {
    const shipmentId = id('sh_');
    const parcel = {type,description,weight,length:20,width:15,height:10};
    const q = quote({pickup_city:pickup.city,drop_city:city,parcel},one('SELECT * FROM couriers WHERE id=?',courierId));
    const date = new Date(Date.now()-age*86400000).toISOString();
    const drop = {name,phone:'+91 98765 56789',line:'17, Park Avenue, near City Centre',city,pincode: city==='Mumbai'?'400001':city==='Bengaluru'?'560001':city==='Jaipur'?'302001':city==='Pune'?'411001':'110001'};
    const eta = new Date(new Date(date).getTime()+q.estimated_days*86400000).toISOString().slice(0,10);
    run('INSERT INTO shipments VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',shipmentId,tracking,userId,courierId,JSON.stringify(pickup),JSON.stringify(drop),JSON.stringify(parcel),JSON.stringify(q),date.slice(0,10),eta,status,'cod',status==='delivered'?'paid':'pending','',q.total_paise,date,date,tracking);
    const states = ['booked','picked_up','in_transit','out_for_delivery','delivered'];
    const reached = status === 'cancelled' ? ['booked','cancelled'] : states.slice(0,states.indexOf(status)+1);
    reached.forEach((s,i) => event(shipmentId,s,i>2?city:pickup.city,(s==='cancelled'?'Booking cancelled before pickup.':['Booking confirmed. Pickup has been scheduled.','Parcel collected by our delivery partner.','Your parcel is travelling through our network.','Your delivery partner is on the way.','Parcel handed over to the recipient.'][i] || 'Booking cancelled.'), new Date(new Date(date).getTime()+i*7200000).toISOString()));
    if (status==='in_transit') notify(userId,'Your parcel is on its way',`${tracking} is in transit to ${city}.`,shipmentId);
  }
  const ticketId = 'tk_demo';
  run('INSERT INTO tickets VALUES(?,?,?,?,?,?)', ticketId, userId, 'Can I change my pickup time?', 'open', created, created);
  run('INSERT INTO messages VALUES(?,?,?,?,?)',id('msg_'),ticketId,userId,'Hi! Can I request an afternoon pickup for my document parcel?',created);
  run('INSERT INTO messages VALUES(?,?,?,?,?)',id('msg_'),ticketId,'demo_admin','Hi Shivam! Please share your tracking number here and we can add an afternoon pickup request to the booking.',created);
});
