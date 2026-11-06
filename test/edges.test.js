import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addModelEdges } from '../src/edges.js';
import { addShadowCaster } from '../src/shadows.js';

test('propeller edges and shadows follow the same pivot as their surfaces',()=>{
  const model=new THREE.Group(), pivot=new THREE.Group();
  pivot.position.set(2,1,0); pivot.userData.propellerSpin={axis:[0,1,0],direction:1};
  const body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
  const blade=new THREE.Mesh(new THREE.BoxGeometry(2,.2,.3),new THREE.MeshStandardMaterial());
  blade.position.x=1; model.add(body,pivot); pivot.add(blade); model.updateMatrixWorld(true);
  const sourceGeometry=new THREE.EdgesGeometry(blade.geometry,20);
  const sourcePoint=new THREE.Vector3().fromBufferAttribute(sourceGeometry.getAttribute('position'),0);
  sourceGeometry.dispose();
  addModelEdges(model,false); addShadowCaster(model);
  const staticEdges=model.children.find(child=>child.userData.droneEdges);
  const edges=pivot.children.find(child=>child.userData.droneEdges);
  const shadow=pivot.children.find(child=>child.userData.droneShadowCaster);
  assert.ok(staticEdges && edges && shadow); assert.equal(edges.visible,false);
  const edgePoint=new THREE.Vector3().fromBufferAttribute(edges.geometry.getAttribute('position'),0);
  for (const angle of [0,Math.PI/2]) {
    pivot.rotation.y=angle; model.updateMatrixWorld(true);
    const expected=blade.localToWorld(sourcePoint.clone());
    const actual=edges.localToWorld(edgePoint.clone());
    assert.ok(actual.distanceTo(expected)<1e-6);
    const sourceVertex=new THREE.Vector3().fromBufferAttribute(blade.geometry.getAttribute('position'),0);
    const shadowVertex=new THREE.Vector3().fromBufferAttribute(shadow.geometry.getAttribute('position'),0);
    assert.ok(blade.localToWorld(sourceVertex).distanceTo(shadow.localToWorld(shadowVertex))<1e-6);
  }
  const clone=model.clone(true), clonePivot=clone.children.find(child=>child.userData.propellerSpin);
  assert.ok(clonePivot.children.some(child=>child.userData.droneEdges));
  assert.ok(clonePivot.children.some(child=>child.userData.droneShadowCaster));
});
