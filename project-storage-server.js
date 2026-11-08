import {randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,mkdir,open,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizeProjectName} from './src/project-names.js';

const MAX_PROJECT_BYTES=512*1024*1024;
const reply=(res,status,body)=>{if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}};

export function createProjectMiddleware(root) {
  const directory=join(root,'projects');
  async function ensureDirectory(){await mkdir(directory,{recursive:true});const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('The projects folder must be a local directory.');}
  async function readBody(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_PROJECT_BYTES)throw new Error('Project exceeds the 512 MB size limit.');chunks.push(chunk);}return Buffer.concat(chunks);}
  return async(req,res,next)=>{
    const url=new URL(req.url??'/', 'http://localhost');if(!url.pathname.startsWith('/__flightroom_projects/'))return next();
    try{
      if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))return reply(res,403,{error:'Cross-origin project access is not allowed.'});
      await ensureDirectory();
      if(url.pathname==='/__flightroom_projects/list'&&req.method==='GET'){
        const entries=await readdir(directory,{withFileTypes:true}),projects=[];
        for(const entry of entries){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;let name;try{name=normalizeProjectName(entry.name);}catch{continue;}
          const file=await open(join(directory,entry.name),'r');let prefix;try{const buffer=Buffer.alloc(2048),result=await file.read(buffer,0,buffer.length,0);prefix=buffer.toString('utf8',0,result.bytesRead);}finally{await file.close();}
          const match=/"type"\s*:\s*"(flightroom-data|flightroom-3d)"/.exec(prefix);projects.push({name,type:match?.[1]??'unknown'});
        }
        projects.sort((a,b)=>a.name.localeCompare(b.name));return reply(res,200,{projects});
      }
      if(!['/__flightroom_projects/save','/__flightroom_projects/open'].includes(url.pathname))return reply(res,404,{error:'Unknown project request.'});
      let name;try{name=normalizeProjectName(url.searchParams.get('name'));}catch(error){return reply(res,400,{error:error.message});}const path=join(directory,`${name}.json`);
      if(url.pathname.endsWith('/save')&&req.method==='POST'){
        const bytes=await readBody(req);let project;try{project=JSON.parse(bytes.toString('utf8'));}catch{return reply(res,400,{error:'Project must contain valid JSON.'});}
        if(!project||!['flightroom-3d','flightroom-data'].includes(project.type)||project.version!==1)return reply(res,400,{error:'Invalid project type.'});
        const temp=join(directory,`.flightroom-${randomUUID()}.tmp`);try{await writeFile(temp,bytes,{flag:'wx'});await rename(temp,path);}finally{await rm(temp,{force:true});}
        return reply(res,200,{name,filename:`${name}.json`});
      }
      if(url.pathname.endsWith('/open')&&req.method==='GET'){
        let info;try{info=await lstat(path);}catch(error){if(error.code==='ENOENT')return reply(res,404,{error:'Project not found.'});throw error;}
        if(!info.isFile()||info.isSymbolicLink())return reply(res,404,{error:'Project not found.'});
        res.writeHead(200,{'Content-Type':'application/json','Content-Length':info.size,'Cache-Control':'no-store'});const stream=createReadStream(path);stream.on('error',()=>res.destroy());stream.pipe(res);return;
      }
      return reply(res,405,{error:'Unsupported project request.'});
    }catch(error){return reply(res,500,{error:error.message||'Local project storage failed.'});}
  };
}
