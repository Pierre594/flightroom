// Dimensions use the chart's logical canvas coordinates; preview and export
// share the same aspect ratio and therefore exactly the same layout.
export function figureLayout(width,height,plots,orientation='vertical',{labelSize=10}={}) {
  if(!plots.length)return [];
  const top=64,bottom=22,left=14,right=18,gap=16;
  const usableWidth=width-left-right,usableHeight=Math.max(40,height-top-bottom);
  const result=(p,x,y,w,h)=>{
    const outside=p.legend?.position==='outside-top'&&p.legend.visible!==false;
    const titleSize=p.titleSize ?? 14,titleY=outside?Math.min(18,titleSize/2+3):18;
    const legendTop=outside?(p.title?titleY+titleSize/2+4:4):0;
    const requiredTop=outside?Math.max(40,legendTop+(p.legend.size ?? 10)+8+6):40;
    const ml=Math.min(Math.max(98,labelSize*3),w*.25),mr=Math.min(25,w*.08),mt=Math.min(requiredTop,h*(outside ? .45 : .22)),mb=Math.min(Math.max(65,labelSize*2.5+20),h*.40);
    const plot={left:x+ml,right:x+w-mr,top:y+mt,bottom:y+h-mb};
    const outsideLegend=outside?{left:plot.left,right:plot.right,top:y+legendTop,bottom:Math.max(y+legendTop,plot.top-5)}:null;
    return {id:p.id,cell:{x,y,width:w,height:h},plot,titleY:y+titleY,outsideLegend};
  };
  if(orientation==='rows' || orientation==='columns'){
    const rows=orientation==='rows',groups=new Map(),layouts=new Map();
    for(const p of plots){const number=p.group ?? 1;if(!groups.has(number))groups.set(number,[]);groups.get(number).push(p);}
    const ordered=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,items])=>items);
    const majorSize=rows?usableHeight:usableWidth,crossSize=rows?usableWidth:usableHeight;
    const majorAvailable=Math.max(20,majorSize-gap*(ordered.length-1));
    const weights=ordered.map(items=>Math.max(...items.map(p=>rows?p.height:p.width)));
    const total=Math.max(100,weights.reduce((a,b)=>a+b,0));let major=rows?top:left;
    for(const [groupIndex,items] of ordered.entries()){
      const extent=majorAvailable*weights[groupIndex]/total,crossAvailable=Math.max(20,crossSize-gap*(items.length-1));
      const crossTotal=Math.max(100,items.reduce((sum,p)=>sum+(rows?p.width:p.height),0));let cross=rows?left:top;
      for(const p of items){
        const crossExtent=crossAvailable*(rows?p.width:p.height)/crossTotal;
        const ownMajor=extent*(rows?p.height:p.width)/weights[groupIndex];
        const offset=(extent-ownMajor)/2;
        layouts.set(p.id,rows?result(p,cross,major+offset,crossExtent,ownMajor):result(p,major+offset,cross,ownMajor,crossExtent));
        cross+=crossExtent+gap;
      }
      major+=extent+gap;
    }
    return plots.map(p=>layouts.get(p.id));
  }
  const horizontal=orientation==='horizontal';
  const available=Math.max(20,(horizontal?usableWidth:usableHeight)-gap*(plots.length-1));
  const total=Math.max(100,plots.reduce((sum,p)=>sum+(horizontal?p.width:p.height),0));
  let cursor=horizontal?left:top;
  return plots.map(p=>{
    const portion=available*(horizontal?p.width:p.height)/total;
    const w=horizontal?portion:usableWidth*Math.min(p.width,100)/100;
    const h=horizontal?usableHeight*Math.min(p.height,100)/100:portion;
    const x=horizontal?cursor:left+(usableWidth-w)/2;
    const y=horizontal?top+(usableHeight-h)/2:cursor;
    cursor+=portion+gap;
    return result(p,x,y,w,h);
  });
}

export function dataTextVisible(item,time) {
  return (item.start===null||time>=item.start) && (item.end===null||time<=item.end);
}

// Whether the first attachment has reached its stop by the reattachment time.
export function hasReachedDetach(item,initialWindow,reattachWindow) {
  const anchor=item.anchor,width=initialWindow.right-initialWindow.left;
  const bound=anchor.mode==='attach'?initialWindow.left+width*item.x/100:anchor.time+anchor.offset;
  const initial=(bound-initialWindow.left)/width;
  if(initial<0||initial>1)return false;
  const stop=Math.min(initial,anchor.detachPercent/100);
  return (bound-reattachWindow.left)/(reattachWindow.right-reattachWindow.left)<=stop+1e-10;
}

// Return a horizontal fraction within the plot, or null when not visible.
export function annotationPosition(item,time,window,series,initialWindow=window,reattachWindow=window,{leftPadding=0,rightPadding=0,allowFuture=false}={}) {
  if(!dataTextVisible(item,time))return null;
  if(!item.anchor)return item.x/100;
  const anchorTime=item.anchor.time+item.anchor.offset;
  const attach=item.anchor.mode==='attach';
  if(attach&&time<anchorTime)return item.x/100;
  if(!series.some(s=>s.sourceId===item.anchor.sourceId))return null;
  if(time<anchorTime&&!allowFuture)return null;
  // At attachment, bind to the time-coordinate under the fixed position.
  // This makes seeking deterministic and avoids a jump at the transition.
  const boundTime=attach?initialWindow.left+(initialWindow.right-initialWindow.left)*item.x/100:anchorTime;
  let position=(boundTime-window.left)/(window.right-window.left);
  if(item.anchor.detachPercent!=null){
    const initial=(boundTime-initialWindow.left)/(initialWindow.right-initialWindow.left);
    if(initial<0||initial>1)return null;
    // The window only moves leftward. If the requested stop is already to
    // the right when the anchor appears, keep the initial position instead
    // of jumping the annotation across the plot.
    const stop=Math.min(initial,item.anchor.detachPercent/100);
    if(item.anchor.reattachTime!=null&&time>=item.anchor.reattachTime&&hasReachedDetach(item,initialWindow,reattachWindow)){
      const reattached=reattachWindow.left+(reattachWindow.right-reattachWindow.left)*stop;
      position=(reattached-window.left)/(window.right-window.left);
    }else position=Math.max(position,stop);
  }
  return position>=-leftPadding&&position<=1+rightPadding?position:null;
}

export function validDataFigureSize(width,height) {
  return Number.isInteger(width)&&Number.isInteger(height)&&width>=320&&height>=240&&width<=3840&&height<=3840&&width%2===0&&height%2===0&&width*height<=3840*2160;
}

// Group numbers determine the major axis; array order determines the order
// within each group. Swap complete groups without disturbing their contents.
export function movePlotGroup(plots,group,delta) {
  const groups=[...new Set(plots.map(plot=>plot.group))].sort((a,b)=>a-b);
  const index=groups.indexOf(group),other=groups[index+delta];
  if(index<0||other===undefined)return plots;
  return plots.map(plot=>plot.group===group?{...plot,group:other}:plot.group===other?{...plot,group}:plot)
    .sort((a,b)=>a.group-b.group);
}

export function movePlotWithinGroup(plots,id,delta) {
  const index=plots.findIndex(plot=>plot.id===id);
  if(index<0)return plots;
  const members=plots.map((plot,i)=>plot.group===plots[index].group?i:-1).filter(i=>i>=0);
  const other=members[members.indexOf(index)+delta];
  if(other===undefined)return plots;
  const reordered=[...plots];[reordered[index],reordered[other]]=[reordered[other],reordered[index]];
  return reordered;
}

// Insert alongside the selected plot, or in a new row/column immediately after it.
export function insertPlotRelative(plots,layout,id,direction,newPlot) {
  if(!plots.some(plot=>plot.id===id)||!['beside','below'].includes(direction))return {plots,layout};
  let result=plots.map(plot=>({...plot}));
  if(layout==='vertical'||layout==='horizontal'){
    layout=layout==='vertical'?'rows':'columns';
    result.forEach((plot,index)=>{plot.group=index+1;});
  }else{
    const groups=[...new Set(result.map(plot=>plot.group))].sort((a,b)=>a-b);
    result.forEach(plot=>{plot.group=groups.indexOf(plot.group)+1;});
  }
  const index=result.findIndex(plot=>plot.id===id),group=result[index].group;
  const sameGroup=(layout==='rows'&&direction==='beside')||(layout==='columns'&&direction==='below');
  if(sameGroup)result.splice(index+1,0,{...newPlot,group});
  else{
    result.forEach(plot=>{if(plot.group>group)plot.group++;});
    const insertAt=result.reduce((last,plot,i)=>plot.group===group?i+1:last,0);
    result.splice(insertAt,0,{...newPlot,group:group+1});
  }
  return {plots:result,layout};
}
