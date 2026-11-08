import test from 'node:test';
import assert from 'node:assert/strict';
import {dataRange,dataWindow,visibleSubplotRange} from '../src/data-series.js';
import {quantizeRange,buildScaleProfile,quantizedSubplotRange} from '../src/data-scaling.js';

test('limits round outward to steps, including negative and fractional values',()=>{
  assert.deepEqual(quantizeRange({min:-1.2,max:2.3},.5),{min:-1.5,max:2.5});
  const exact=quantizeRange({min:-.3,max:.3},.1);
  assert.ok(Math.abs(exact.min+.3)<1e-12&&Math.abs(exact.max-.3)<1e-12);
  assert.deepEqual(quantizeRange({min:-1e-12,max:1e-12},1),{min:-1,max:1});
});

test('smooth quantized limits settle on levels and always include the visible data and margin',()=>{
  const series=[{visible:true,times:[0,1,2,3,4,5,6],values:[0,0,0,2,2,2,2]}],plot={yMargin:10,yStep:1,yRangeMode:'auto'},full=dataRange(series,.1);
  const profile=buildScaleProfile(series,plot,0,6,1,.7,full),at=time=>{const window=dataWindow(0,time,1,.7,6);return {range:quantizedSubplotRange(series,plot,window,time,full,profile),required:visibleSubplotRange(series,plot,window,time,full)};};
  assert.deepEqual(at(0).range,{min:-1,max:2});assert.deepEqual(at(5).range,{min:0,max:3});
  const middle=at(2.5).range;assert.ok(middle.max>2&&middle.max<3);
  for(let i=0;i<=600;i++){const {range,required}=at(i/100);assert.ok(range.min<=required.min+1e-10&&range.max>=required.max-1e-10);}
  assert.deepEqual(at(2.5),at(2.5));
  assert.deepEqual(quantizedSubplotRange(series,{...plot,yRangeMode:'manual',yMin:-2,yMax:5},{left:0,right:1},0,full,null),{min:-2,max:5});
});

test('a narrow peak does not cause an abrupt contraction when it leaves the window',()=>{
  const series=[{visible:true,times:[0,1.9,2,2.1,4],values:[0,0,8,0,0]}],plot={yMargin:10,yStep:.5,yRangeMode:'auto'},full=dataRange(series,.1),profile=buildScaleProfile(series,plot,0,4,.5,.7,full);
  let previous=null;
  for(let i=0;i<=400;i++){const time=i/100,window=dataWindow(0,time,.5,.7,4),range=quantizedSubplotRange(series,plot,window,time,full,profile),required=visibleSubplotRange(series,plot,window,time,full);
    assert.ok(range.min<=required.min+1e-10&&range.max>=required.max-1e-10);
    if(previous)assert.ok(Math.abs(range.max-previous.max)<.4,`abrupt change at ${time}`);previous=range;
  }
});

test('changing step size changes settled quantized levels',()=>{
  const series=[{visible:true,times:[0,1],values:[1,1]}],full=dataRange(series,.1),window={left:0,right:1};
  const a={yMargin:10,yRangeMode:'auto',yStep:1},b={...a,yStep:.5};
  assert.deepEqual(quantizedSubplotRange(series,a,window,1,full,buildScaleProfile(series,a,0,1,1,.7,full)),{min:-1,max:3});
  assert.deepEqual(quantizedSubplotRange(series,b,window,1,full,buildScaleProfile(series,b,0,1,1,.7,full)),{min:-.5,max:2.5});
});
