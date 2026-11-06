import test from 'node:test';
import assert from 'node:assert/strict';
import {orderCubeFiles,normalizeBackground,validBackgroundData} from '../src/background.js';
test('cube images are ordered correctly irrespective of upload order or filename case',()=>{
  const files=['NZ.png','py.jpg','nx.webp','PZ.png','px.png','ny.png'].map(name=>({name}));
  assert.deepEqual(orderCubeFiles(files).map(f=>f.name),['px.png','nx.webp','py.jpg','ny.png','PZ.png','NZ.png']);
  assert.throws(()=>orderCubeFiles(files.slice(1)),/exactly six/);
  assert.throws(()=>orderCubeFiles([...files.slice(0,5),{name:'nx.png'}]),/Cube face names/);
});
test('projects preserve 360 skies and accept legacy flat backgrounds',()=>{
  const data='data:image/png;base64,abcd';
  assert.ok(validBackgroundData(data)); assert.equal(validBackgroundData('https://example.com/image.png'),false);
  assert.equal(normalizeBackground({name:'old',data,visible:true}).legacy,true);
  assert.equal(normalizeBackground({kind:'panorama',name:'sky',data,visible:true}).kind,'panorama');
  assert.equal(normalizeBackground({kind:'cube',faces:Array(6).fill(data)}).kind,'cube');
  assert.throws(()=>normalizeBackground({kind:'cube',faces:Array(5).fill(data)}),/Invalid skybox/);
  assert.throws(()=>normalizeBackground({kind:'other',data}),/Invalid skybox/);
});
