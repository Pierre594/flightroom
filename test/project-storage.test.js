import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable,Writable} from 'node:stream';
import {createProjectMiddleware} from '../project-storage-server.js';
import {normalizeProjectName} from '../src/project-names.js';

async function request(middleware,method,url,body='',headers={}){
  const req=Readable.from(body?[Buffer.from(body)]:[]);Object.assign(req,{method,url,headers:{host:'localhost',...headers}});
  const chunks=[],res=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
  res.headersSent=false;res.writeHead=(status,headers)=>{res.statusCode=status;res.headers=headers;res.headersSent=true;};
  const finished=new Promise((resolve,reject)=>{res.once('finish',resolve);res.once('error',reject);});
  await middleware(req,res,()=>{res.writeHead(404,{});res.end();});await finished;
  return {status:res.statusCode,body:Buffer.concat(chunks).toString('utf8'),headers:res.headers};
}

test('project names are safe file names and keep spaces and Unicode',()=>{
  assert.equal(normalizeProjectName('  Vol été.json  '),'Vol été');
  for(const value of ['', '..','../secret','x/y','x\\y','a:b','bad\u0000name'])assert.throws(()=>normalizeProjectName(value));
});

test('named projects save atomically, overwrite, list and reopen',async()=>{
  const root=await mkdtemp(join(tmpdir(),'flightroom-project-test-'));
  try{
    const middleware=createProjectMiddleware(root),url='/__flightroom_projects/save?name=Flight%20one';
    let response=await request(middleware,'POST',url,JSON.stringify({type:'flightroom-3d',version:1,content:'first'}));assert.equal(response.status,200);
    response=await request(middleware,'POST',url,JSON.stringify({type:'flightroom-data',version:1,content:'second'}));assert.equal(response.status,200);
    assert.equal(JSON.parse(await readFile(join(root,'projects','Flight one.json'),'utf8')).content,'second');
    response=await request(middleware,'POST',url,'not json');assert.equal(response.status,400);
    assert.equal(JSON.parse(await readFile(join(root,'projects','Flight one.json'),'utf8')).content,'second');
    assert.deepEqual(await readdir(join(root,'projects')),['Flight one.json']);
    response=await request(middleware,'GET','/__flightroom_projects/list');assert.deepEqual(JSON.parse(response.body).projects,[{name:'Flight one',type:'flightroom-data'}]);
    response=await request(middleware,'GET','/__flightroom_projects/open?name=Flight%20one');assert.equal(JSON.parse(response.body).content,'second');
    response=await request(middleware,'POST','/__flightroom_projects/save?name=..%2Fescape',JSON.stringify({type:'flightroom-3d',version:1}));assert.equal(response.status,400);
    response=await request(middleware,'GET','/__flightroom_projects/list','',{'sec-fetch-site':'cross-site'});assert.equal(response.status,403);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('project storage refuses a symlinked projects directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'flightroom-project-test-')),other=await mkdtemp(join(tmpdir(),'flightroom-project-other-'));
  try{await symlink(other,join(root,'projects'),'dir');const response=await request(createProjectMiddleware(root),'POST','/__flightroom_projects/save?name=flight',JSON.stringify({type:'flightroom-3d',version:1}));assert.equal(response.status,500);assert.deepEqual(await readdir(other),[]);}
  finally{await rm(root,{recursive:true,force:true});await rm(other,{recursive:true,force:true});}
});
