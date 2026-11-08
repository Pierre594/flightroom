import test from 'node:test';
import assert from 'node:assert/strict';
import {drawDataChart} from '../src/data-chart.js';
import {figureLayout} from '../src/data-layout.js';

test('markers follow each visible curve endpoint, including interpolation, gaps and different durations',()=>{
  const markers=[],strokes=[];let arc;
  const context=new Proxy({measureText:text=>({width:text.length*8}),arc:(x,y,r)=>{arc={x,y,r};},fill:()=>{if(arc){markers.push({...arc,color:context.fillStyle});arc=null;}},stroke:()=>strokes.push(context.strokeStyle)},{get:(target,key)=>target[key]??(()=>{})});
  const canvas={width:1280,height:720,getContext:()=>context},plot={id:'a',width:100,height:100,yRangeMode:'manual',yMin:0,yMax:10,legend:{visible:false}};
  const curve=(label,times,values,color,visible=true)=>({plotId:'a',label,times,values,color,visible,style:'solid',width:2});
  const state={plots:[plot],layout:'vertical',series:[curve('A',[0,4,8],[0,4,8],'#123456'),curve('Gap',[0,4,8],[6,null,2],'#789abc'),curve('Later',[4,8],[2,4],'#336699'),curve('Hidden',[0,8],[3,4],'#aabbcc',false)],start:0,end:10,windowSeconds:10,threshold:.7,showMarkers:true,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1};
  const area=figureLayout(1280,720,[plot],'vertical')[0].plot,x=t=>area.left+(area.right-area.left)*t/10,y=v=>area.bottom-(area.bottom-area.top)*v/10;
  drawDataChart(canvas,state,2);
  assert.deepEqual(markers,[{x:x(2),y:y(2),r:5,color:'#123456'},{x:x(0),y:y(6),r:5,color:'#789abc'}]);
  assert.ok(!strokes.includes('#8da389'));
  markers.length=0;drawDataChart(canvas,state,10);
  for(const [index,value,color] of [[0,8,'#123456'],[1,2,'#789abc'],[2,4,'#336699']]){assert.equal(markers[index].x,x(8));assert.ok(Math.abs(markers[index].y-y(value))<1e-9);assert.equal(markers[index].color,color);}
  markers.length=0;state.showMarkers=false;drawDataChart(canvas,state,2);assert.equal(markers.length,0);
});

test('markers disappear when their series endpoint scrolls outside the visible window',()=>{
  const arcs=[];const context=new Proxy({measureText:text=>({width:text.length*8}),arc:(...args)=>arcs.push(args)},{get:(target,key)=>target[key]??(()=>{})});
  const state={plots:[{id:'a',width:100,height:100,yRangeMode:'manual',yMin:0,yMax:10,legend:{visible:false}}],layout:'vertical',series:[{plotId:'a',label:'A',times:[0,2],values:[1,2],color:'#123456',visible:true,style:'solid',width:2}],start:0,end:20,windowSeconds:5,threshold:.7,showMarkers:true,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1};
  drawDataChart({width:1280,height:720,getContext:()=>context},state,15);assert.equal(arcs.length,0);
});
