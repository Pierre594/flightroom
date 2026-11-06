import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { correctOnshapeColors } from '../src/materials.js';

function asset(generator, material) {
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(geometry, material));
  scene.add(new THREE.Mesh(geometry, material));
  return {asset: {generator}, scene};
}
function material() {
  const m = new THREE.MeshStandardMaterial({transparent:true, opacity:0.3});
  m.name='0.400000_0.500000_0.600000_0.000000_0.000000';
  m.color.setRGB(.4,.5,.6,THREE.LinearSRGBColorSpace);
  return m;
}
test('Onshape flat color factors are corrected once while opacity is preserved', () => {
  const m=material();
  assert.equal(correctOnshapeColors(asset('ONSHAPE BY PTC INC, 1.222',m)),1);
  assert.ok(Math.abs(m.color.r-0.132868)<1e-5);
  assert.equal(m.opacity,.3); assert.equal(m.transparent,true);
});
test('other exporters and unrelated material names are not altered', () => {
  const m=material(); assert.equal(correctOnshapeColors(asset('another exporter',m)),0); assert.equal(m.color.r,.4);
  m.name='paint'; assert.equal(correctOnshapeColors(asset('ONSHAPE BY PTC INC',m)),0); assert.equal(m.color.r,.4);
});
test('textured materials and mismatched factors are not altered', () => {
  const m=material(); m.map=new THREE.Texture(); assert.equal(correctOnshapeColors(asset('ONSHAPE BY PTC INC',m)),0);
  m.map=null; m.color.r=.8; assert.equal(correctOnshapeColors(asset('ONSHAPE BY PTC INC',m)),0);
});
