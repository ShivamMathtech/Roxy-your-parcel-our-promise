import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'roxy-production-'));
const env={...process.env,PORT:'0',HOST:'127.0.0.1',DB_PATH:join(temp,'fresh.sqlite'),DEMO_MODE:'false',COOKIE_SECURE:'true',APP_ORIGIN:'https://roxy.example.test'};
let child,base,cookie;
const credentials={name:'Test Administrator',email:'admin@example.test',phone:'+91 90000 00000',password:'ProductionTest@123'};
before(async()=>{
 const created=spawnSync(process.execPath,['scripts/create-admin.mjs','--json-stdin'],{cwd:root,env,input:JSON.stringify(credentials),encoding:'utf8'});assert.equal(created.status,0,created.stderr);
 child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Production test server startup timeout')),15000);child.stdout.on('data',data=>{const m=data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Server exited during startup'));});});
 const login=await call('/auth/login','POST',{email:credentials.email,password:credentials.password});cookie=login.cookie;
});
after(async()=>{if(child?.exitCode===null){const end=once(child,'exit');child.kill('SIGTERM');await end;}rmSync(temp,{recursive:true,force:true});});
async function call(path,method='GET',body){const response=await fetch(base+'/api'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};}
test('production startup creates no demo accounts; CLI admin can sign in with secure cookie',async()=>{
 assert.equal((await call('/health')).data.demo_mode,false);
 assert(cookie.includes('HttpOnly'));assert(cookie.includes('Secure'));assert(cookie.includes('SameSite=Strict'));
 assert.equal((await call('/auth/me')).data.user.role,'admin');
 assert.equal((await call('/auth/login','POST',{email:'hello@roxy.demo',password:'RoxyDemo@123'})).status,401);
 assert.equal((await call('/admin/overview')).data.customers.length,0);
 const duplicate=spawnSync(process.execPath,['scripts/create-admin.mjs','--json-stdin'],{cwd:root,env,input:JSON.stringify(credentials),encoding:'utf8'});assert.equal(duplicate.status,1);
});
test('production mode does not expose demo recovery or simulated payments',async()=>{
 assert.equal((await call('/auth/forgot','POST',{email:credentials.email})).status,503);
 const address={name:'Test Person',phone:'+91 90000 00000',line:'12 Example Lane',city:'Delhi',pincode:'110001'};
 const booking={pickup:address,drop:address,parcel:{type:'document',description:'Test documents',weight:.5,length:20,width:10,height:1},pickup_date:new Date().toISOString().slice(0,10),courier_id:'roxy-standard',payment_method:'demo',idempotency_key:crypto.randomUUID()};
 assert.equal((await call('/shipments','POST',booking)).status,400);
 booking.payment_method='cod';const cod=await call('/shipments','POST',booking);assert.equal(cod.status,201);assert.equal(cod.data.payment_status,'pending');
});
