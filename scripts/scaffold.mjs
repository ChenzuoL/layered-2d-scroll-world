#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),slug=args[0],title=args[1];
const rootFlag=args.indexOf('--root'),root=path.resolve(rootFlag>=0?args[rootFlag+1]:process.cwd());
const noInit=args.includes('--no-init');
if(!slug||!title){console.error('Usage: scaffold.mjs <slug> "<title>" [--root <world-root>] [--no-init]');process.exit(2);}
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){console.error('Slug must be lowercase kebab-case.');process.exit(2);}
const here=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(here,'../templates/starter');
const relative=`works/webs/${slug}`,destination=path.join(root,relative);
if(fs.existsSync(destination)){console.error('Destination already exists: '+destination);process.exit(1);}
let initialized=false;
try{
 if(!noInit){
  const init=spawnSync('node',['/mods/neta/neta','work','init','web',relative,'--title',title],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(init.status!==0)throw new Error((init.stderr||init.stdout||'work init failed').trim());
  initialized=true;
 }
 fs.mkdirSync(destination,{recursive:true});fs.cpSync(source,destination,{recursive:true});
 const configPath=path.join(destination,'config/world.json'),config=JSON.parse(fs.readFileSync(configPath));config.title=title;fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
 fs.writeFileSync(path.join(destination,'starter-source.json'),JSON.stringify({schema:'layered-2d-scroll-world-starter/v1',skill:'layered-2d-scroll-world',createdAt:new Date().toISOString()},null,2)+'\n');
 const validate=spawnSync('node',[path.join(here,'validate-scene-contract.mjs'),configPath],{encoding:'utf8'});
 if(validate.status!==0)throw new Error(validate.stdout||validate.stderr);
 console.log(JSON.stringify({ok:true,workRef:relative,source:destination,config:path.join(relative,'config/world.json'),run:`python3 -m http.server 8080 --directory ${relative}`,publish:`node /mods/neta/neta work publish web ${relative}`},null,2));
}catch(error){
 if(initialized)spawnSync('node',['/mods/neta/neta','work','fail','web',relative,'--error','Starter scaffold failed'],{cwd:root,stdio:'ignore'});
 if(fs.existsSync(destination)&&!initialized)fs.rmSync(destination,{recursive:true,force:true});
 console.error(error.message);process.exit(1);
}
