import {dataWindow} from './data-series.js';
import {quantizedSubplotRange} from './data-scaling.js';
import {figureLayout,annotationPosition} from './data-layout.js';
import {drawPlotLabel,measurePlotLabel,measurePlotLabelBounds} from './math-labels.js';

const lowerBound=(array,value)=>{let lo=0,hi=array.length;while(lo<hi){const mid=(lo+hi)>>1;if(array[mid]<value)lo=mid+1;else hi=mid;}return lo;};
const tick=value=>Math.abs(value)>=10000 || (Math.abs(value)>0 && Math.abs(value)<.001) ? value.toExponential(2) : Number(value.toFixed(3)).toString();
const timeTick=value=>{const formatted=value.toFixed(2),sign=formatted.startsWith('-')&&formatted!=='-0.00'?'-':'';return sign+formatted.replace(/^-/, '').padStart(5,'0');};

// The preview and video both use these logical coordinates and the same renderer.
export function drawDataChart(canvas,state,time,{opaque=false,ranges=null}={}) {
  const ctx=canvas.getContext('2d'),width=1280,height=width*canvas.height/canvas.width;
  ctx.setTransform(canvas.width/width,0,0,canvas.width/width,0,0);
  const background=state.backgroundColor ?? '#ffffff',opacity=state.backgroundOpacity ?? 1;
  ctx.clearRect(0,0,width,height);if(opaque){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);}
  ctx.fillStyle=background;ctx.globalAlpha=opacity;ctx.fillRect(0,0,width,height);ctx.globalAlpha=1;
  const rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16));
  const dark=(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])*opacity+255*(1-opacity)<120;
  const primary=dark?'#edf4ec':'#263b2c',secondary=dark?'#cedbcd':'#758473';
  const plots=state.plots ?? [{id:'plot-1',title:'',xLabel:state.xLabel,yLabel:state.yLabel,width:100,height:100}];
  const labelSize=state.labelSize ?? 10,layouts=figureLayout(width,height,plots,state.layout,{labelSize}),window=dataWindow(state.start,time,state.windowSeconds,state.threshold,state.end),legendBoxes=[];
  const alignment=state.titleAlign ?? 'left',titleX=alignment==='center'?width/2:alignment==='right'?width-35:35;
  ctx.fillStyle=primary;ctx.font=`600 ${state.titleSize ?? 18}px sans-serif`;ctx.textAlign=alignment;ctx.textBaseline='middle';drawPlotLabel(ctx,state.title || 'Data over time',titleX,32,width-70);
  for(const [index,layout] of layouts.entries()){
    const definition=plots[index],plot=layout.plot,cell=layout.cell,series=state.series.filter(s=>(s.plotId ?? plots[0].id)===definition.id);
    const range=ranges?.[definition.id] ?? quantizedSubplotRange(series,definition,window,time,state.fullRanges?.[definition.id],state.scaleProfiles?.[definition.id]),plotWidth=plot.right-plot.left,plotHeight=plot.bottom-plot.top;
    let plotDark=dark;
    if(definition.backgroundColor){
      // Replace the figure background in this plot so its alpha stays equal to
      // the figure opacity instead of accumulating two translucent layers.
      ctx.clearRect(plot.left,plot.top,plotWidth,plotHeight);
      if(opaque){ctx.fillStyle='#ffffff';ctx.fillRect(plot.left,plot.top,plotWidth,plotHeight);}
      ctx.fillStyle=definition.backgroundColor;ctx.globalAlpha=opacity;ctx.fillRect(plot.left,plot.top,plotWidth,plotHeight);ctx.globalAlpha=1;
      const color=[1,3,5].map(i=>parseInt(definition.backgroundColor.slice(i,i+2),16));
      plotDark=(.2126*color[0]+.7152*color[1]+.0722*color[2])*opacity+255*(1-opacity)<120;
    }
    const plotGrid=plotDark?'#526557':'#e3eae1',plotBorder=plotDark?'#8ca38d':'#a5b6a2';
    const x=t=>plot.left+(t-window.left)/(window.right-window.left)*plotWidth,y=v=>plot.bottom-(v-range.min)/(range.max-range.min)*plotHeight;
    if(definition.title){ctx.fillStyle=primary;ctx.font=`600 ${definition.titleSize ?? 14}px sans-serif`;ctx.textAlign='center';drawPlotLabel(ctx,definition.title,cell.x+cell.width/2,layout.titleY,cell.width-20);}
    const fontSize=labelSize;ctx.font=`${fontSize}px sans-serif`;ctx.strokeStyle=plotGrid;ctx.lineWidth=1;
    for(let i=0;i<=5;i++){
      const tx=plot.left+plotWidth*i/5,ty=plot.top+plotHeight*i/5;
      ctx.beginPath();ctx.moveTo(tx,plot.top);ctx.lineTo(tx,plot.bottom);ctx.moveTo(plot.left,ty);ctx.lineTo(plot.right,ty);ctx.stroke();
      ctx.fillStyle=secondary;ctx.textAlign='center';ctx.fillText(timeTick(window.left+(window.right-window.left)*i/5),tx,plot.bottom+fontSize+5);
      ctx.textAlign='right';ctx.fillText(tick(range.max-(range.max-range.min)*i/5),plot.left-8,ty,Math.max(12,plot.left-cell.x-12));
    }
    ctx.strokeStyle=plotBorder;ctx.lineWidth=1.5;ctx.strokeRect(plot.left,plot.top,plotWidth,plotHeight);
    ctx.fillStyle=dark?'#d7e5d5':'#566e55';ctx.textAlign='center';ctx.font=`600 ${fontSize}px sans-serif`;
    drawPlotLabel(ctx,definition.xLabel || 'Time (s)',(plot.left+plot.right)/2,Math.min(cell.y+cell.height-fontSize/2-2,plot.bottom+fontSize*2+10),plotWidth);
    ctx.save();ctx.translate(cell.x+Math.max(14,fontSize/2+2),(plot.top+plot.bottom)/2);ctx.rotate(-Math.PI/2);drawPlotLabel(ctx,definition.yLabel || 'Value',0,0,plotHeight);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(plot.left,plot.top,plotWidth,plotHeight);ctx.clip();
    const endpoints=[];
    for(const s of series){
      if(!s.visible)continue;const times=s.times,values=s.values;let i=Math.max(0,lowerBound(times,window.left)-1),previous=null,endpoint=null;
      ctx.beginPath();ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(s.style==='dashed'?[12,8]:s.style==='dotted'?[2,7]:[]);
      for(;i<times.length && times[i]<=time && times[i]<=window.right;i++){const value=values[i];if(value===null){previous=null;continue;}if(previous)ctx.lineTo(x(times[i]),y(value));else ctx.moveTo(x(times[i]),y(value));previous={time:times[i],value};endpoint=previous;}
      if(previous && i<times.length && values[i]!==null && previous.time<time && times[i]>time && time<=window.right){const f=(time-previous.time)/(times[i]-previous.time);endpoint={time,value:previous.value+(values[i]-previous.value)*f};ctx.lineTo(x(endpoint.time),y(endpoint.value));}
      ctx.stroke();
      if(endpoint && endpoint.time>=window.left && endpoint.time<=window.right)endpoints.push({x:x(endpoint.time),y:y(endpoint.value),color:s.color});
    }
    ctx.setLineDash([]);
    if(state.showMarkers!==false)for(const point of endpoints){ctx.beginPath();ctx.arc(point.x,point.y,5,0,Math.PI*2);ctx.fillStyle=point.color;ctx.fill();ctx.strokeStyle=plotDark?'#1c2a20':'#ffffff';ctx.lineWidth=1.5;ctx.stroke();}
    for(const item of (state.texts ?? []))if(item.plotId===definition.id){
      const anchor=item.anchor,initialWindow=anchor&&(anchor.mode==='attach'||anchor.detachPercent!=null)?dataWindow(state.start,Math.max(state.start,anchor.time+anchor.offset),state.windowSeconds,state.threshold,state.end):window;
      const reattachWindow=anchor?.reattachTime!=null&&time>=anchor.reattachTime?dataWindow(state.start,anchor.reattachTime,state.windowSeconds,state.threshold,state.end):window;
      let bounds=null;if(item.type!=='line'){ctx.font=`600 ${item.size*1280/(state.figureWidth ?? canvas.width)}px sans-serif`;ctx.textAlign=item.align??'left';bounds=measurePlotLabelBounds(ctx,item.text);}
      const position=annotationPosition(item,time,window,state.sources??state.series,initialWindow,reattachWindow,bounds?{leftPadding:(bounds.right+1)/plotWidth,rightPadding:(bounds.left+1)/plotWidth,allowFuture:anchor?.mode!=='attach'}:undefined);if(position===null)continue;
      const px=plot.left+plotWidth*position;
      if(item.type==='line'){
        ctx.strokeStyle=item.color;ctx.lineWidth=item.width;ctx.setLineDash(item.style==='dashed'?[12,8]:item.style==='dotted'?[2,7]:[]);ctx.beginPath();ctx.moveTo(px,plot.top);ctx.lineTo(px,plot.bottom);ctx.stroke();ctx.setLineDash([]);
      }else{
        ctx.save();
        // The subplot clip reveals and hides the label at the plot edges.
        ctx.fillStyle=item.color;ctx.font=`600 ${item.size*1280/(state.figureWidth ?? canvas.width)}px sans-serif`;ctx.textAlign=item.align??'left';ctx.textBaseline='middle';drawPlotLabel(ctx,item.text,px,plot.top+plotHeight*item.y/100);ctx.restore();
      }
    }
    ctx.restore();
    const shown=series.filter(s=>s.visible),legend=definition.legend ?? {position:state.legendPosition,point:null,size:state.legendSize,visible:state.showLegend};
    if(legend.visible!==false && shown.length && legend.position==='outside-top'){
      const area=layout.outsideLegend,boxWidth=area?.right-area?.left,boxHeight=area?.bottom-area?.top;
      if(boxWidth>0&&boxHeight>=6){
        const font=Math.max(4,Math.min(legend.size ?? 10,boxHeight-6));ctx.font=`600 ${font}px sans-serif`;
        const gap=Math.min(6,boxWidth/(2*shown.length)),available=boxWidth-gap*(shown.length-1),widths=shown.map(s=>measurePlotLabel(ctx,s.label)+36),total=widths.reduce((a,b)=>a+b,0),scale=Math.min(1,available/total);
        let lx=area.left;const yy=(area.top+area.bottom)/2;
        ctx.fillStyle=dark?'#1c2a20':'#ffffff';ctx.strokeStyle=dark?'#758b78':'#dce5d9';ctx.globalAlpha=opacity*.91;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(area.left,area.top,boxWidth,boxHeight,4);ctx.fill();ctx.stroke();ctx.globalAlpha=1;
        ctx.save();ctx.beginPath();ctx.rect(area.left,area.top,boxWidth,boxHeight);ctx.clip();
        shown.forEach((s,i)=>{
          const entryWidth=widths[i]*scale,sample=Math.min(20,entryWidth*.35),labelX=lx+sample+4;
          ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.setLineDash(s.style==='dashed'?[12,8]:s.style==='dotted'?[2,7]:[]);ctx.beginPath();ctx.moveTo(lx+4,yy);ctx.lineTo(lx+sample,yy);ctx.stroke();ctx.setLineDash([]);
          ctx.fillStyle=dark?'#e5f0e2':'#40543f';ctx.textAlign='left';ctx.textBaseline='middle';drawPlotLabel(ctx,s.label,labelX,yy,Math.max(1,entryWidth-sample-7));lx+=entryWidth+gap;
        });
        ctx.restore();
      }
    }else if(legend.visible!==false && shown.length){
      const padding=6,availableWidth=Math.max(1,plotWidth-padding*2),availableHeight=Math.max(1,plotHeight-padding*2);
      const font=Math.max(4,Math.min(legend.size ?? 18,(availableHeight-8)/shown.length-4));ctx.font=`600 ${font}px sans-serif`;
      const rowHeight=font+4,boxWidth=Math.min(availableWidth,Math.max(50,...shown.map(s=>measurePlotLabel(ctx,s.label)+46))),boxHeight=Math.min(availableHeight,shown.length*rowHeight+8);
      const position=legend.position ?? 'top-right';let lx=position.endsWith('right')?plot.right-padding-boxWidth:plot.left+padding,ly=position.startsWith('bottom')?plot.bottom-padding-boxHeight:plot.top+padding;
      if(position==='custom'&&legend.point){lx=plot.left+legend.point.x*plotWidth;ly=plot.top+legend.point.y*plotHeight;}
      lx=Math.max(plot.left,Math.min(plot.right-boxWidth,lx));ly=Math.max(plot.top,Math.min(plot.bottom-boxHeight,ly));
      ctx.fillStyle=plotDark?'#1c2a20':'#ffffff';ctx.strokeStyle=plotDark?'#758b78':'#dce5d9';ctx.globalAlpha=opacity*.91;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(lx,ly,boxWidth,boxHeight,4);ctx.fill();ctx.stroke();ctx.globalAlpha=1;
      ctx.save();ctx.beginPath();ctx.rect(lx,ly,boxWidth,boxHeight);ctx.clip();
      shown.forEach((s,i)=>{const yy=ly+4+rowHeight*(i+.5);ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.setLineDash(s.style==='dashed'?[12,8]:s.style==='dotted'?[2,7]:[]);ctx.beginPath();ctx.moveTo(lx+8,yy);ctx.lineTo(lx+29,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=plotDark?'#e5f0e2':'#40543f';ctx.textAlign='left';ctx.textBaseline='middle';drawPlotLabel(ctx,s.label,lx+35,yy,Math.max(1,boxWidth-40));});
      ctx.restore();legendBoxes.push({plotId:definition.id,x:lx,y:ly,width:boxWidth,height:boxHeight,plot});
    }
  }
  return legendBoxes;
}
