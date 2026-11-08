import {dataRange,dataWindow,visibleSubplotRange} from './data-series.js';

const TRANSITION_SECONDS=1;
const SAMPLE_RATE=30;
const MAX_SAMPLES=12000;
const MAX_VALUE_CHECKS=12000000;

function quantized(value,step,round) {
  const units=value/step,nearest=Math.round(units);
  // Avoid moving a value to an adjacent step due to floating-point noise.
  const tolerance=4*Number.EPSILON*Math.max(1,Math.abs(value),step);
  const adjusted=Math.abs(nearest*step-value)<=tolerance ? nearest : round(units);
  const result=adjusted*step;return Number.isFinite(result)?result:value;
}

export function quantizeRange(range,step) {
  return {min:quantized(range.min,step,Math.floor),max:quantized(range.max,step,Math.ceil)};
}

// Build a deterministic low-pass profile once per configuration. A centered
// triangular kernel anticipates changes and settles exactly on constant steps.
export function buildScaleProfile(series,plot,start,end,windowSeconds,threshold,fullRange) {
  if(plot.yRangeMode==='manual'||!(end>start))return null;
  const duration=end-start,step=plot.yStep ?? 1,visible=series.filter(s=>s.visible);
  const estimate=visible.reduce((sum,s)=>sum+Math.min(s.values.length,2+s.values.length*Math.min(1,windowSeconds/duration)),0);
  const limit=Math.max(2,Math.floor(MAX_VALUE_CHECKS/Math.max(1,estimate)));
  const intervals=Math.max(1,Math.min(Math.ceil(duration*SAMPLE_RATE),MAX_SAMPLES-1,limit-1)),dt=duration/intervals;
  const lows=new Float64Array(intervals+1),highs=new Float64Array(intervals+1);
  for(let i=0;i<=intervals;i++){
    const time=i===intervals?end:start+i*dt,window=dataWindow(start,time,windowSeconds,threshold,end);
    const range=quantizeRange(visibleSubplotRange(visible,plot,window,time,fullRange),step);lows[i]=range.min;highs[i]=range.max;
  }
  const radius=Math.max(1,Math.ceil(TRANSITION_SECONDS/(2*dt))),envelopeLow=new Float64Array(lows.length),envelopeHigh=new Float64Array(highs.length),smoothedLow=new Float64Array(lows.length),smoothedHigh=new Float64Array(highs.length);
  // Limit the kernel for short clips, while retaining their endpoint values.
  const size=Math.min(radius,Math.max(1,intervals));
  // Expand each step over the filter's support first. Every weighted sample
  // then contains the current required level, so smoothing cannot contract
  // through a peak while it is still visible.
  for(let i=0;i<lows.length;i++){
    let low=Infinity,high=-Infinity;for(let k=-size;k<=size;k++){const j=Math.max(0,Math.min(intervals,i+k));low=Math.min(low,lows[j]);high=Math.max(high,highs[j]);}
    envelopeLow[i]=low;envelopeHigh[i]=high;
  }
  for(let i=0;i<lows.length;i++){
    let low=0,high=0,total=0;for(let k=-size;k<=size;k++){const j=Math.max(0,Math.min(intervals,i+k)),weight=size+1-Math.abs(k);low+=envelopeLow[j]*weight;high+=envelopeHigh[j]*weight;total+=weight;}
    smoothedLow[i]=low/total;smoothedHigh[i]=high/total;
  }
  return {start,end,dt,lows:smoothedLow,highs:smoothedHigh};
}

export function quantizedSubplotRange(series,plot,window,time,fullRange,profile) {
  if(plot.yRangeMode==='manual')return {min:plot.yMin,max:plot.yMax};
  const step=plot.yStep ?? 1,full=fullRange ?? dataRange(series,(plot.yMargin ?? 10)/100),required=visibleSubplotRange(series,plot,window,time,full),bounds=quantizeRange(full,step);
  if(!profile)return quantizeRange(required,step);
  const position=Math.max(0,Math.min(profile.lows.length-1,(time-profile.start)/profile.dt)),i=Math.floor(position),j=Math.min(i+1,profile.lows.length-1),fraction=position-i;
  const low=profile.lows[i]+(profile.lows[j]-profile.lows[i])*fraction,high=profile.highs[i]+(profile.highs[j]-profile.highs[i])*fraction;
  // Preserve the requested margin even during a rapid change or a data gap.
  const range={min:Math.max(bounds.min,Math.min(low,required.min)),max:Math.min(bounds.max,Math.max(high,required.max))};
  return range.min<range.max?range:quantizeRange(required,step);
}
