import test from 'node:test';
import assert from 'node:assert/strict';
import {validAnnotations,annotationVisible,annotationScenePosition} from '../src/annotations.js';
const label={id:'1',text:'Drone zone',x:1,y:2,z:3,start:2,end:4};
test('text annotations are visible only during their inclusive time interval',()=>{
  assert.equal(annotationVisible(label,1.9),false);assert.equal(annotationVisible(label,2),true);assert.equal(annotationVisible(label,4),true);assert.equal(annotationVisible(label,4.1),false);
});
test('project annotation data requires meaningful text, finite coordinates and valid times',()=>{
  assert.equal(validAnnotations([label]),true);assert.equal(validAnnotations([]),true);
  assert.equal(validAnnotations([{...label,text:' '}]),false);assert.equal(validAnnotations([{...label,z:Infinity}]),false);assert.equal(validAnnotations([{...label,start:5,end:2}]),false);assert.equal(validAnnotations([label,label]),false);
});

test('text size and CSV attachment are validated while legacy labels stay valid',()=>{
  assert.equal(validAnnotations([{...label,size:2,flightId:'drone-1'}]),true);
  assert.equal(validAnnotations([{...label,size:0}]),false);
  assert.equal(validAnnotations([{...label,size:21}]),false);
  assert.equal(validAnnotations([{...label,flightId:''}]),false);
});


test('attached labels follow the selected flight with a world-axis offset',()=>{
  const fixed={...label,flightId:null};
  assert.deepEqual(annotationScenePosition(fixed),[1,3,-2]);
  const attached={...label,flightId:'flight'};
  assert.deepEqual(annotationScenePosition(attached,{x:10,y:20,z:30}),[11,23,28]);
  assert.deepEqual(annotationScenePosition(attached,{x:11,y:22,z:33}),[12,25,31]);
  assert.equal(annotationScenePosition(attached,null),null);
});
