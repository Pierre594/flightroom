import test from 'node:test';
import assert from 'node:assert/strict';
import { modelIdsFromAssets, readModelAssignment } from '../src/model-assignments.js';

test('older projects use the default model and unit scale', () => {
  assert.deepEqual(readModelAssignment({}, modelIdsFromAssets([])), {modelId:'default',modelScale:1});
});
test('distinct models and scales remain assigned to their flights', () => {
  const models=modelIdsFromAssets([{id:'a',data:'data:model/gltf-binary;base64,AAA'},{id:'b',data:'data:model/gltf-binary;base64,BBB'}]);
  assert.deepEqual(readModelAssignment({modelId:'a',modelScale:1.5},models),{modelId:'a',modelScale:1.5});
  assert.deepEqual(readModelAssignment({modelId:'b',modelScale:.25},models),{modelId:'b',modelScale:.25});
});
test('invalid references, duplicate IDs and invalid scales are rejected', () => {
  assert.throws(()=>modelIdsFromAssets([{id:'default',data:'data:model/gltf-binary;base64,A'}]),/Invalid model assets/);
  assert.throws(()=>modelIdsFromAssets([{id:'a',data:'data:model/gltf-binary;base64,A'},{id:'a',data:'data:model/gltf-binary;base64,B'}]),/Invalid model assets/);
  assert.throws(()=>readModelAssignment({modelId:'missing'},modelIdsFromAssets([])),/Invalid drone model/);
  assert.throws(()=>readModelAssignment({modelScale:0},modelIdsFromAssets([])),/Invalid drone model/);
});
