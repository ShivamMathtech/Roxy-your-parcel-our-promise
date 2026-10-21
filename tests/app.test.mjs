import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {quote,transition,HttpError,validPickupDate} from '../server/domain.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'roxy-test-'));
let child,base,customer,admin,other,parcelId,tracking;
const pack={type:'parcel',description:'Integration test parcel',weight:1,length:20,width:15,height:10};
const origin={name:'Test Customer',phone:'+91 90000 00001',line:'12 Test Street',city:'Dehradun',pincode:'248001'};
const destination={name:'Test Recipient',phone:'+91 90000 00002',line:'34 Sample Road',city:'Delhi',pincode:'110001'};
const booking=(extra={})=>({pickup:origin,drop:destination,parcel:pack,pickup_date:new Date().toISOString().slice(0,10),courier_id:'roxy-express',payment_method:'cod',idempotency_key:crypto.randomUUID(),...extra});
async function start(){
  child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:'0',HOST:'127.0.0.1',DEMO_MODE:'true',DB_PATH:join(temp,'app.sqlite')},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',d=>stderr+=d);
  base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server did not start: '+stderr)),15000);child.stdout.on('data',d=>{const match=d.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exit '+code+': '+stderr));});});
}
async function stop(){if(child?.exitCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await ended;}}
async function request(path,method='GET',body,cookie,headers={}){const res=await fetch(base+'/api'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};}
before(async()=>{await start();customer=(await request('/auth/login','POST',{email:'hello@roxy.demo',password:'RoxyDemo@123'})).cookie;admin=(await request('/auth/login','POST',{email:'admin@roxy.demo',password:'RoxyAdmin@123'})).cookie;other=(await request('/auth/register','POST',{name:'Other Customer',email:'other@test.example',phone:'+91 90000 00003',password:'StrongPass@123',role:'admin'})).cookie;});
after(async()=>{await stop();rmSync(temp,{recursive:true,force:true});});

test('health, catalog, security headers, and authorization',async()=>{
  assert.equal((await request('/health')).body.ok,true);
  assert.equal((await request('/catalog')).body.couriers.length,3);
  assert.equal((await request('/shipments')).status,401);
  const r=await request('/auth/me','GET',null,other);assert.equal(r.body.user.role,'customer');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await request('/admin/overview','GET',null,other)).status,403);
  assert.equal((await request('/auth/login','POST',{email:'hello@roxy.demo',password:'wrong'})).status,401);
  assert.equal((await request('/auth/me','GET',null,'roxy_session=invalid')).status,401);
});
test('quote arithmetic, billable weight and lifecycle validation',()=>{
  const courier={id:'express',base_paise:9900,kg_paise:3500,days:2};
  const q=quote({pickup_city:'Delhi',drop_city:'Mumbai',parcel:pack},courier);
  assert.equal(q.total_paise,25252);assert.equal(q.billable_weight,1);
  const bulk=quote({pickup_city:'Delhi',drop_city:'Delhi',parcel:{...pack,length:50,width:40,height:30}},courier);assert.equal(bulk.volumetric_weight,12);assert.equal(bulk.billable_weight,12);assert.equal(bulk.route_paise,0);
  assert.throws(()=>transition('booked','delivered'),HttpError);assert.throws(()=>transition('cancelled','booked'),HttpError);assert.throws(()=>validPickupDate('2026-99-99'),HttpError);
});
test('booking recalculates fee, records events and is idempotent',async()=>{
  const input=booking({total_paise:1,status:'delivered'});const created=await request('/shipments','POST',input,other);
  assert.equal(created.status,201);assert.equal(created.body.total_paise,25252);assert.equal(created.body.status,'booked');assert.equal(created.body.events.length,1);parcelId=created.body.id;tracking=created.body.tracking;
  const retry=await request('/shipments','POST',input,other);assert.equal(retry.body.id,parcelId);
  assert.equal((await request('/shipments','GET',null,other)).body.total,1);
  assert.equal((await request('/shipments/'+parcelId,'GET',null,customer)).status,404);
});
test('public tracking excludes street addresses, names, phones and notes',async()=>{
  const r=await request('/track/'+tracking);assert.equal(r.status,200);assert.equal(r.body.pickup_city,'Dehradun');
  const text=JSON.stringify(r.body);assert(!text.includes('Test Customer'));assert(!text.includes('90000'));assert(!text.includes('Test Street'));assert(!text.includes('note'));
  assert.equal((await request('/track/NOTFOUND')).status,404);
});
test('admin delivery lifecycle, COD confirmation and notifications',async()=>{
  const patch=body=>request('/admin/shipments/'+parcelId,'PATCH',{location:'Delhi',note:'Integration test event',...body},admin);
  assert.equal((await patch({status:'delivered',cod_collected:true})).status,409);
  for(const status of ['picked_up','in_transit','out_for_delivery'])assert.equal((await patch({status})).status,200);
  assert.equal((await request('/shipments/'+parcelId+'/cancel','POST',{},other)).status,409);
  assert.equal((await patch({status:'delivered'})).status,400);
  const done=await patch({status:'delivered',cod_collected:true});assert.equal(done.body.status,'delivered');assert.equal(done.body.payment_status,'paid');assert.equal(done.body.events.length,5);
  const notes=await request('/notifications','GET',null,other);assert(notes.body.items.some(n=>n.body.includes(tracking)));
  await request('/notifications/read','POST',{},other);assert((await request('/notifications','GET',null,other)).body.items.every(n=>n.read===1));
});
test('demo payment is idempotent and cancelling reverses its test record',async()=>{
  const s=(await request('/shipments','POST',booking({payment_method:'demo'}),other)).body;
  assert.equal((await request('/admin/shipments/'+s.id,'PATCH',{status:'picked_up',location:'Delhi',note:'Collected'},admin)).status,409);
  for(let i=0;i<2;i++)assert.equal((await request('/shipments/'+s.id+'/demo-payment','POST',{},other)).body.payment_status,'paid');
  const cancelled=(await request('/shipments/'+s.id+'/cancel','POST',{},other)).body;assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.payment_status,'refunded');
  assert.equal((await request('/shipments/'+s.id+'/demo-payment','POST',{},other)).status,409);
});
test('server rejects invalid parcel, address, date and request origin',async()=>{
  for(const input of [booking({parcel:{...pack,weight:-2}}),booking({pickup:{...origin,pincode:'000000'}}),booking({courier_id:'fake'}),booking({pickup_date:'2000-01-01'}),booking({drop:{...destination,city:'Not served'}}),booking({payment_method:'card'})])assert.equal((await request('/shipments','POST',input,other)).status,400);
  const blocked=await request('/shipments','POST',booking(),other,{Origin:'https://untrusted.example'});assert.equal(blocked.status,403);
  const response=await fetch(base+'/api/shipments',{method:'POST',headers:{Cookie:other,'Content-Type':'text/plain'},body:'{}'});assert.equal(response.status,415);
});
test('address CRUD protects ownership and preserves historic booking addresses',async()=>{
  const a=await request('/addresses','POST',{...origin,label:'Test address'},other);assert.equal(a.status,201);
  assert.equal((await request('/addresses/'+a.body.id,'PUT',{...origin,label:'Stolen'},customer)).status,404);
  assert.equal((await request('/addresses/'+a.body.id,'DELETE',{},customer)).status,404);
  assert.equal((await request('/addresses/'+a.body.id,'PUT',{...origin,label:'Updated'},other)).body.label,'Updated');
  assert.equal((await request('/addresses/'+a.body.id,'DELETE',{},other)).status,200);
  assert.equal((await request('/shipments/'+parcelId,'GET',null,other)).body.pickup.line,origin.line);
});
test('support conversation is private, supports admin replies and closes correctly',async()=>{
  const ticket=(await request('/tickets','POST',{subject:'Test request',message:'Can you help with my pickup?'},other)).body;
  assert.equal((await request('/tickets/'+ticket.id,'GET',null,customer)).status,404);
  const reply=await request('/tickets/'+ticket.id+'/messages','POST',{message:'Yes, here is an administrator reply.'},admin);assert.equal(reply.body.messages.length,2);assert.equal(reply.body.messages[1].sender_role,'admin');
  assert.equal((await request('/tickets/'+ticket.id,'PATCH',{status:'closed'},admin)).body.status,'closed');
  assert.equal((await request('/tickets/'+ticket.id+'/messages','POST',{message:'Another message'},other)).status,409);
  assert.equal((await request('/tickets/'+ticket.id,'PATCH',{status:'open'},admin)).body.status,'open');
});
test('profile and preferences persist without exposing password hashes',async()=>{
  const p=await request('/profile','PATCH',{name:'Updated Customer',phone:'+91 90000 00004'},other);assert.equal(p.body.user.name,'Updated Customer');assert(!JSON.stringify(p.body).includes('password'));
  const prefs=await request('/settings','PATCH',{email_updates:false,sms_updates:true},other);assert.equal(prefs.body.user.sms_updates,true);
  assert.equal((await request('/settings','PATCH',{email_updates:'false',sms_updates:true},other)).status,400);
});
test('filtering, search, dashboard and admin audit reflect saved records',async()=>{
  const filtered=await request('/shipments?status=delivered&q='+tracking,'GET',null,other);assert.equal(filtered.body.total,1);
  assert.equal((await request('/shipments?status=bogus','GET',null,other)).status,400);
  const dash=(await request('/dashboard','GET',null,other)).body;assert.equal(dash.stats.delivered,1);assert.equal(dash.stats.spent_paise,25252);
  const overview=(await request('/admin/overview','GET',null,admin)).body;assert(overview.audit.some(a=>a.entity_id===parcelId));
});
test('password change requires current password and revokes older sessions',async()=>{
  assert.equal((await request('/profile/password','POST',{current_password:'wrong',password:'NewStrongPass@123'},other)).status,400);
  const changed=await request('/profile/password','POST',{current_password:'StrongPass@123',password:'NewStrongPass@123'},other);assert.equal(changed.status,200);
  assert.equal((await request('/auth/me','GET',null,other)).status,401);other=changed.cookie;
  assert.equal((await request('/auth/me','GET',null,other)).status,200);
});
test('demo password recovery uses one-time tokens and revokes sessions',async()=>{
  const forgot=await request('/auth/forgot','POST',{email:'other@test.example'});const token=forgot.body.demo_reset_token;assert.equal(token.length,64);
  assert.equal((await request('/auth/reset','POST',{token,password:'RecoveredPass@123'})).status,200);
  assert.equal((await request('/auth/me','GET',null,other)).status,401);
  assert.equal((await request('/auth/reset','POST',{token,password:'BadReusePass@123'})).status,400);
  const login=await request('/auth/login','POST',{email:'OTHER@TEST.EXAMPLE',password:'RecoveredPass@123'});assert.equal(login.status,200);other=login.cookie;
});
test('database survives server restart and logout revokes session',async()=>{
  await stop();await start();assert(existsSync(join(temp,'app.sqlite')));
  assert.equal((await request('/shipments/'+parcelId,'GET',null,other)).body.tracking,tracking);
  assert.equal((await request('/auth/logout','POST',{},other)).status,200);
  assert.equal((await request('/auth/me','GET',null,other)).status,401);
});
