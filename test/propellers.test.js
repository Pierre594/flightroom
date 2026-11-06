import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { preparePropellers, collectPropellers, updatePropellers } from '../src/propellers.js';
import { addPropellerBlur } from '../src/propeller-blur.js';

test('the supplied drone spins its four blades around the motor shafts without moving the original parts', async()=>{
  globalThis.ProgressEvent ??= class { constructor(type,init={}) { this.type=type; Object.assign(this,init); } };
  const data=await readFile(new URL('../Drone.glb',import.meta.url));
  const scene=(await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
  scene.updateMatrixWorld(true);
  const blades=[],motors=[];
  scene.traverse(node=>{
    if (/^occurrence_of_Gemfan5146/.test(node.name)) blades.push({node,matrix:node.matrixWorld.clone()});
    if (/^occurrence_of_iFlight_XING2/.test(node.name)) motors.push(node.getWorldPosition(new THREE.Vector3()));
  });
  assert.equal(preparePropellers(scene),4);
  scene.updateMatrixWorld(true);
  for (const {node,matrix} of blades) assert.ok(node.matrixWorld.elements.every((v,i)=>Math.abs(v-matrix.elements[i])<1e-6));
  addPropellerBlur(scene);
  const instance=scene.clone(true), propellers=collectPropellers(instance);
  assert.equal(propellers.length,4);
  assert.ok(propellers.every(p=>p.blur.length===3 && p.blur.every(ghost=>!ghost.visible)));
  assert.deepEqual(propellers.map(p=>p.direction).sort(),[-1,-1,1,1]);
  instance.updateMatrixWorld(true);
  for(const p of propellers) {
    const shaft=p.node.getWorldPosition(new THREE.Vector3());
    assert.ok(motors.some(m=>Math.hypot(m.x-shaft.x,m.z-shaft.z)<1e-6));
  }
  updatePropellers(propellers,.25,60,true);
  for (const p of propellers) assert.ok(Math.abs(p.node.quaternion.angleTo(p.base)-Math.PI/2)<1e-6);
  assert.ok(propellers.every(p=>p.blur.every(ghost=>ghost.visible)));
  assert.ok(propellers.every(p=>p.blur[0].quaternion.angleTo(p.blur[1].quaternion)>0));
  updatePropellers(propellers,.25,127,true);
  assert.ok(propellers.every(p=>p.blur.at(-1).quaternion.angleTo(new THREE.Quaternion())>.45));
  updatePropellers(propellers,.25,60,true,false);
  assert.ok(propellers.every(p=>p.blur.every(ghost=>!ghost.visible)));
  updatePropellers(propellers,.25,0,true,true);
  assert.ok(propellers.every(p=>p.blur.every(ghost=>!ghost.visible)));
  updatePropellers(propellers,.25,60,false);
  for (const p of propellers) assert.ok(p.node.quaternion.angleTo(p.base)<1e-6);
  assert.ok(collectPropellers(scene).every(p=>p.node.quaternion.angleTo(p.base)<1e-6));
});

test('unrecognized models remain unchanged',()=>{
  const model=new THREE.Group();model.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
  assert.equal(preparePropellers(model),0);
  addPropellerBlur(model);
  assert.equal(collectPropellers(model).length,0);
});
