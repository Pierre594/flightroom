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

test('rendering at a different time recomputes automatic ranges for video frames',()=>{
  const labels=[];const context=new Proxy({measureText:text=>({width:text.length*8}),fillText:(text,x)=>labels.push({text,x})},{get:(target,key)=>target[key]??(()=>{})});
  const series=[{plotId:'a',label:'A',times:[0,10,20],values:[0,100,0],visible:true,color:'#aa0000',style:'solid',width:2}];
  const state={plots:[{id:'a',width:100,height:100,yRangeMode:'auto',yMargin:10}],layout:'vertical',series,start:0,end:20,windowSeconds:5,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1,plotRanges:{a:{min:-500,max:500}},fullRanges:{a:{min:-10,max:110}}};
  const canvas={width:1280,height:720,getContext:()=>context};
  drawDataChart(canvas,state,2);assert.equal(labels.find(label=>label.x===104).text,'22');labels.length=0;
  drawDataChart(canvas,state,12);assert.equal(labels.find(label=>label.x===104).text,'102');
});

test('anchored text and lines stop at their chosen subplot position, including when seeking',()=>{
  let textX,lineX;const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>{
    if(key==='fillText')return (text,x)=>{if(text==='Pinned')textX=x;};
    if(key==='moveTo')return (x)=>{if(target.strokeStyle==='#123456')lineX=x;};
    return target[key]??(()=>{});
  }});
  const anchor={sourceId:'csv',time:8,offset:1,detachPercent:30};
  const state={plots:[{id:'a',width:100,height:100}],layout:'vertical',series:[{sourceId:'csv',plotId:'a',label:'A',times:[0,30],values:[0,1],visible:true,color:'#eeeeee',style:'solid',width:2}],start:0,end:30,windowSeconds:10,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1,texts:[{type:'text',text:'Pinned',plotId:'a',anchor,start:null,end:20,y:20,size:20,color:'#123456'},{type:'line',plotId:'a',anchor,start:null,end:20,width:2,style:'solid',color:'#123456'}]};
  const canvas={width:1280,height:720,getContext:()=>context};
  const render=time=>{textX=undefined;lineX=undefined;drawDataChart(canvas,state,time);return [textX,lineX];};
  const before=render(8);assert.ok(Number.isFinite(before[0]));assert.equal(before[1],undefined);
  const initial=render(10),frozen=render(13);assert.ok(initial[0]>frozen[0]);assert.equal(frozen[0],frozen[1]);
  assert.deepEqual(render(17),frozen);assert.deepEqual(render(13),frozen);assert.deepEqual(render(10),initial);
  assert.deepEqual(render(21),[undefined,undefined]);
  state.texts.forEach(item=>{item.anchor={...item.anchor,detachPercent:null};});assert.deepEqual(render(17),[undefined,undefined]);
});

test('fixed text and lines attach smoothly and detach during playback and seeking',()=>{
  let textX,lineX;const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>{
    if(key==='fillText')return (text,x)=>{if(text==='Attached')textX=x;};
    if(key==='moveTo')return x=>{if(target.strokeStyle==='#123456')lineX=x;};
    return target[key]??(()=>{});
  }});
  const anchor={sourceId:'csv',time:10,offset:0,mode:'attach',detachPercent:20};
  const state={plots:[{id:'a',width:100,height:100,legend:{visible:false}}],layout:'vertical',series:[{sourceId:'csv',plotId:'a',label:'A',times:[0,30],values:[0,1],visible:true,color:'#eeeeee',style:'solid',width:2}],start:0,end:30,windowSeconds:10,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1,texts:[{type:'text',text:'Attached',plotId:'a',x:70,anchor,start:null,end:null,y:20,size:20,color:'#123456'},{type:'line',plotId:'a',x:70,anchor,start:null,end:null,width:2,style:'solid',color:'#123456'}]};
  const canvas={width:1280,height:720,getContext:()=>context};
  const render=time=>{textX=undefined;lineX=undefined;drawDataChart(canvas,state,time);return [textX,lineX];};
  const fixed=render(5);assert.equal(fixed[0],fixed[1]);assert.deepEqual(render(10),fixed);
  const moving=render(12);assert.ok(moving[0]<fixed[0]);assert.equal(moving[0],moving[1]);
  const stopped=render(15);assert.ok(stopped[0]<moving[0]);assert.deepEqual(render(20),stopped);assert.deepEqual(render(12),moving);assert.deepEqual(render(5),fixed);
});

test('text and line reattach after a pause without jumping and move again on seek',()=>{
  let textX,lineX;const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>{
    if(key==='fillText')return (text,x)=>{if(text==='Resume')textX=x;};
    if(key==='moveTo')return x=>{if(target.strokeStyle==='#123456')lineX=x;};
    return target[key]??(()=>{});
  }});
  const anchor={sourceId:'csv',time:10,offset:0,mode:'attach',detachPercent:20,reattachTime:20};
  const state={plots:[{id:'a',width:100,height:100,legend:{visible:false}}],layout:'vertical',series:[{sourceId:'csv',plotId:'a',label:'A',times:[0,40],values:[0,1],visible:true,color:'#eeeeee',style:'solid',width:2}],start:0,end:40,windowSeconds:10,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1,texts:[{type:'text',text:'Resume',plotId:'a',x:70,anchor,start:null,end:null,y:20,size:20,color:'#123456'},{type:'line',plotId:'a',x:70,anchor,start:null,end:null,width:2,style:'solid',color:'#123456'}]};
  const canvas={width:1280,height:720,getContext:()=>context};
  const render=time=>{textX=undefined;lineX=undefined;drawDataChart(canvas,state,time);return [textX,lineX];};
  const fixed=render(5);assert.deepEqual(render(10),fixed);
  assert.ok(render(12)[0]<fixed[0]);const stopped=render(15);assert.deepEqual(render(19),stopped);assert.deepEqual(render(20),stopped);
  const moving=render(21);assert.ok(moving[0]<stopped[0]);assert.equal(moving[0],moving[1]);assert.deepEqual(render(23),[undefined,undefined]);assert.deepEqual(render(19),stopped);
});

test('timestamp-anchored text and lines resume after reattachment',()=>{
  let textX,lineX;const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>{
    if(key==='fillText')return (text,x)=>{if(text==='Resume timestamp')textX=x;};
    if(key==='moveTo')return x=>{if(target.strokeStyle==='#123456')lineX=x;};
    return target[key]??(()=>{});
  }});
  const anchor={sourceId:'csv',time:9,offset:1,detachPercent:20,reattachTime:20};
  const state={plots:[{id:'a',width:100,height:100,legend:{visible:false}}],layout:'vertical',series:[{sourceId:'csv',plotId:'a',label:'A',times:[0,40],values:[0,1],visible:true,color:'#eeeeee',style:'solid',width:2}],start:0,end:40,windowSeconds:10,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1,texts:[{type:'text',text:'Resume timestamp',plotId:'a',x:10,anchor,start:null,end:null,y:20,size:20,color:'#123456'},{type:'line',plotId:'a',x:10,anchor,start:null,end:null,width:2,style:'solid',color:'#123456'}]};
  const canvas={width:1280,height:720,getContext:()=>context},render=time=>{textX=undefined;lineX=undefined;drawDataChart(canvas,state,time);return [textX,lineX];};
  const before=render(9);assert.ok(Number.isFinite(before[0]));assert.equal(before[1],undefined);const first=render(10);assert.equal(first[0],first[1]);assert.ok(render(12)[0]<first[0]);
  const stopped=render(15);assert.deepEqual(render(19),stopped);assert.deepEqual(render(20),stopped);const moving=render(21);assert.ok(moving[0]<stopped[0]);assert.equal(moving[0],moving[1]);assert.ok(Number.isFinite(render(23)[0]));assert.deepEqual(render(24),[undefined,undefined]);assert.deepEqual(render(19),stopped);
});

test('time axis uses two decimal places without changing vertical data formatting',()=>{
  const labels=[];const context=new Proxy({measureText:text=>({width:text.length*8})},{get:(target,key)=>key==='fillText'?(text,x,y)=>labels.push({text,x,y,align:target.textAlign}):target[key]??(()=>{})});
  const plot={id:'a',width:100,height:100,yRangeMode:'manual',yMin:0,yMax:1.234,legend:{visible:false}};
  const state={plots:[plot],layout:'vertical',series:[],start:0,end:12.863,windowSeconds:12.863,threshold:.7,figureWidth:1280,backgroundColor:'#ffffff',backgroundOpacity:1};
  const canvas={width:1280,height:720,getContext:()=>context},area=figureLayout(1280,720,[plot],'vertical')[0].plot;
  drawDataChart(canvas,state,0);
  assert.deepEqual(labels.filter(label=>label.y===area.bottom+15).map(label=>label.text),['00.00','02.57','05.15','07.72','10.29','12.86']);
  assert.ok(labels.some(label=>label.align==='right'&&label.text==='1.234'));
  labels.length=0;state.start=-.004;state.end=5.996;state.windowSeconds=6;drawDataChart(canvas,state,state.start);
  assert.equal(labels.find(label=>label.y===area.bottom+15).text,'00.00');
});
