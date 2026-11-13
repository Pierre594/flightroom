import Papa from 'papaparse';

// Each file has one time column followed by numeric series. Empty cells are gaps.
export function parseDataCsv(text, name='Data.csv') {
  const result=Papa.parse(text,{skipEmptyLines:'greedy'});
  if(result.errors.length) throw new Error(`${name}: ${result.errors[0].message}`);
  const [header,...rows]=result.data;
  if(!header || header.length<2 || !['time','time_s'].includes(String(header[0]).replace(/^\uFEFF/,'').trim().toLowerCase())) throw new Error(`${name}: the first column must be named time, followed by data columns (legacy time_s is also accepted).`);
  const names=header.slice(1).map((value,i)=>String(value).trim() || `Column ${i+2}`);
  if(rows.length<2) throw new Error(`${name}: at least two data rows are required.`);
  const times=[], columns=names.map(()=>[]);
  for(const [index,row] of rows.entries()) {
    if(row.length>header.length) throw new Error(`${name}: too many values on row ${index+2}.`);
    const raw=String(row[0] ?? '').trim(), time=Number(raw);
    if(!raw || !Number.isFinite(time)) throw new Error(`${name}: invalid time on row ${index+2}.`);
    if(index && time<=times[index-1]) throw new Error(`${name}: time must be strictly increasing (row ${index+2}).`);
    times.push(time);
    for(let i=0;i<names.length;i++) {
      const cell=String(row[i+1] ?? '').trim();
      if(!cell) {columns[i].push(null);continue;}
      const value=Number(cell);
      if(!Number.isFinite(value)) throw new Error(`${name}: invalid value in ${names[i]} on row ${index+2}.`);
      columns[i].push(value);
    }
  }
  if(!columns.some(column=>column.some(value=>value!==null))) throw new Error(`${name}: no numeric data found.`);
  return {name,times,columns:names.map((column,i)=>({name:column,values:columns[i]}))};
}

export function dataWindow(start, current, span, threshold, end=Infinity) {
  const hasEnd=Number.isFinite(end) && end>start;
  const width=hasEnd?Math.min(span,end-start):span;
  const scroll=start+Math.max(0,current-start-width*threshold);
  const left=hasEnd?Math.min(scroll,end-width):scroll;
  return {left,right:left+width};
}

export function dataRange(series,margin=.1) {
  let min=Infinity,max=-Infinity;
  for(const item of series) if(item.visible) for(const value of item.values) if(value!==null) { min=Math.min(min,value);max=Math.max(max,value); }
  return paddedRange(min,max,margin);
}

function paddedRange(min,max,margin) {
  if(!Number.isFinite(min)) return {min:-1,max:1};
  // A flat signal needs a non-zero reference span even with zero margin.
  const padding=max===min ? Math.max(Math.abs(min)*.2,2)*(.5+margin) : (max-min)*margin;
  return {min:min-padding,max:max+padding};
}

export function subplotRange(series,plot) {
  return plot.yRangeMode==='manual'?{min:plot.yMin,max:plot.yMax}:dataRange(series,(plot.yMargin ?? 10)/100);
}

function lowerBound(times,value) {
  let lo=0,hi=times.length;while(lo<hi){const mid=(lo+hi)>>1;if(times[mid]<value)lo=mid+1;else hi=mid;}return lo;
}

// Match the part of each curve already drawn in the window, including linearly
// interpolated values at its left edge and the playback cursor.
export function visibleSubplotRange(series,plot,window,time,fullRange) {
  if(plot.yRangeMode==='manual')return {min:plot.yMin,max:plot.yMax};
  const margin=(plot.yMargin ?? 10)/100,full=fullRange ?? dataRange(series,margin),left=window.left,right=Math.min(window.right,time);
  if(right<left)return full;
  let min=Infinity,max=-Infinity;
  const include=value=>{if(value!==null&&Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}};
  for(const item of series){
    if(!item.visible)continue;const times=item.times,values=item.values;
    if(!times?.length||right<times[0]||left>times.at(-1))continue;
    const edge=value=>{const i=lowerBound(times,value);if(i>0&&i<times.length&&times[i]!==value&&values[i-1]!==null&&values[i]!==null){const f=(value-times[i-1])/(times[i]-times[i-1]);include(values[i-1]+f*(values[i]-values[i-1]));}};
    edge(left);let i=lowerBound(times,left);for(;i<times.length&&times[i]<=right;i++)include(values[i]);edge(right);
  }
  if(!Number.isFinite(min))return full;
  const visible=paddedRange(min,max,margin),bounded={min:Math.max(full.min,visible.min),max:Math.min(full.max,visible.max)};
  return bounded.min<bounded.max?bounded:full;
}
