import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve,dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const backend=spawn(process.execPath,['--env-file-if-exists=.env','server/index.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,PORT:'4000',HOST:'127.0.0.1'}});
const vite=await createServer({root});await vite.listen();vite.printUrls();
let closing=false;
async function close(){if(closing)return;closing=true;backend.kill();await vite.close();process.exit();}
backend.on('exit',code=>{if(!closing){console.error('Backend stopped:',code);close();}});
process.on('SIGINT',close);process.on('SIGTERM',close);
