import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {flightOrientation} from '../src/orientation.js';
function expectVector(v,expected){assert.ok(v.distanceTo(new THREE.Vector3(...expected))<1e-10);}
test('a π/2 radian yaw rotates flight X toward flight Y',()=>{
  const rotation=flightOrientation({roll_rad:0,pitch_rad:0,yaw_rad:Math.PI/2});
  expectVector(new THREE.Vector3(1,0,0).applyQuaternion(rotation),[0,0,-1]);
});
test('a π/2 radian roll rotates flight Y toward flight Z',()=>{
  const rotation=flightOrientation({roll_rad:Math.PI/2,pitch_rad:0,yaw_rad:0});
  expectVector(new THREE.Vector3(0,0,-1).applyQuaternion(rotation),[0,1,0]);
});
