import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { followPose, followRelativeView, followWorldView, validFollow } from '../src/follow-camera.js';

const row=(time,x,y,z,yaw,roll=0,pitch=0)=>({time,x_m:x,y_m:y,z_m:z,yaw_rad:yaw,roll_rad:roll,pitch_rad:pitch});
const flight={start:0,end:2,rows:[row(0,0,0,0,0),row(2,2,1,1,Math.PI/2,1,.5)]};
const close=(a,b)=>assert.ok(a.every((n,i)=>Math.abs(n-b[i])<1e-9),`${a} != ${b}`);

test('follow view preserves camera framing at capture, then follows translation and yaw',()=>{
  const view={position:[-2,1,0],target:[0,0,0],zoom:1,projection:'perspective'};
  const relative=followRelativeView(view,followPose(flight,0));
  close(followWorldView(relative,followPose(flight,0)).position,view.position);
  const end=followWorldView(relative,followPose(flight,2));
  close(end.position,[2,2,1]);close(end.target,[2,1,-1]);
  assert.equal(end.zoom,1);
  const middle=followPose(flight,1);close(middle.position.toArray(),[1,.5,-.5]);assert.ok(Math.abs(middle.heading-Math.PI/4)<1e-9);
  close(followWorldView(relative,followPose(flight,99)).position,end.position);
});

test('yaw interpolation crosses the ±π boundary without reversing the camera',()=>{
  const f={start:0,end:1,rows:[row(0,0,0,0,179*Math.PI/180),row(1,0,0,0,-179*Math.PI/180)]};
  assert.ok(Math.abs(followPose(f,.5).heading-Math.PI)<1e-9);
});

test('saved follow views require an existing flight and a usable camera',()=>{
  const ids=new Set(['a']),view={position:[1,2,3],target:[0,0,0],zoom:1,projection:'perspective'};
  assert.ok(validFollow(null,ids));assert.ok(validFollow({flightId:'a',view},ids));
  assert.equal(validFollow({flightId:'missing',view},ids),false);
  assert.equal(validFollow({flightId:'a',view:{...view,position:view.target}},ids),false);
  assert.equal(validFollow({flightId:'a',view:{...view,zoom:NaN}},ids),false);
});
