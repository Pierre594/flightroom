import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {preparePropellers,collectPropellers} from '../src/propellers.js';
import {batchRigidOnshapeMeshes} from '../src/batch-model.js';

test('batching preserves transformed surfaces and leaves transparent and mirrored parts alone',()=>{
  const root=new THREE.Group(),rigid=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.5});
  const a=new THREE.Mesh(new THREE.BoxGeometry(),rigid),b=new THREE.Mesh(new THREE.BoxGeometry(),rigid);
  a.position.set(1,2,3);b.position.set(-1,.5,2);b.rotation.y=.4;
  const clear=new THREE.Mesh(new THREE.BoxGeometry(),glass),mirrored=new THREE.Mesh(new THREE.BoxGeometry(),rigid);mirrored.scale.x=-1;
  root.add(a,b,clear,mirrored);root.updateMatrixWorld(true);
  const points=[a,b].map(mesh=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0).applyMatrix4(mesh.matrixWorld));
  assert.equal(batchRigidOnshapeMeshes({scene:root,asset:{generator:'ONSHAPE BY PTC INC, 1.0'},animations:[]}),2);
  const batch=root.children.find(o=>o.name==='Combined rigid model parts');assert.ok(batch);assert.equal(batch.material,rigid);
  const pos=batch.geometry.attributes.position;const output=[new THREE.Vector3().fromBufferAttribute(pos,0),new THREE.Vector3().fromBufferAttribute(pos,a.geometry.attributes.position.count)];
  assert.ok(output.every((p,i)=>p.distanceTo(points[i])<1e-6));assert.ok(root.children.includes(clear));assert.ok(root.children.includes(mirrored));
});

test('other exporters and animated models are left unchanged',()=>{
  const scene=new THREE.Group(),mat=new THREE.MeshBasicMaterial();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),mat),new THREE.Mesh(new THREE.BoxGeometry(),mat));
  assert.equal(batchRigidOnshapeMeshes({scene,asset:{generator:'Other exporter'},animations:[]}),0);
  assert.equal(batchRigidOnshapeMeshes({scene,asset:{generator:'ONSHAPE BY PTC INC'},animations:[{}]}),0);
  assert.equal(scene.children.length,2);
});

test('the example drone keeps four independent propeller pivots while reducing mesh count',async()=>{
  globalThis.ProgressEvent ??= class { constructor(type,init={}) { this.type=type; Object.assign(this,init); } };
  const data=await readFile(new URL('../models/example/Drone1.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  assert.equal(preparePropellers(gltf.scene),4);
  assert.ok(batchRigidOnshapeMeshes(gltf)>4000);
  let meshes=0;gltf.scene.traverse(o=>{if(o.isMesh)meshes++;});
  assert.ok(meshes<50);const propellers=collectPropellers(gltf.scene);assert.equal(propellers.length,4);
  assert.ok(propellers.every(p=>p.node.children.some(child=>child.isMesh)));
});
