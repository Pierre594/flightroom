import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cableCurve, makeCableMesh } from '../src/cables.js';
const lengthOf = points => points.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(points[i]),0);
test('slack cable has the requested length, endpoints and sag',()=>{
  const a=new THREE.Vector3(0,2,0),b=new THREE.Vector3(1,2,0);
  const result=cableCurve(a,b,1.5,512);
  assert.ok(!result.impossible); assert.ok(result.points[0].equals(a)); assert.ok(result.points.at(-1).equals(b));
  assert.ok(result.points[256].y<2); assert.ok(Math.abs(lengthOf(result.points)-1.5)<.0001);
});
test('unequal heights and vertical cables preserve the requested length',()=>{
  const a=new THREE.Vector3(0,1,0),b=new THREE.Vector3(1,2,1);
  const c=cableCurve(a,b,2.5,512); assert.ok(Math.abs(lengthOf(c.points)-2.5)<.0001); assert.ok(c.points.at(-1).equals(b));
  const v=cableCurve(a,new THREE.Vector3(0,2,0),3,512); assert.ok(Math.abs(lengthOf(v.points)-3)<.01); assert.ok(Math.min(...v.points.map(p=>p.y))<1);
});
test('a cable shorter than the separation is straight and flagged',()=>{
  const c=cableCurve(new THREE.Vector3(0,0,0),new THREE.Vector3(2,0,0),1);
  assert.ok(c.impossible); assert.equal(c.distance,2); assert.ok(Math.abs(lengthOf(c.points)-2)<1e-10);
});
test('cable diameter changes the mesh thickness without changing its centerline',()=>{
  const points=cableCurve(new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0),1).points;
  const cable=makeCableMesh();
  cable.update(points,false,.012);
  const position=cable.mesh.geometry.getAttribute('position');
  assert.ok(Math.abs(Math.hypot(position.getY(0),position.getZ(0))-.006)<1e-7);
  cable.update(points,false,.04);
  assert.ok(Math.abs(Math.hypot(position.getY(0),position.getZ(0))-.02)<1e-7);
  assert.equal(position.getX(0),0);
  cable.dispose();
});
