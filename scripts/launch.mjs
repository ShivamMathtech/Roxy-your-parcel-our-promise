import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(Number(process.versions.node.split('.')[0])!==24){console.error('Roxy needs Node.js 24.x. Install Node.js 24, then run START-WINDOWS.bat again.');process.exit(1);}
if(!existsSync(resolve(root,'dist','index.html'))){console.error('The frontend build is missing. Run SETUP-WINDOWS.bat first.');process.exit(1);}
const child=spawn(process.execPath,['--env-file-if-exists=.env','server/index.mjs'],{cwd:root,env:process.env,stdio:['inherit','pipe','inherit']});
let opened=false;
child.stdout.on('data',data=>{process.stdout.write(data);const match=data.toString().match(/http:\/\/[^\s)]+/);if(match&&!opened){opened=true;let url=match[0].replace('0.0.0.0','localhost');if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url))return;const command=process.platform==='win32'?'explorer':process.platform==='darwin'?'open':'xdg-open';const opener=spawn(command,[url],{stdio:'ignore',detached:true});opener.on('error',()=>{});opener.unref();}});
child.on('exit',code=>{process.exitCode=code||0;});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
