import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';

const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const math=mathjax.document('',{InputJax:new TeX({packages:['base','ams','boldsymbol'],formatError(_jax,error){throw error;}}),OutputJax:new SVG({fontCache:'local'})});
const cache=new Map(),listeners=new Set(),MAX_CACHE=256;let cacheLimit=MAX_CACHE;

// Plain labels stay untouched. Pairs of $ delimit inline TeX; \$ is a literal $.
export function parseMathLabel(value) {
  const text=String(value),parts=[];let plain='',hasMath=false;
  for(let i=0;i<text.length;){
    if(text[i]==='\\'&&text[i+1]==='$'){plain+='$';i+=2;continue;}
    if(text[i]!=='$'){plain+=text[i++];continue;}
    let end=i+1;for(;end<text.length;end++){if(text[end]==='\\'&&end+1<text.length){end++;continue;}if(text[end]==='$')break;}
    if(end===text.length||end===i+1)return null;
    if(plain){parts.push({text:plain});plain='';}parts.push({math:text.slice(i+1,end)});hasMath=true;i=end+1;
  }
  if(plain)parts.push({text:plain});return hasMath?parts:null;
}

function escapeText(text){return text.replace(/[\\{}%$#&_~^]/g,char=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','%':'\\%','$':'\\$','#':'\\#','&':'\\&','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[char]));}

export function mathLabelSvg(text) {
  const parts=parseMathLabel(text);if(!parts)return null;
  try{
    const tex=parts.map(part=>part.math!==undefined?`{${part.math}}`:`\\text{${escapeText(part.text)}}`).join('');
    const svg=adaptor.firstChild(math.convert(tex,{display:false}));
    const width=parseFloat(adaptor.getAttribute(svg,'width')),height=parseFloat(adaptor.getAttribute(svg,'height'));
    if(!(width>0&&height>0))return null;
    adaptor.setAttribute(svg,'color','#ffffff');return {svg:adaptor.outerHTML(svg),widthEm:width/2,heightEm:height/2};
  }catch{return null;}
}

function mathAsset(text) {
  if(!parseMathLabel(text))return null;
  if(cache.has(text))return cache.get(text);
  const rendered=mathLabelSvg(text);if(!rendered){cache.set(text,null);if(cache.size>cacheLimit)cache.delete(cache.keys().next().value);return null;}if(typeof Image==='undefined')return null;
  const asset={...rendered,image:new Image(),ready:false,rasters:new Map()};
  asset.promise=new Promise(resolve=>{asset.image.onload=()=>{asset.ready=true;resolve();for(const listener of listeners)listener();};asset.image.onerror=()=>{asset.failed=true;resolve();};});
  asset.image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`;
  cache.set(text,asset);if(cache.size>cacheLimit)cache.delete(cache.keys().next().value);return asset;
}

export function onMathLabelsReady(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
export async function prepareMathLabels(texts){const unique=[...new Set(texts)];cacheLimit=Math.max(cacheLimit,unique.length+MAX_CACHE);await Promise.all(unique.map(text=>mathAsset(text)?.promise));}

function fontPixels(ctx){return Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1]??16);}
export function measurePlotLabel(ctx,text){const asset=mathAsset(text);return asset?.ready?asset.widthEm*fontPixels(ctx):ctx.measureText(text).width;}

// Include glyph overhangs so text is not removed while its last pixels remain
// inside a clipped plot. Math labels use the bounds of their rendered SVG.
export function measurePlotLabelBounds(ctx,text){
  const asset=mathAsset(text),metrics=asset?.ready?null:ctx.measureText(text);
  const width=asset?.ready?asset.widthEm*fontPixels(ctx):metrics.width;
  const left=ctx.textAlign==='center'?width/2:(ctx.textAlign==='right'||ctx.textAlign==='end')?width:0;
  return {left:Math.max(left,metrics?.actualBoundingBoxLeft??0),right:Math.max(width-left,metrics?.actualBoundingBoxRight??0)};
}

export function drawPlotLabel(ctx,text,x,y,maxWidth) {
  const asset=mathAsset(text);if(!asset?.ready){if(maxWidth===undefined)ctx.fillText(text,x,y);else ctx.fillText(text,x,y,maxWidth);return;}
  const size=fontPixels(ctx),width=asset.widthEm*size,height=asset.heightEm*size,drawWidth=maxWidth===undefined?width:Math.min(width,maxWidth);
  const transform=ctx.getTransform(),scale=Math.max(1,Math.hypot(transform.a,transform.b)),color=String(ctx.fillStyle),key=`${size}/${scale}/${color}`;
  let raster=asset.rasters.get(key);if(!raster){
    raster=document.createElement('canvas');const w=width*scale*2,h=height*scale*2,fit=Math.min(1,8192/w,4096/h,Math.sqrt(16000000/(w*h)));raster.width=Math.max(1,Math.ceil(w*fit));raster.height=Math.max(1,Math.ceil(h*fit));
    const paint=raster.getContext('2d');paint.drawImage(asset.image,0,0,raster.width,raster.height);paint.globalCompositeOperation='source-in';paint.fillStyle=color;paint.fillRect(0,0,raster.width,raster.height);
    asset.rasters.set(key,raster);if(asset.rasters.size>16)asset.rasters.delete(asset.rasters.keys().next().value);
  }
  const left=ctx.textAlign==='center'?x-drawWidth/2:(ctx.textAlign==='right'||ctx.textAlign==='end')?x-drawWidth:x;
  const top=ctx.textBaseline==='top'?y:ctx.textBaseline==='bottom'?y-height:ctx.textBaseline==='middle'?y-height/2:y-height*.8;
  ctx.drawImage(raster,left,top,drawWidth,height);
}
