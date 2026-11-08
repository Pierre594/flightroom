import test from 'node:test';
import assert from 'node:assert/strict';
import {drawDataChart} from '../src/data-chart.js';
import {figureLayout} from '../src/data-layout.js';

test('timestamp-following text enters at the right edge and remains until its last letters leave the plot',()=>{
  const rects=[],draws=[],lines=[];
  const context=new Proxy({measureText:text=>({width:text.length*8,actualBoundingBoxLeft:1,actualBoundingBoxRight:text.length*8+2})},{get:(target,key)=>{
    if(key==='rect')return (...args)=>rects.push(args);
    if(key==='fillText')return (text,x)=>{if(text==='ABCDEFGHIJKL')draws.push(x);};
    if(key==='moveTo')return x=>{if(target.strokeStyle==='#123456')lines.push(x);};
    return target[key]??(()=>{});
  }});
  const plot={id:'a',width:100,height:100,legend:{visible:false}},anchor={sourceId:'csv',time:15,offset:0};
  const state={plots:[plot],layout:'vertical',series:[{sourceId:'csv',plotId:'a',label:'Data',times:[0,40],values:[0,1],visible:true,color:'#eeeeee',style:'solid',width:2}],start:0,end:40,windowSeconds:10,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1,texts:[{type:'text',text:'ABCDEFGHIJKL',plotId:'a',x:10,anchor,start:null,end:null,y:20,size:20,color:'#123456'},{type:'line',plotId:'a',x:10,anchor,start:null,end:null,width:2,style:'solid',color:'#123456'}]};
  const canvas={width:1280,height:720,getContext:()=>context},area=figureLayout(1280,720,[plot],'vertical')[0].plot;
  const render=time=>{rects.length=0;draws.length=0;lines.length=0;drawDataChart(canvas,state,time);};
  render(10);assert.equal(draws.length,0);assert.equal(lines.length,0);
  render(12);assert.equal(draws.length,1);assert.ok(Math.abs(draws[0]-area.right)<1e-9);
  render(12.2);assert.ok(draws[0]<area.right);assert.equal(lines.length,0);
  render(22.2);assert.equal(draws.length,1);assert.ok(draws[0]<area.left);assert.equal(lines.length,0);
  render(23);assert.equal(draws.length,0);
});

test('text alignment determines the anchor and its visible bounds',()=>{
  const labels=[],rects=[];const context=new Proxy({measureText:()=>({width:80})},{get:(target,key)=>{
    if(key==='fillText')return (text,x)=>{if(text==='Aligned')labels.push({x,align:target.textAlign});};
    if(key==='rect')return (...args)=>rects.push(args);
    return target[key]??(()=>{});
  }});
  const plot={id:'a',width:100,height:100,legend:{visible:false}},anchor={sourceId:'csv',time:10,offset:0};
  const state={plots:[plot],layout:'vertical',series:[{sourceId:'csv',plotId:'a',label:'Data',times:[0,40],values:[0,1],visible:true,color:'#eeeeee',style:'solid',width:2}],start:0,end:40,windowSeconds:10,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1,texts:[{type:'text',text:'Aligned',plotId:'a',x:50,anchor,start:null,end:null,y:20,size:20,color:'#123456'}]};
  const canvas={width:1280,height:720,getContext:()=>context},area=figureLayout(1280,720,[plot],'vertical')[0].plot;
  const render=(time,align)=>{labels.length=0;rects.length=0;state.texts[0].align=align;drawDataChart(canvas,state,time);return {label:labels.at(-1),clip:rects.at(-1)};};
  const left=render(10,'left'),center=render(10,'center'),right=render(10,'right');
  assert.deepEqual([left.label.align,center.label.align,right.label.align],['left','center','right']);
  assert.equal(left.label.x,center.label.x);assert.equal(center.label.x,right.label.x);
  assert.deepEqual(left.clip,center.clip);assert.deepEqual(center.clip,right.clip);
  state.texts[0].anchor={...anchor,time:15};
  assert.equal(render(11.6,'center').label,undefined);assert.ok(render(11.65,'center').label.x>area.right);
  assert.equal(render(11.65,'left').label,undefined);
  state.texts[0].anchor=anchor;
  assert.ok(render(17.2,'left').label.x<area.left);assert.ok(render(17.2,'center').label.x<area.left);assert.equal(render(17.2,'right').label,undefined);
  state.texts[0].anchor=null;
  for(const align of ['left','center','right']){const result=render(10,align);assert.equal(result.label.align,align);assert.equal(result.label.x,area.left+(area.right-area.left)*.5);}
});
