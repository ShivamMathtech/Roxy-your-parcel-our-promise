import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { db, one, many, run, transaction, notify, audit, event, unpack, projectRoot, demoMode } from './db.mjs';
import { HttpError, fail, CITIES, STATUSES, clean, email, phone, passwordHash, passwordMatches, address, parcel, quote, validPickupDate, transition, now, id } from './domain.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const safeUser = u => ({id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role,email_updates:!!u.email_updates,sms_updates:!!u.sms_updates});
const rateBuckets = new Map();
const limit = (key, maximum=25) => {
  const cutoff = Date.now()-600000;
  const hits = (rateBuckets.get(key)||[]).filter(t=>t>cutoff);
  if(hits.length>=maximum) fail(429,'Too many attempts. Please try again in 10 minutes.');
  hits.push(Date.now()); rateBuckets.set(key,hits);
  if(rateBuckets.size>10000) for(const [k,v] of rateBuckets) if(v.at(-1)<cutoff) rateBuckets.delete(k);
};
const sessionCookie = token => `roxy_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`;
function loginSession(res,user) {
  const token=randomBytes(32).toString('hex');
  run('INSERT INTO sessions VALUES(?,?,?)',digest(token),user.id,Date.now()+7*86400000);
  res.setHeader('Set-Cookie',sessionCookie(token));
  return {user:safeUser(user)};
}
function readUser(req) {
  const cookie=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('roxy_session='));
  if(!cookie) return null;
  const token=cookie.slice(13);
  if(!/^[a-f\d]{64}$/.test(token)) return null;
  return one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',digest(token),Date.now());
}
async function readBody(req) {
  if(!['POST','PATCH','PUT','DELETE'].includes(req.method)) return {};
  if(req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415,'Send JSON with Content-Type: application/json.');
  let data=''; let size=0;
  for await(const chunk of req) { size+=chunk.length; if(size>65536) fail(413,'Request is too large.'); data+=chunk; }
  try { const parsed=JSON.parse(data||'{}'); if(!parsed||Array.isArray(parsed)||typeof parsed!=='object') fail(400,'Expected a JSON object.'); return parsed; } catch(error) { if(error instanceof HttpError) throw error; fail(400,'Invalid JSON request.'); }
}
function checkOrigin(req) {
  if(!['POST','PATCH','PUT','DELETE'].includes(req.method)||!req.headers.origin) return;
  const allowed = new Set([`http://${req.headers.host}`,`https://${req.headers.host}`,process.env.APP_ORIGIN]);
  if(demoMode) ['http://localhost:4173','http://127.0.0.1:4173','http://terminal.local:4173'].forEach(x=>allowed.add(x));
  if(!allowed.has(req.headers.origin)) fail(403,'Request origin is not allowed.');
}
const shipmentSelect='SELECT s.*,c.name courier_name,c.color courier_color FROM shipments s JOIN couriers c ON c.id=s.courier_id';
function shipmentFor(user,shipmentId) {
  const row=one(`${shipmentSelect} WHERE s.id=?`,shipmentId);
  if(!row || (row.user_id!==user.id&&user.role!=='admin')) fail(404,'Parcel not found.');
  return row;
}
function details(row) { return {...unpack(row),events:many('SELECT * FROM events WHERE shipment_id=? ORDER BY created_at,rowid',row.id)}; }
function ticketsFor(user,ticketId) {
  const ticket=one('SELECT t.*,u.name customer_name,u.email customer_email FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?',ticketId);
  if(!ticket||(ticket.user_id!==user.id&&user.role!=='admin')) fail(404,'Conversation not found.');
  return {...ticket,messages:many('SELECT m.*,u.name sender_name,u.role sender_role FROM messages m JOIN users u ON u.id=m.sender_id WHERE ticket_id=? ORDER BY m.created_at,m.rowid',ticketId)};
}
function listShipments(user,url) {
  const where=[]; const args=[];
  if(user.role!=='admin') {where.push('s.user_id=?');args.push(user.id);}
  const status=url.searchParams.get('status');
  if(status&&status!=='all') {if(!STATUSES.includes(status)) fail(400,'Unknown status.');where.push('s.status=?');args.push(status);}
  const search=(url.searchParams.get('q')||'').trim().slice(0,100);
  if(search){where.push('(s.tracking LIKE ? OR s.drop_json LIKE ? OR s.parcel_json LIKE ?)');args.push(...Array(3).fill('%'+search+'%'));}
  const rawPage=Number(url.searchParams.get('page')||1);
  const page=Number.isFinite(rawPage)?Math.max(1,Math.floor(rawPage)):1;
  const size=12;
  const clause=where.length?' WHERE '+where.join(' AND '):'';
  const total=one('SELECT COUNT(*) total FROM shipments s'+clause,...args).total;
  return {items:many(shipmentSelect+clause+' ORDER BY s.created_at DESC,s.rowid DESC LIMIT ? OFFSET ?',...args,size,(page-1)*size).map(unpack),total,page,pages:Math.max(1,Math.ceil(total/size))};
}
function cancelShipment(user,shipmentId) {
  const row=shipmentFor(user,shipmentId); transition(row.status,'cancelled');
  transaction(()=>{
    run("UPDATE shipments SET status='cancelled',payment_status=?,updated_at=? WHERE id=?",row.payment_status==='paid'?'refunded':row.payment_status,now(),row.id);
    event(row.id,'cancelled',JSON.parse(row.pickup_json).city,'Booking cancelled before pickup.');
    notify(row.user_id,'Booking cancelled',`${row.tracking} has been cancelled.`,row.id);audit(user.id,'shipment.cancelled',row.id);
  });
  return details(shipmentFor(user,row.id));
}

async function api(req,res,url) {
  const p=url.pathname; const method=req.method;
  if(p==='/api/health'&&method==='GET') return {ok:true,app:'Roxy',demo_mode:demoMode};
  if(p==='/api/catalog'&&method==='GET') return {cities:CITIES,couriers:many('SELECT * FROM couriers ORDER BY base_paise'),statuses:STATUSES,demo_mode:demoMode};
  checkOrigin(req);
  const body=await readBody(req);
  if(p.startsWith('/api/auth/')&&method==='POST') limit(`${req.socket.remoteAddress}:auth`);
  if(p==='/api/auth/register'&&method==='POST') {
    const name=clean(body.name,'Name',2,80),mail=email(body.email),mobile=phone(body.phone),hash=passwordHash(body.password);
    if(one('SELECT id FROM users WHERE email=?',mail)) fail(409,'An account already exists with that email.');
    const userId=id('usr_');
    run('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',userId,name,mail,mobile,hash,'customer',now());
    notify(userId,'Welcome to Roxy','Your next delivery starts here. Add an address and book your first parcel.');
    res.statusCode=201; return loginSession(res,one('SELECT * FROM users WHERE id=?',userId));
  }
  if(p==='/api/auth/login'&&method==='POST') {
    const user=one('SELECT * FROM users WHERE email=?',email(body.email));
    // Same expensive comparison for unknown accounts, so failures do not expose account existence.
    const valid=passwordMatches(body.password,user?.password_hash||DUMMY_HASH);
    if(!user||!valid) fail(401,'Email or password is incorrect.');
    return loginSession(res,user);
  }
  if(p==='/api/auth/logout'&&method==='POST') {
    const token=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('roxy_session='))?.slice(13);
    if(token) run('DELETE FROM sessions WHERE token_hash=?',digest(token));
    res.setHeader('Set-Cookie','roxy_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');return {ok:true};
  }
  if(p==='/api/auth/forgot'&&method==='POST') {
    if(!demoMode) fail(503,'Email recovery is not configured. Contact your Roxy administrator.');
    const user=one('SELECT * FROM users WHERE email=?',email(body.email));
    const token=randomBytes(32).toString('hex');
    if(user) {run('DELETE FROM password_resets WHERE user_id=?',user.id);run('INSERT INTO password_resets VALUES(?,?,?)',digest(token),user.id,Date.now()+15*60000);}
    // Local demonstration only. A production mail adapter must deliver this privately.
    return {message:'Local demo recovery link created. No email was sent.',demo_reset_token:token};
  }
  if(p==='/api/auth/reset'&&method==='POST') {
    const token=clean(body.token,'Recovery token',64,64);
    const row=one('SELECT * FROM password_resets WHERE token_hash=? AND expires_at>?',digest(token),Date.now());
    if(!row) fail(400,'This recovery link is invalid or has expired.');
    const hash=passwordHash(body.password);
    transaction(()=>{run('UPDATE users SET password_hash=? WHERE id=?',hash,row.user_id);run('DELETE FROM sessions WHERE user_id=?',row.user_id);run('DELETE FROM password_resets WHERE user_id=?',row.user_id);});
    return {ok:true};
  }
  if(p.startsWith('/api/track/')&&method==='GET') {
    limit(`${req.socket.remoteAddress}:track`,100);
    const tracking=decodeURIComponent(p.slice(11)).trim().toUpperCase();
    const row=one(shipmentSelect+' WHERE s.tracking=?',tracking);
    if(!row) fail(404,'Tracking number not found. Check the number and try again.');
    const s=unpack(row);
    // Public response intentionally excludes contact details, street addresses and event notes.
    return {tracking:s.tracking,status:s.status,pickup_city:s.pickup.city,drop_city:s.drop.city,estimated_date:s.estimated_date,courier_name:s.courier_name,events:many('SELECT status,location,created_at FROM events WHERE shipment_id=? ORDER BY created_at,rowid',s.id)};
  }
  const user=readUser(req);
  if(!user) fail(401,'Please sign in to continue.');
  if(p.startsWith('/api/admin/')&&user.role!=='admin') fail(403,'Administrator access is required.');
  if(p==='/api/auth/me'&&method==='GET') return {user:safeUser(user)};
  if(p==='/api/profile'&&method==='PATCH') {run('UPDATE users SET name=?,phone=? WHERE id=?',clean(body.name,'Name',2,80),phone(body.phone),user.id);return {user:safeUser(one('SELECT * FROM users WHERE id=?',user.id))};}
  if(p==='/api/profile/password'&&method==='POST') {
    limit(`${user.id}:password`,10);
    if(!passwordMatches(body.current_password,user.password_hash)) fail(400,'Current password is incorrect.');
    const hash=passwordHash(body.password);
    transaction(()=>{run('UPDATE users SET password_hash=? WHERE id=?',hash,user.id);run('DELETE FROM sessions WHERE user_id=?',user.id);run('DELETE FROM password_resets WHERE user_id=?',user.id);audit(user.id,'password.changed',user.id);});
    return loginSession(res,one('SELECT * FROM users WHERE id=?',user.id));
  }
  if(p==='/api/settings'&&method==='PATCH') {
    if(typeof body.email_updates!=='boolean'||typeof body.sms_updates!=='boolean') fail(400,'Preferences must be true or false.');
    run('UPDATE users SET email_updates=?,sms_updates=? WHERE id=?',Number(body.email_updates),Number(body.sms_updates),user.id);return {user:safeUser(one('SELECT * FROM users WHERE id=?',user.id))};
  }
  if(p==='/api/addresses') {
    if(method==='GET') return {items:many('SELECT * FROM addresses WHERE user_id=? ORDER BY rowid DESC',user.id)};
    if(method==='POST') {
      if(one('SELECT COUNT(*) n FROM addresses WHERE user_id=?',user.id).n>=30) fail(400,'You can save up to 30 addresses.');
      const a=address(body),addressId=id('ad_');
      run('INSERT INTO addresses VALUES(?,?,?,?,?,?,?,?)',addressId,user.id,clean(body.label,'Label',1,40),a.name,a.phone,a.line,a.city,a.pincode);
      res.statusCode=201;return one('SELECT * FROM addresses WHERE id=?',addressId);
    }
  }
  const addr=p.match(/^\/api\/addresses\/([^/]+)$/);
  if(addr) {
    if(!one('SELECT id FROM addresses WHERE id=? AND user_id=?',addr[1],user.id)) fail(404,'Address not found.');
    if(method==='DELETE') {run('DELETE FROM addresses WHERE id=?',addr[1]);return {ok:true};}
    if(method==='PUT') {const a=address(body);run('UPDATE addresses SET label=?,name=?,phone=?,line=?,city=?,pincode=? WHERE id=?',clean(body.label,'Label',1,40),a.name,a.phone,a.line,a.city,a.pincode,addr[1]);return one('SELECT * FROM addresses WHERE id=?',addr[1]);}
  }
  if(p==='/api/quotes'&&method==='POST') return quote(body,one('SELECT * FROM couriers WHERE id=?',body.courier_id||''));
  if(p==='/api/shipments'&&method==='GET') return listShipments(user,url);
  if(p==='/api/shipments'&&method==='POST') {
    const key=clean(body.idempotency_key,'Booking key',10,100);
    const existing=one(shipmentSelect+' WHERE s.user_id=? AND s.idempotency_key=?',user.id,key);
    if(existing) return details(existing);
    const pickup=address(body.pickup),drop=address(body.drop),pack=parcel(body.parcel),pickupDate=validPickupDate(body.pickup_date);
    const q=quote({pickup_city:pickup.city,drop_city:drop.city,parcel:pack},one('SELECT * FROM couriers WHERE id=?',body.courier_id||''));
    if(!['cod','demo'].includes(body.payment_method)) fail(400,'Choose a payment method.');
    if(body.payment_method==='demo'&&!demoMode) fail(400,'Demo payments are disabled.');
    const shipmentId=id('sh_'),tracking='RX'+randomBytes(6).toString('hex').toUpperCase();
    const estimated=new Date(new Date(pickupDate+'T00:00:00Z').getTime()+q.estimated_days*86400000).toISOString().slice(0,10);
    const notes=body.notes?clean(body.notes,'Notes',0,500):'';
    transaction(()=>{run('INSERT INTO shipments VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',shipmentId,tracking,user.id,q.courier_id,JSON.stringify(pickup),JSON.stringify(drop),JSON.stringify(pack),JSON.stringify(q),pickupDate,estimated,'booked',body.payment_method,'pending',notes,q.total_paise,now(),now(),key);event(shipmentId,'booked',pickup.city,'Booking confirmed. Pickup has been scheduled.');notify(user.id,'Your pickup is booked',`${tracking} is ready for pickup on ${pickupDate}.`,shipmentId);audit(user.id,'shipment.created',shipmentId);});
    res.statusCode=201;return details(shipmentFor(user,shipmentId));
  }
  const shipmentRoute=p.match(/^\/api\/shipments\/([^/]+)(?:\/(cancel|demo-payment))?$/);
  if(shipmentRoute) {
    const row=shipmentFor(user,shipmentRoute[1]);
    if(method==='GET'&&!shipmentRoute[2]) return details(row);
    if(method==='POST'&&shipmentRoute[2]==='cancel') return cancelShipment(user,row.id);
    if(method==='POST'&&shipmentRoute[2]==='demo-payment') {
      if(!demoMode||row.payment_method!=='demo'||row.status==='cancelled') fail(409,'Demo payment is unavailable for this parcel.');
      if(row.payment_status==='pending') transaction(()=>{run("UPDATE shipments SET payment_status='paid',updated_at=? WHERE id=?",now(),row.id);notify(row.user_id,'Demo payment complete',`Test payment recorded for ${row.tracking}. No money was charged.`,row.id);audit(user.id,'payment.demo',row.id);});
      return details(shipmentFor(user,row.id));
    }
  }
  if(p==='/api/dashboard'&&method==='GET') {
    const clause=user.role==='admin'?'':' WHERE user_id=?',args=user.role==='admin'?[]:[user.id];
    const rows=many('SELECT status,COUNT(*) count FROM shipments'+clause+' GROUP BY status',...args);
    const byStatus=Object.fromEntries(rows.map(r=>[r.status,r.count]));
    const money=one("SELECT COALESCE(SUM(total_paise),0) total FROM shipments"+clause+(clause?' AND':' WHERE')+" payment_status='paid' AND status!='cancelled'",...args).total;
    return {stats:{total:rows.reduce((n,r)=>n+r.count,0),active:(byStatus.booked||0)+(byStatus.picked_up||0)+(byStatus.in_transit||0)+(byStatus.out_for_delivery||0),delivered:byStatus.delivered||0,spent_paise:money},by_status:byStatus,shipments:listShipments(user,new URL('http://localhost/api/shipments')).items.slice(0,5),notifications:many('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 5',user.id)};
  }
  if(p==='/api/notifications'&&method==='GET') return {items:many('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100',user.id)};
  if(p==='/api/notifications/read'&&method==='POST') {run('UPDATE notifications SET read=1 WHERE user_id=?',user.id);return {ok:true};}
  if(p==='/api/tickets') {
    if(method==='GET') return {items:many('SELECT t.*,u.name customer_name,(SELECT body FROM messages WHERE ticket_id=t.id ORDER BY created_at DESC,rowid DESC LIMIT 1) last_message FROM tickets t JOIN users u ON u.id=t.user_id'+(user.role==='admin'?'':' WHERE t.user_id=?')+' ORDER BY t.updated_at DESC',...(user.role==='admin'?[]:[user.id]))};
    if(method==='POST') {const subject=clean(body.subject,'Subject',3,120),message=clean(body.message,'Message',2,3000),ticketId=id('tk_');transaction(()=>{run('INSERT INTO tickets VALUES(?,?,?,?,?,?)',ticketId,user.id,subject,'open',now(),now());run('INSERT INTO messages VALUES(?,?,?,?,?)',id('msg_'),ticketId,user.id,message,now());});res.statusCode=201;return ticketsFor(user,ticketId);}
  }
  const ticketRoute=p.match(/^\/api\/tickets\/([^/]+)(?:\/(messages))?$/);
  if(ticketRoute) {
    const ticket=ticketsFor(user,ticketRoute[1]);
    if(method==='GET') return ticket;
    if(method==='POST'&&ticketRoute[2]==='messages') {
      if(ticket.status==='closed') fail(409,'This conversation is closed. Start a new conversation.');
      const message=clean(body.message,'Message',1,3000);
      transaction(()=>{run('INSERT INTO messages VALUES(?,?,?,?,?)',id('msg_'),ticket.id,user.id,message,now());run('UPDATE tickets SET updated_at=? WHERE id=?',now(),ticket.id);if(user.role==='admin') notify(ticket.user_id,'A reply from Roxy',`New message in “${ticket.subject}”.`);});
      return ticketsFor(user,ticket.id);
    }
    if(method==='PATCH'&&user.role==='admin') {if(!['open','closed'].includes(body.status)) fail(400,'Unknown conversation status.');run('UPDATE tickets SET status=?,updated_at=? WHERE id=?',body.status,now(),ticket.id);return ticketsFor(user,ticket.id);}
  }
  const adminShipment=p.match(/^\/api\/admin\/shipments\/([^/]+)$/);
  if(adminShipment&&method==='PATCH') {
    const row=shipmentFor(user,adminShipment[1]);
    if(body.status==='cancelled') return cancelShipment(user,row.id);
    transition(row.status,body.status);
    if(row.payment_method==='demo'&&row.payment_status!=='paid') fail(409,'Complete the demo payment before pickup.');
    if(body.status==='delivered'&&row.payment_method==='cod'&&body.cod_collected!==true) fail(400,'Confirm collection of the delivery fee before completing delivery.');
    const location=clean(body.location,'Event city',2,60);
    if(!CITIES.includes(location)) fail(400,'Choose a supported event city.');
    const note=clean(body.note,'Delivery note',3,500);
    transaction(()=>{run('UPDATE shipments SET status=?,updated_at=?,payment_status=? WHERE id=?',body.status,now(),body.status==='delivered'?'paid':row.payment_status,row.id);event(row.id,body.status,location,note);notify(row.user_id,'Delivery update',`${row.tracking}: ${body.status.replaceAll('_',' ')}.`,row.id);audit(user.id,'shipment.'+body.status,row.id);});
    return details(shipmentFor(user,row.id));
  }
  if(p==='/api/admin/overview'&&method==='GET') return {customers:many("SELECT id,name,email,phone,created_at,(SELECT COUNT(*) FROM shipments s WHERE s.user_id=u.id) shipments FROM users u WHERE role='customer' ORDER BY created_at DESC"),audit:many('SELECT a.*,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 100'),couriers:many('SELECT * FROM couriers ORDER BY base_paise')};
  fail(404,'API endpoint not found.');
}

const DUMMY_HASH=passwordHash('unused-dummy-password');
const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json'};
const dist=resolve(projectRoot,'dist');
export const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
      const result=await api(req,res,url);res.end(JSON.stringify(result));return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD') fail(405,'Method not allowed.');
    const requested=resolve(dist,'.'+decodeURIComponent(url.pathname));
    if(requested!==dist&&!requested.startsWith(dist+sep)) fail(403,'Forbidden.');
    let file=existsSync(requested)&&statSync(requested).isFile()?requested:resolve(dist,'index.html');
    if(!existsSync(file)) fail(503,'Frontend build is missing. Run npm install and npm run build.');
    res.setHeader('Content-Type',mimes[extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control',file.includes(sep+'assets'+sep)?'public, max-age=31536000, immutable':'no-cache');
    res.end(req.method==='HEAD'?undefined:readFileSync(file));
  } catch(error) {
    res.statusCode=error instanceof HttpError?error.status:500;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({error:error instanceof HttpError?error.message:'An unexpected error occurred. Please try again.'}));
    if(!(error instanceof HttpError)) console.error('Request failed:',error.message);
  }
});
server.requestTimeout=15000;server.headersTimeout=10000;
const port=Number(process.env.PORT||4000),host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`Roxy is running at http://${host}:${server.address().port} (${demoMode?'local demo':'production'} mode)`));
const cleanup=setInterval(()=>{run('DELETE FROM sessions WHERE expires_at<?',Date.now());run('DELETE FROM password_resets WHERE expires_at<?',Date.now());},3600000);cleanup.unref();
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{clearInterval(cleanup);server.close(()=>{db.close();process.exit(0);});});
