import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validDataFigureSize } from './src/data-layout.js';
import {createProjectMiddleware} from './project-storage-server.js';

// Local, token-addressed FFmpeg export. No user-supplied paths or shell commands.
function localMp4Export() {
  const sessions=new Map();
  const clearSession=async(id)=>{
    const session=sessions.get(id);if(!session)return;
    sessions.delete(id);clearTimeout(session.expiry);
    if(session.proc.exitCode===null && !session.proc.killed) { session.proc.stdin.destroy(); session.proc.kill('SIGKILL'); }
    await session.exit;
    await rm(session.directory,{recursive:true,force:true});
  };
  const reply=(res,status,payload)=>{if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}};
  const readBody=async(req,limit)=>{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw new Error('Request is too large.');chunks.push(chunk);}return Buffer.concat(chunks);};
  const middleware=async(req,res,next)=>{
    const path=(req.url??'').split('?')[0];
    if(!path.startsWith('/__flightroom_export/'))return next();
    try {
      if(req.headers['sec-fetch-site']==='cross-site')return reply(res,403,{error:'Cross-origin export is not allowed.'});
      if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return reply(res,403,{error:'Cross-origin export is not allowed.'});
      if(path==='/__flightroom_export/start' && req.method==='POST') {
        const data=JSON.parse((await readBody(req,1024)).toString('utf8'));
        const validSize=data.purpose==='data'?validDataFigureSize(data.width,data.height):[540,720,1080].includes(data.height) && [data.height*16/9,data.height*4/3].includes(data.width);
        if(!validSize || ![15,24,30].includes(data.fps)) return reply(res,400,{error:'Unsupported video dimensions or frame rate.'});
        const frameCodec=data.frameCodec ?? 'png';
        if(!['png','jpeg'].includes(frameCodec)) return reply(res,400,{error:'Unsupported frame format.'});
        const format=data.format ?? 'mp4';
        if(!['mp4','webm-alpha','prores-4444'].includes(format) || (format!=='mp4' && frameCodec!=='png') || (format==='prores-4444' && data.purpose!=='data')) return reply(res,400,{error:'Unsupported video format.'});
        const alpha=format==='webm-alpha',prores=format==='prores-4444';
        const directory=await mkdtemp(join(tmpdir(),'flightroom-export-'));const file=join(directory,prores?'data.mov':alpha?'data.webm':'flight.mp4');const id=randomUUID();
        const encodeArgs=prores?['-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-alpha_bits','16','-vendor','apl0','-tag:v','ap4h']:alpha?['-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-crf','30','-b:v','0','-deadline','realtime','-cpu-used','6']:['-c:v','libx264','-preset',frameCodec==='jpeg'?'superfast':'veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart'];
        const proc=spawn('ffmpeg',['-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(data.fps),'-vcodec',frameCodec==='jpeg'?'mjpeg':'png','-i','pipe:0','-an',...encodeArgs,'-y',file],{stdio:['pipe','ignore','pipe']});
        let stderr='',inputError=null;proc.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});proc.stdin.on('error',e=>{inputError=e;});
        let spawnError=null;proc.on('error',e=>{spawnError=e;});
        const exit=new Promise(resolve=>proc.on('close',code=>resolve({code,error:spawnError,stderr,inputError})));
        const started=await new Promise(resolve=>{proc.once('spawn',()=>resolve(true));proc.once('error',()=>resolve(false));});
        if(!started){await exit;await rm(directory,{recursive:true,force:true});return reply(res,503,{error:'FFmpeg is not available on this computer.'});}
        const filename=prores?'data-animation.mov':alpha?'data-animation.webm':data.filename==='data-animation.mp4'?'data-animation.mp4':'drone-flight.mp4';
        const session={proc,file,directory,exit,done:false,frames:0,expiry:null,filename,contentType:prores?'video/quicktime':alpha?'video/webm':'video/mp4'};sessions.set(id,session);
        session.expiry=setTimeout(()=>void clearSession(id),60*60*1000);session.expiry.unref();
        return reply(res,200,{id});
      }
      const match=/^\/__flightroom_export\/(frame|finish|file|cancel)\/([0-9a-f-]{36})$/.exec(path);
      if(!match)return reply(res,404,{error:'Unknown export request.'});
      const [,action,id]=match,session=sessions.get(id);if(!session)return reply(res,404,{error:'Export session expired.'});
      if(action==='frame' && req.method==='POST') {
        if(session.done || session.proc.exitCode!==null)return reply(res,409,{error:'The encoder is no longer accepting frames.'});
        const bytes=await readBody(req,30*1024*1024);if(!bytes.length)return reply(res,400,{error:'Empty frame.'});
        await new Promise((resolve,reject)=>session.proc.stdin.write(bytes,e=>e?reject(e):resolve()));session.frames++;
        return reply(res,200,{ok:true});
      }
      if(action==='finish' && req.method==='POST') {
        if(session.done || !session.frames)return reply(res,409,{error:'No frames to export.'});
        session.proc.stdin.end();const result=await session.exit;
        if(result.code!==0 || result.error || result.inputError){const reason=(result.stderr || result.error?.message || result.inputError?.message || 'FFmpeg failed.').trim();await clearSession(id);return reply(res,500,{error:reason});}
        session.done=true;return reply(res,200,{url:`/__flightroom_export/file/${id}`});
      }
      if(action==='file' && req.method==='GET') {
        if(!session.done)return reply(res,409,{error:'The video is not ready.'});
        const info=await stat(session.file);res.writeHead(200,{'Content-Type':session.contentType,'Content-Length':info.size,'Content-Disposition':`attachment; filename="${session.filename}"`,'Cache-Control':'no-store'});
        const stream=createReadStream(session.file);stream.on('error',()=>res.destroy());stream.pipe(res);return;
      }
      if(action==='cancel' && req.method==='POST'){await clearSession(id);return reply(res,200,{ok:true});}
      return reply(res,405,{error:'Unsupported export request.'});
    } catch(error){return reply(res,500,{error:error.message||'Local export failed.'});}
  };
  return {name:'flightroom-local-mp4',configureServer(server){server.middlewares.use(middleware);server.httpServer?.once('close',()=>{for(const id of sessions.keys())void clearSession(id);});},configurePreviewServer(server){server.middlewares.use(middleware);server.httpServer?.once('close',()=>{for(const id of sessions.keys())void clearSession(id);});}};
}
function localProjects(){return {name:'flightroom-local-projects',configureServer(server){server.middlewares.use(createProjectMiddleware(server.config.root));},configurePreviewServer(server){server.middlewares.use(createProjectMiddleware(server.config.root));}};}
export default defineConfig({plugins:[localProjects(),localMp4Export()]});
