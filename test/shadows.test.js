import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addShadowCaster, fitShadowLight } from '../src/shadows.js';

test('static meshes are combined into one invisible caster in model coordinates', () => {
  const model=new THREE.Group();
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
  mesh.position.set(3,2,1); model.add(mesh);
  const caster=addShadowCaster(model);
  assert.ok(caster.castShadow); assert.equal(caster.material.colorWrite,false); assert.equal(mesh.castShadow,false);
  caster.geometry.computeBoundingBox();
  assert.deepEqual(caster.geometry.boundingBox.min.toArray(),[2.5,1.5,.5]);
  assert.deepEqual(caster.geometry.boundingBox.max.toArray(),[3.5,2.5,1.5]);
  const clone=model.clone(true); assert.ok(clone.getObjectByName('Drone shadow caster').castShadow);
});

test('transparent meshes retain their own material-dependent shadow caster', () => {
  const model=new THREE.Group(); const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({transparent:true,opacity:.5})); model.add(mesh);
  assert.equal(addShadowCaster(model),null); assert.equal(mesh.castShadow,true);
});

test('directional light fits distant flight paths and remains pointed at them', () => {
  const light=new THREE.DirectionalLight();
  const flights=[{rows:[{x_m:100,y_m:10,z_m:20},{x_m:102,y_m:13,z_m:1}]}];
  fitShadowLight(light,flights,1);
  const direction=light.position.clone().sub(light.target.position).normalize();
  assert.ok(direction.distanceTo(new THREE.Vector3(4,8,5).normalize())<1e-9);
  assert.ok(light.shadow.camera.right>=2); assert.ok(light.shadow.camera.far>light.shadow.camera.near);
});
