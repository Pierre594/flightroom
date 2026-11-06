import test from 'node:test';
import assert from 'node:assert/strict';
import {drawDataChart} from '../src/data-chart.js';
import {figureLayout} from '../src/data-layout.js';

test('each subplot renders a legend containing only its own visible series',()=>{
  const labels=[];
  const context=new Proxy({measureText:text=>({width:text.length*8}),fillText:(text,x,y)=>labels.push({text,x,y})},{get:(target,key)=>target[key]??(()=>{})});
  const canvas={width:1280,height:720,getContext:()=>context};
  const legend={visible:true,position:'top-right',point:null,size:18};
  const state={plots:[{id:'a',width:100,height:100,legend:{...legend}},{id:'b',width:100,height:100,legend:{...legend}}],layout:'vertical',title:'Test',series:[{plotId:'a',name:'first',label:'first',times:[0,1],values:[1,2],visible:true,color:'#aa0000',style:'solid',width:2},{plotId:'b',name:'second',label:'second',times:[0,1],values:[2,3],visible:true,color:'#00aa00',style:'solid',width:2}],start:0,end:1,windowSeconds:1,threshold:.7,showCursor:true,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1};
  const boxes=drawDataChart(canvas,state,1);assert.deepEqual(boxes.map(box=>box.plotId),['a','b']);
  for(const [index,name] of ['first','second'].entries()){
    const label=labels.find(item=>item.text===name),box=boxes[index];assert.ok(label.x>=box.x&&label.x<=box.x+box.width&&label.y>=box.y&&label.y<=box.y+box.height);
  }
  state.plots[0].legend.visible=false;
  assert.deepEqual(drawDataChart(canvas,state,1).map(box=>box.plotId),['b']);
});

test('title alignment and independent text sizes are used by the chart renderer',()=>{
  const calls=[];
  const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>key==='fillText'?(text,x,y)=>calls.push({text,x,y,font:target.font,align:target.textAlign}):target[key]??(()=>{})});
  const canvas={width:1280,height:720,getContext:()=>context};
  const state={plots:[{id:'a',title:'Upper',titleSize:23,xLabel:'Seconds',width:100,height:100,legend:{visible:true,position:'top-right',point:null,size:15}},{id:'b',title:'Lower',titleSize:12,width:100,height:100,legend:{visible:false,position:'top-right',point:null,size:15}}],layout:'vertical',title:'Main',titleSize:31,titleAlign:'right',labelSize:15,series:[{plotId:'a',label:'Legend A',times:[0,1],values:[1,2],visible:true,color:'#aa0000',style:'solid',width:2}],start:0,end:1,windowSeconds:1,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1};
  drawDataChart(canvas,state,1);
  const find=text=>calls.find(call=>call.text===text);
  assert.deepEqual([find('Main').font,find('Main').align,find('Main').x],['600 31px sans-serif','right',1245]);
  assert.equal(find('Upper').font,'600 23px sans-serif');assert.equal(find('Lower').font,'600 12px sans-serif');
  assert.equal(find('Seconds').font,'600 15px sans-serif');assert.equal(find('Legend A').font,'600 15px sans-serif');
  assert.equal(find('0').font,'15px sans-serif');
});

test('custom plot backgrounds replace the figure color without stacking opacity',()=>{
  const calls=[];
  const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>['clearRect','fillRect'].includes(key)?(...args)=>calls.push({method:key,args,color:target.fillStyle,alpha:target.globalAlpha}):target[key]??(()=>{})});
  const canvas={width:1280,height:720,getContext:()=>context};
  const state={plots:[{id:'a',width:100,height:100,backgroundColor:'#102030'},{id:'b',width:100,height:100,backgroundColor:null}],layout:'vertical',series:[],start:0,end:1,windowSeconds:1,threshold:.7,backgroundColor:'#ddeeff',backgroundOpacity:.5};
  drawDataChart(canvas,state,0);
  assert.equal(calls.filter(call=>call.method==='clearRect').length,2);
  assert.equal(calls.filter(call=>call.method==='fillRect').length,2);
  assert.equal(calls[1].color,'#ddeeff');assert.equal(calls[1].alpha,.5);
  assert.equal(calls[3].color,'#102030');assert.equal(calls[3].alpha,.5);
  calls.length=0;drawDataChart(canvas,state,0,{opaque:true});
  assert.deepEqual(calls.filter(call=>call.method==='fillRect').map(call=>call.color),['#ffffff','#ddeeff','#ffffff','#102030']);
});

test('an above-plot legend reserves room below the title and lays entries side by side',()=>{
  const calls=[];
  const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>key==='fillText'?(text,x,y)=>calls.push({text,x,y}):target[key]??(()=>{})});
  const plot={id:'a',title:'Subplot title',titleSize:14,width:100,height:100,legend:{visible:true,position:'outside-top',point:null,size:18}};
  const series=['First','Second','Third'].map((label,i)=>({plotId:'a',label,times:[0,1],values:[1,2],visible:true,color:['#aa0000','#00aa00','#0000aa'][i],style:'solid',width:2}));
  const state={plots:[plot],layout:'vertical',title:'Main',series,start:0,end:1,windowSeconds:1,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1};
  const [layout]=figureLayout(1280,720,[plot],'vertical');
  assert.ok(layout.titleY<layout.cell.y+18);assert.ok(layout.outsideLegend.top>layout.titleY+plot.titleSize/2);assert.ok(layout.outsideLegend.bottom<layout.plot.top);
  const boxes=drawDataChart({width:1280,height:720,getContext:()=>context},state,1);
  const labels=series.map(s=>calls.find(call=>call.text===s.label));
  assert.equal(boxes.length,0);assert.equal(labels[0].y,labels[1].y);assert.equal(labels[1].y,labels[2].y);
  assert.ok(labels[0].x<labels[1].x&&labels[1].x<labels[2].x);assert.ok(labels.every(label=>label.y>layout.outsideLegend.top&&label.y<layout.plot.top));
});
