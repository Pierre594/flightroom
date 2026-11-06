import test from 'node:test';
import assert from 'node:assert/strict';
import {figureLayout,dataTextVisible,annotationPosition,validDataFigureSize,movePlotGroup,movePlotWithinGroup,insertPlotRelative} from '../src/data-layout.js';

test('subplots arrange vertically or horizontally and respect their size settings',()=>{
  const plots=[{id:'a',width:100,height:100},{id:'b',width:50,height:50}];
  const vertical=figureLayout(1280,720,plots,'vertical');
  assert.ok(vertical[0].cell.y+vertical[0].cell.height<vertical[1].cell.y);
  assert.ok(vertical[0].cell.height>vertical[1].cell.height);
  assert.ok(vertical[0].cell.width>vertical[1].cell.width);
  const horizontal=figureLayout(1280,720,plots,'horizontal');
  assert.ok(horizontal[0].cell.x+horizontal[0].cell.width<horizontal[1].cell.x);
  assert.ok(horizontal[0].cell.width>horizontal[1].cell.width);
  assert.ok(horizontal[0].cell.height>horizontal[1].cell.height);
  const half=figureLayout(1280,720,[{id:'a',width:50,height:50}],'vertical');
  const full=figureLayout(1280,720,[{id:'a',width:100,height:100}],'vertical');
  assert.ok(Math.abs(half[0].cell.width/full[0].cell.width-.5)<1e-9);
  assert.ok(Math.abs(half[0].cell.height/full[0].cell.height-.5)<1e-9);
});
test('grouped rows allow one full-width plot above two side-by-side plots',()=>{
  const plots=[{id:'top',width:100,height:100,group:1},{id:'bottom1',width:100,height:100,group:2},{id:'bottom2',width:100,height:100,group:2}];
  const [top,left,right]=figureLayout(1280,720,plots,'rows').map(x=>x.cell);
  assert.ok(top.y+top.height<left.y);assert.equal(left.y,right.y);
  assert.ok(left.x+left.width<right.x);assert.ok(Math.abs(top.width-(left.width+right.width+16))<1e-9);
  const reordered=figureLayout(1280,720,[plots[2],plots[0],plots[1]],'rows');
  assert.deepEqual(reordered.map(p=>p.id),['bottom2','top','bottom1']);
  assert.ok(reordered[1].cell.y<reordered[0].cell.y);
});
test('grouped columns allow a full-height plot beside stacked plots',()=>{
  const plots=[{id:'left',width:100,height:100,group:1},{id:'top',width:100,height:100,group:2},{id:'bottom',width:100,height:100,group:2}];
  const [left,top,bottom]=figureLayout(1280,720,plots,'columns').map(x=>x.cell);
  assert.ok(left.x+left.width<top.x);assert.equal(top.x,bottom.x);
  assert.ok(top.y+top.height<bottom.y);assert.ok(Math.abs(left.height-(top.height+bottom.height+16))<1e-9);
});
test('moving grouped plots swaps complete rows or columns and preserves their internal order',()=>{
  const plots=[{id:'top',group:3,width:100,height:100},{id:'left',group:8,width:100,height:100},{id:'right',group:8,width:100,height:100}];
  const moved=movePlotGroup(plots,8,-1);
  assert.deepEqual(moved.map(p=>p.id),['left','right','top']);
  const [left,right,top]=figureLayout(1280,720,moved,'rows').map(p=>p.cell);
  assert.equal(left.y,right.y);assert.ok(left.y<top.y);assert.ok(left.x<right.x);
  assert.deepEqual(movePlotGroup(moved,3,-1),moved);
  const swapped=movePlotWithinGroup(moved,'right',-1);
  assert.deepEqual(swapped.map(p=>p.id),['right','left','top']);
  const columns=figureLayout(1280,720,swapped,'columns').map(p=>p.cell);
  assert.equal(columns[0].x,columns[1].x);assert.ok(columns[0].y<columns[1].y);assert.ok(columns[1].x<columns[2].x);
});
test('adding beside or below builds grouped layouts next to the selected plot',()=>{
  const plot=id=>({id,width:100,height:100,group:1});
  let result=insertPlotRelative([plot('top')],'vertical','top','below',plot('left'));
  result=insertPlotRelative(result.plots,result.layout,'left','beside',plot('right'));
  assert.equal(result.layout,'rows');assert.deepEqual(result.plots.map(p=>p.group),[1,2,2]);
  const [top,left,right]=figureLayout(1280,720,result.plots,result.layout).map(p=>p.cell);
  assert.ok(top.y<left.y);assert.equal(left.y,right.y);assert.ok(left.x<right.x);
  result=insertPlotRelative([plot('left')],'horizontal','left','beside',plot('top'));
  result=insertPlotRelative(result.plots,result.layout,'top','below',plot('bottom'));
  assert.equal(result.layout,'columns');assert.deepEqual(result.plots.map(p=>p.group),[1,2,2]);
  const [column,upper,lower]=figureLayout(1280,720,result.plots,result.layout).map(p=>p.cell);
  assert.ok(column.x<upper.x);assert.equal(upper.x,lower.x);assert.ok(upper.y<lower.y);
});
test('fixed subplot text uses inclusive times and blank bounds cover the full timeline',()=>{
  assert.ok(dataTextVisible({start:null,end:null},-100));
  assert.equal(dataTextVisible({start:2,end:4},1.99),false);
  assert.equal(dataTextVisible({start:2,end:4},2),true);
  assert.equal(dataTextVisible({start:2,end:4},4),true);
  assert.equal(dataTextVisible({start:2,end:4},4.01),false);
});
test('time-anchored annotations appear at the offset time and move out with the data',()=>{
  const item={x:25,start:null,end:null,anchor:{sourceId:'csv1',time:5,offset:1}},series=[{sourceId:'csv1'}];
  assert.equal(annotationPosition(item,5.9,{left:0,right:10},series),null);
  assert.equal(annotationPosition(item,6,{left:0,right:10},series),.6);
  assert.equal(annotationPosition(item,9,{left:4,right:14},series),.2);
  assert.equal(annotationPosition(item,13,{left:7,right:17},series),null);
  assert.equal(annotationPosition(item,7,{left:0,right:10},[]),null);
  assert.equal(annotationPosition({...item,start:8},7,{left:0,right:10},series),null);
  assert.equal(annotationPosition({...item,anchor:{...item.anchor,offset:-2}},3,{left:0,right:10},series),.3);
  assert.equal(annotationPosition({...item,anchor:null},0,{left:0,right:10},series),.25);
});
test('custom video sizes are even and bounded',()=>{
  assert.ok(validDataFigureSize(1000,800));assert.ok(validDataFigureSize(1080,1920));
  assert.equal(validDataFigureSize(999,800),false);assert.equal(validDataFigureSize(4000,800),false);
  assert.equal(validDataFigureSize(3840,3840),false);
});
