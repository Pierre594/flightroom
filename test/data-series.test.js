import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDataCsv,dataWindow,dataRange} from '../src/data-series.js';

test('data CSV imports multiple numeric columns and preserves gaps',()=>{
  const result=parseDataCsv('\uFEFFtime,Altitude,Speed\n1,2,3\n2,,4\n3,6,5','flight.csv');
  assert.deepEqual(result.times,[1,2,3]);assert.deepEqual(result.columns.map(c=>c.name),['Altitude','Speed']);
  assert.deepEqual(result.columns[0].values,[2,null,6]);assert.deepEqual(result.columns[1].values,[3,4,5]);
});
test('data CSV accepts the older time_s header as well as time',()=>{
  const rows='\n0,1\n1,2';
  assert.deepEqual(parseDataCsv('time_s,value'+rows),parseDataCsv('time,value'+rows));
});
test('data CSV rejects invalid headers, values and non-increasing time',()=>{
  assert.throws(()=>parseDataCsv('timestamp,x\n0,1\n1,2'),/first column/);
  assert.throws(()=>parseDataCsv('time,x\n0,1\n0,2'),/strictly increasing/);
  assert.throws(()=>parseDataCsv('time,x\n0,1\n1,nope'),/invalid value/);
});
test('window is fixed until the chosen threshold, then follows the cursor',()=>{
  assert.deepEqual(dataWindow(5,10,10,.7),{left:5,right:15});
  assert.deepEqual(dataWindow(5,12,10,.7),{left:5,right:15});
  assert.deepEqual(dataWindow(5,15,10,.7),{left:8,right:18});
});
test('window stops at the end so the final sample reaches the right edge',()=>{
  assert.deepEqual(dataWindow(0,2,4,.5,10),{left:0,right:4});
  assert.deepEqual(dataWindow(0,5,4,.5,10),{left:3,right:7});
  assert.deepEqual(dataWindow(0,9,4,.5,10),{left:6,right:10});
  assert.deepEqual(dataWindow(0,10,4,.5,10),{left:6,right:10});
  assert.deepEqual(dataWindow(5,7,10,.7,8),{left:5,right:8});
});
test('automatic vertical range ignores hidden series and gaps',()=>{
  assert.deepEqual(dataRange([{visible:true,values:[0,null,10]},{visible:false,values:[100]}]),{min:-1,max:11});
  assert.deepEqual(dataRange([]),{min:-1,max:1});
});
