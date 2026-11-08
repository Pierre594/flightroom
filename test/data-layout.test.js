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

test('time-anchored annotations stop at a selected plot position without jumping',()=>{
  const item={x:0,start:3,end:20,anchor:{sourceId:'csv',time:5,offset:1,detachPercent:20}},series=[{sourceId:'csv'}];
  const initial={left:0,right:10};
  assert.equal(annotationPosition(item,8,{left:3,right:13},series,initial),.3);
  assert.equal(annotationPosition(item,9,{left:4,right:14},series,initial),.2);
  assert.equal(annotationPosition(item,19,{left:14,right:24},series,initial),.2);
  assert.equal(annotationPosition(item,21,{left:14,right:24},series,initial),null);
  assert.equal(annotationPosition(item,19,{left:14,right:24},[],initial),null);
  assert.equal(annotationPosition({...item,anchor:{...item.anchor,detachPercent:80}},9,{left:4,right:14},series,initial),.6);
  assert.equal(annotationPosition(item,19,{left:14,right:24},series,{left:7,right:17}),null);
  assert.equal(annotationPosition({...item,anchor:{...item.anchor,detachPercent:0}},19,{left:14,right:24},series,initial),0);
});

test('fixed annotations attach without jumping, then follow the window and can detach',()=>{
  const item={x:60,start:2,end:20,anchor:{sourceId:'csv',time:10,offset:1,mode:'attach',detachPercent:30}},series=[{sourceId:'csv'}],initial={left:4,right:14};
  const position=(time,left,source=series)=>annotationPosition(item,time,{left,right:left+10},source,initial);
  assert.equal(position(1,0),null);
  assert.equal(position(10,3),.6);
  assert.equal(position(11,4),.6);
  assert.equal(position(13,6),.4);
  assert.equal(position(15,8),.3);
  assert.equal(position(19,12),.3);
  assert.equal(position(21,14),null);
  assert.equal(position(10,3,[]),.6);
  assert.equal(position(11,4,[]),null);
  assert.equal(annotationPosition({...item,anchor:{...item.anchor,detachPercent:null}},19,{left:12,right:22},series,initial),null);
});

test('reattachment resumes scrolling from the stopped position and is deterministic when seeking',()=>{
  const item={x:70,start:null,end:null,anchor:{sourceId:'csv',time:10,offset:0,mode:'attach',detachPercent:20,reattachTime:20}},series=[{sourceId:'csv'}],initial={left:3,right:13},reattach={left:13,right:23};
  const position=(time,left,attachWindow=reattach)=>annotationPosition(item,time,{left,right:left+10},series,initial,attachWindow);
  assert.equal(position(5,0),.7);
  assert.equal(position(10,3),.7);
  assert.equal(position(12,5),.5);
  assert.equal(position(15,8),.2);
  assert.equal(position(19,12),.2);
  assert.equal(position(20,13),.2);
  assert.equal(position(21,14),.1);
  assert.equal(position(22,15),0);
  assert.equal(position(23,16),null);
  assert.equal(position(12,5),.5);
  // If window settings change so the stop was not yet reached at reattach,
  // do not jump to the stop prematurely.
  assert.equal(position(20,5,{left:5,right:15}),.5);
});

test('CSV timestamp annotations detach and reattach from their actual timestamp position',()=>{
  const item={x:10,start:null,end:null,anchor:{sourceId:'csv',time:9,offset:1,detachPercent:20,reattachTime:20}},series=[{sourceId:'csv'}],initial={left:3,right:13},reattach={left:13,right:23};
  const position=(time,left)=>annotationPosition(item,time,{left,right:left+10},series,initial,reattach);
  assert.equal(position(9,2),null);
  assert.equal(position(10,3),.7);
  assert.equal(position(12,5),.5);
  assert.equal(position(15,8),.2);
  assert.equal(position(19,12),.2);
  assert.equal(position(20,13),.2);
  assert.equal(position(21,14),.1);
  assert.equal(position(23,16),null);
  assert.equal(position(12,5),.5);
});
