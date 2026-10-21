import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
// Admin creation never enables demo seeding, regardless of the selected environment.
process.env.DEMO_MODE='false';
const {db,one,run}=await import('../server/db.mjs');
const {clean,email,phone,passwordHash,now,id}=await import('../server/domain.mjs');
let input;
try {
  if(process.argv.includes('--json-stdin')) {
    let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>5000)throw new Error('Input too large.');}input=JSON.parse(text);
  } else {
    if(!process.stdin.isTTY)throw new Error('Use an interactive terminal, or --json-stdin with a JSON object on stdin.');
    let hidden=false;
    const output=new Writable({write(chunk,encoding,callback){if(!hidden)process.stdout.write(chunk,encoding);callback();}});
    const io=createInterface({input:process.stdin,output,terminal:true});
    try {
      const name=await io.question('Admin name: '),mail=await io.question('Admin email: '),mobile=await io.question('Admin phone: ');
      process.stdout.write('Password (hidden; 10+ characters): ');hidden=true;const password=await io.question('');hidden=false;process.stdout.write('\n');
      process.stdout.write('Confirm password (hidden): ');hidden=true;const confirm=await io.question('');hidden=false;process.stdout.write('\n');
      if(password!==confirm)throw new Error('Passwords do not match.');input={name,email:mail,phone:mobile,password};
    } finally {hidden=false;io.close();}
  }
  const mail=email(input.email);
  if(one('SELECT id FROM users WHERE email=?',mail))throw new Error('That email already exists. No account was changed.');
  run('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',id('usr_'),clean(input.name,'Name',2,80),mail,phone(input.phone),passwordHash(input.password),'admin',now());
  console.log('Administrator created. You can now sign in.');
} catch(error) {console.error(error.message);process.exitCode=1;} finally {db.close();}
