import {parseDataCsv,replaceDataSource,dataRange,dataWindow} from './data-series.js';
import {buildScaleProfile,quantizedSubplotRange,quantizeRange} from './data-scaling.js';
import {drawDataChart} from './data-chart.js';
import {videoFrameCount,videoFrameTiming} from './export-video.js';
import {figureLayout,hasReachedDetach,validDataFigureSize,movePlotGroup,movePlotWithinGroup,insertPlotRelative} from './data-layout.js';
import {normalizeProjectName} from './project-names.js';
import {saveProject,openProject,projectNameFromFile,setupProjectLibrary} from './project-storage.js';
import {onMathLabelsReady,prepareMathLabels} from './math-labels.js';

const $=id=>document.getElementById(id);
const palette=['#d07152','#5789a0','#7c69a8','#bf9340','#4c9a78','#c15c7c','#536db0'];
const makeId=()=>globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const element=(tag,options={})=>{const node=document.createElement(tag);Object.assign(node,options);return node;};
const defaultLegend=(size=10)=>({visible:true,position:'top-right',point:null,size});
const newPlot=(labelSize=10)=>({id:makeId(),title:'',titleSize:14,xLabel:'Time (s)',yLabel:'Value',width:100,height:100,group:1,yRangeMode:'auto',yMargin:10,yStep:1,yMin:null,yMax:null,backgroundColor:null,legend:defaultLegend(labelSize)});

export function initDataPanel(onExportState=()=>{}) {
  const state={series:[],plots:[{...newPlot(),id:'plot-1'}],layout:'vertical',texts:[],figureWidth:1920,figureHeight:1080,start:0,end:0,current:0,windowSeconds:10,threshold:.7,title:'Data over time',titleAlign:'left',titleSize:18,labelSize:10,legendPosition:'top-right',legendPoint:null,legendSize:10,showLegend:true,showMarkers:true,backgroundColor:'#ffffff',backgroundOpacity:1,plotRanges:{},fullRanges:{},scaleProfiles:{},playing:false,exporting:false,cancelled:false};
  const canvas=$('data-chart'),plotLists=new Map(),sourceLists=new Map(),plotStatuses=new Map(),seriesToggles=new Map(),legendPositions=new Map(),legendSizes=new Map(),rangeControls=new Map(),collapsedSeries=new Set(),importMessages=new Map();let legendBoxes=[],lastTick=null,animation=0,downloadUrl=null,drag=null,editingText=null,pendingImports=0,loadingProject=false,savingProject=false,dataProjectLibrary=null;
  function updateProjectControls(){const disabled=state.exporting||loadingProject||savingProject;for(const id of ['data-project-name','data-project-input','data-save-project','data-export'])$(id).disabled=disabled;dataProjectLibrary?.setLocked(disabled);}
  function feedback(message,error=false){const node=$('data-feedback');node.hidden=false;node.textContent=message;node.classList.toggle('error',error);}
  function redraw(){refreshVisibleRanges();legendBoxes=drawDataChart(canvas,state,state.current,{ranges:state.plotRanges});$('data-empty').hidden=state.series.length>0;$('data-current').textContent=`${state.current.toFixed(2)} s`;$('data-end').textContent=`${state.end.toFixed(2)} s`;$('data-timeline').value=state.current;}
  onMathLabelsReady(()=>{if(!state.exporting)redraw();});
  function setTime(time){state.current=clamp(time,state.start,state.end);redraw();}
  function pause(){state.playing=false;lastTick=null;cancelAnimationFrame(animation);$('data-play').textContent='▶';$('data-play').setAttribute('aria-label','Play data');}
  function frame(now){if(!state.playing)return;if(lastTick!==null)setTime(state.current+(now-lastTick)/1000*Number($('data-speed').value));lastTick=now;if(state.current>=state.end){pause();return;}animation=requestAnimationFrame(frame);}
  function updateRanges(){state.fullRanges={};state.scaleProfiles={};for(const plot of state.plots){const series=state.series.filter(item=>item.plotId===plot.id),full=dataRange(series,(plot.yMargin??10)/100);state.fullRanges[plot.id]=full;state.scaleProfiles[plot.id]=buildScaleProfile(series,plot,state.start,state.end,state.windowSeconds,state.threshold,full);}refreshVisibleRanges();}
  function refreshVisibleRanges(){const window=dataWindow(state.start,state.current,state.windowSeconds,state.threshold,state.end);state.plotRanges=Object.fromEntries(state.plots.map(plot=>[plot.id,quantizedSubplotRange(state.series.filter(series=>series.plotId===plot.id),plot,window,state.current,state.fullRanges[plot.id],state.scaleProfiles[plot.id])]));updateRangeControls();}
  function updateRangeControls(force=false){
    for(const plot of state.plots){const controls=rangeControls.get(plot.id),range=state.plotRanges[plot.id];if(!controls||!range)continue;const manual=plot.yRangeMode==='manual';
      controls.mode.value=manual?'manual':'auto';controls.margin.disabled=manual;controls.step.disabled=manual;const full=state.fullRanges[plot.id];if(full){const bounds=quantizeRange(full,plot.yStep);controls.full.textContent=`Full-data bounds with margin, rounded to steps: ${Number(bounds.min.toPrecision(6))} to ${Number(bounds.max.toPrecision(6))}.`;}
      for(const [input,value] of [[controls.min,range.min],[controls.max,range.max]]){input.readOnly=!manual;if(force||document.activeElement!==input)input.value=Number(value.toPrecision(10));}
    }
  }
  function bounds(reset=false){
    const old=state.current;
    state.start=state.series.length?Math.min(...state.series.map(s=>s.times[0])):0;
    state.end=state.series.length?Math.max(...state.series.map(s=>s.times.at(-1))):0;
    state.current=reset?state.start:clamp(old,state.start,state.end);updateRanges();
    $('data-timeline').min=state.start;$('data-timeline').max=state.end;$('data-timeline').disabled=state.exporting || state.end<=state.start;redraw();
  }
  function labelFor(title,input){const label=element('label');label.append(element('span',{textContent:title}),input);return label;}
  function renderSeries(){
    $('data-series-count').textContent=`${state.series.length} series`;
    for(const [id,list] of plotLists){
      const count=state.series.filter(s=>s.plotId===id).length,collapsed=collapsedSeries.has(id),toggle=seriesToggles.get(id);
      list.replaceChildren();list.hidden=count>0&&collapsed;toggle.hidden=count===0;
      toggle.textContent=collapsed?`▸ Show ${count} data series`:'▾ Collapse data series';toggle.setAttribute('aria-expanded',String(!collapsed));
      if(!count)list.append(element('div',{className:'cable-empty',textContent:'No data series in this subplot yet.'}));
      const sourceList=sourceLists.get(id),sources=[...new Map(state.series.filter(s=>s.plotId===id).map(s=>[s.sourceId,s])).values()];sourceList.replaceChildren();sourceList.hidden=!sources.length;
      const totals=new Map(),seen=new Map();for(const source of sources)totals.set(source.source,(totals.get(source.source)??0)+1);
      for(const source of sources){
        const number=(seen.get(source.source)??0)+1;seen.set(source.source,number);const name=source.source+(totals.get(source.source)>1?` · import ${number}`:'');
        const row=element('div',{className:'data-source-row'}),nameLabel=element('span',{textContent:name,title:name}),upload=element('label',{className:'data-source-replace',textContent:'Replace CSV'}),input=element('input',{type:'file',accept:'.csv,text/csv',hidden:true});
        const plotIndex=state.plots.findIndex(plot=>plot.id===id);input.setAttribute('aria-label',`Replace CSV ${name} in subplot ${plotIndex+1}`);input.addEventListener('change',event=>replaceSource(event,id,source.sourceId));upload.append(input);row.append(nameLabel,upload);sourceList.append(row);
      }
      if(sources.some(source=>state.series.some(item=>item.sourceId===source.sourceId&&item.plotId!==id)))sourceList.append(element('p',{className:'hint data-source-shared',textContent:'Replacing a shared CSV updates every subplot that uses it.'}));
    }
    for(const series of state.series){
      const list=plotLists.get(series.plotId);if(!list)continue;
      const card=element('div',{className:'data-series-card'}),head=element('div',{className:'data-series-heading'});
      const enabled=element('input',{type:'checkbox',checked:series.visible});enabled.setAttribute('aria-label',`Show ${series.name}`);enabled.addEventListener('change',()=>{series.visible=enabled.checked;updateRanges();redraw();});
      const title=element('strong',{textContent:series.name,title:series.name});const remove=element('button',{type:'button',textContent:'×',title:`Remove ${series.name}`});remove.setAttribute('aria-label',`Remove ${series.name}`);remove.addEventListener('click',()=>{state.series=state.series.filter(item=>item.id!==series.id);pause();bounds();renderSeries();renderTexts();});head.append(enabled,title,remove);
      const source=element('div',{className:'data-source',textContent:series.source,title:series.source});
      const label=element('input',{type:'text',value:series.label,maxLength:120});label.setAttribute('aria-label',`Legend label for ${series.name}`);label.addEventListener('input',()=>{series.label=label.value;redraw();});
      const controls=element('div',{className:'data-series-options'}),color=element('input',{type:'color',value:series.color});color.setAttribute('aria-label',`Color for ${series.name}`);color.addEventListener('input',()=>{series.color=color.value;redraw();});
      const style=element('select');style.setAttribute('aria-label',`Line style for ${series.name}`);for(const [value,text] of [['solid','Solid'],['dashed','Dashed'],['dotted','Dotted']])style.add(new Option(text,value));style.value=series.style;style.addEventListener('change',()=>{series.style=style.value;redraw();});
      const width=element('input',{type:'number',min:'0.5',max:'8',step:'0.5',value:series.width});width.setAttribute('aria-label',`Line width for ${series.name}`);width.addEventListener('change',()=>{const value=Number(width.value);if(!width.value || !Number.isFinite(value) || value<.5 || value>8){width.value=series.width;feedback('Line width must be between 0.5 and 8.',true);return;}series.width=value;redraw();});
      const plotSelect=element('select');plotSelect.setAttribute('aria-label',`Subplot for ${series.name}`);state.plots.forEach((plot,i)=>plotSelect.add(new Option(plot.title||`Subplot ${i+1}`,plot.id)));plotSelect.value=series.plotId;plotSelect.addEventListener('change',()=>{series.plotId=plotSelect.value;updateRanges();renderSeries();redraw();});
      controls.append(labelFor('Color',color),labelFor('Style',style),labelFor('Width',width));card.append(head,source,labelFor('Legend label',label),controls,labelFor('Move to subplot',plotSelect));list.append(card);
    }
    refreshAnnotationSources();
  }
  function plotName(plot,index){return plot.title || `Subplot ${index+1}`;}
  function refreshTextPlots(){
    const select=$('data-text-plot'),previous=select.value;select.replaceChildren();
    state.plots.forEach((plot,i)=>select.add(new Option(plotName(plot,i),plot.id)));
    if(state.plots.some(plot=>plot.id===previous))select.value=previous;
  }
  function renderLayoutMap(){
    const map=$('data-layout-map'),height=1280*state.figureHeight/state.figureWidth;map.replaceChildren();map.style.aspectRatio=`${state.figureWidth} / ${state.figureHeight}`;
    for(const [index,layout] of figureLayout(1280,height,state.plots,state.layout,{labelSize:state.labelSize}).entries()){
      const plot=state.plots[index],cell=layout.cell,button=element('button',{type:'button',className:'data-layout-cell',textContent:plotName(plot,index),title:`Edit ${plotName(plot,index)}`});
      Object.assign(button.style,{left:`${cell.x/1280*100}%`,top:`${cell.y/height*100}%`,width:`${cell.width/1280*100}%`,height:`${cell.height/height*100}%`});
      button.addEventListener('click',()=>{const card=document.getElementById(`data-plot-${plot.id}`);card?.scrollIntoView({block:'nearest',behavior:'smooth'});card?.querySelector('input[type=text]')?.focus({preventScroll:true});});map.append(button);
    }
  }
  function renderPlots(){
    const list=$('data-plot-list');list.replaceChildren();plotLists.clear();sourceLists.clear();plotStatuses.clear();seriesToggles.clear();legendPositions.clear();legendSizes.clear();rangeControls.clear();
    state.plots.forEach((plot,index)=>{
      const card=element('div',{className:'data-plot-card',id:`data-plot-${plot.id}`}),head=element('div',{className:'data-plot-heading'}),actions=element('div');
      head.append(element('strong',{textContent:`Subplot ${index+1}`}));
      const grouped=state.layout==='rows'||state.layout==='columns',rows=state.layout==='rows',horizontal=state.layout==='horizontal';
      const groups=[...new Set(state.plots.map(p=>p.group))].sort((a,b)=>a-b),groupIndex=groups.indexOf(plot.group),members=state.plots.filter(p=>p.group===plot.group),memberIndex=members.indexOf(plot);
      const refresh=()=>{renderPlots();renderSeries();refreshTextPlots();renderTexts();redraw();};
      const addMove=(symbol,title,disabled,move)=>{const button=element('button',{type:'button',textContent:symbol,title});button.setAttribute('aria-label',`${title} for subplot ${index+1}`);button.disabled=disabled;button.addEventListener('click',()=>{move();refresh();});actions.append(button);};
      for(const delta of [-1,1]){
        const direction=grouped?(rows?(delta<0?'up':'down'):(delta<0?'left':'right')):(horizontal?(delta<0?'left':'right'):(delta<0?'up':'down'));
        const symbol={up:'↑',down:'↓',left:'←',right:'→'}[direction];
        const disabled=grouped?groupIndex+delta<0||groupIndex+delta>=groups.length:index+delta<0||index+delta>=state.plots.length;
        addMove(symbol,`Move ${grouped?(rows?'row':'column'):'subplot'} ${direction}`,disabled,()=>{if(grouped)state.plots=movePlotGroup(state.plots,plot.group,delta);else [state.plots[index],state.plots[index+delta]]=[state.plots[index+delta],state.plots[index]];});
      }
      if(grouped&&members.length>1)for(const delta of [-1,1]){
        const direction=rows?(delta<0?'left':'right'):(delta<0?'up':'down'),symbol={up:'↑',down:'↓',left:'←',right:'→'}[direction];
        addMove(symbol,`Move subplot ${direction} within ${rows?'row':'column'}`,memberIndex+delta<0||memberIndex+delta>=members.length,()=>{state.plots=movePlotWithinGroup(state.plots,plot.id,delta);});
      }
      const remove=element('button',{type:'button',textContent:'×',title:'Remove subplot'});remove.disabled=state.plots.length===1;remove.addEventListener('click',()=>{state.plots.splice(index,1);importMessages.delete(plot.id);collapsedSeries.delete(plot.id);const fallback=state.plots[0].id;for(const s of state.series)if(s.plotId===plot.id)s.plotId=fallback;for(const text of state.texts)if(text.plotId===plot.id)text.plotId=fallback;updateRanges();refresh();});actions.append(remove);head.append(actions);
      const form=element('div',{className:'data-form'});
      for(const [key,name,placeholder] of [['title','Subplot title','Optional title'],['xLabel','Horizontal axis','Time (s)'],['yLabel','Vertical axis','Value']]){
        const input=element('input',{type:'text',value:plot[key],placeholder,maxLength:80});input.setAttribute('aria-label',`${name} for subplot ${index+1}`);input.addEventListener('input',()=>{plot[key]=input.value;if(key==='title'){renderSeries();refreshTextPlots();renderTexts();renderLayoutMap();}redraw();});form.append(labelFor(name,input));
        if(key==='title'){const size=element('input',{type:'range',min:'10',max:'32',step:'1',value:plot.titleSize});size.setAttribute('aria-label',`Title size for subplot ${index+1}`);const sizeLabel=labelFor(`Title size · ${plot.titleSize}`,size);size.addEventListener('input',()=>{plot.titleSize=Number(size.value);sizeLabel.querySelector('span').textContent=`Title size · ${size.value}`;renderLayoutMap();redraw();});form.append(sizeLabel);}
      }
      const rangeMode=element('select');rangeMode.setAttribute('aria-label',`Vertical range mode for subplot ${index+1}`);rangeMode.add(new Option('Automatic · smooth steps','auto'));rangeMode.add(new Option('Manual limits','manual'));
      const margin=element('input',{type:'number',min:'0',max:'100',step:'0.5',value:plot.yMargin});margin.setAttribute('aria-label',`Vertical margin percent for subplot ${index+1}`);
      const scaleStep=element('input',{type:'number',min:'0',step:'any',value:plot.yStep});scaleStep.setAttribute('aria-label',`Vertical scale step for subplot ${index+1}`);
      const limits=element('div',{className:'data-size-grid'}),minimum=element('input',{type:'number',step:'any'}),maximum=element('input',{type:'number',step:'any'});minimum.setAttribute('aria-label',`Vertical minimum for subplot ${index+1}`);maximum.setAttribute('aria-label',`Vertical maximum for subplot ${index+1}`);limits.append(labelFor('Minimum',minimum),labelFor('Maximum',maximum));
      const full=element('p',{className:'hint data-range-hint'});full.setAttribute('aria-label',`Full-data bounds for subplot ${index+1}`);rangeControls.set(plot.id,{mode:rangeMode,margin,step:scaleStep,min:minimum,max:maximum,full});
      rangeMode.addEventListener('change',()=>{if(rangeMode.value==='manual'&&(plot.yMin===null||plot.yMax===null)){const range=state.plotRanges[plot.id];plot.yMin=range.min;plot.yMax=range.max;}plot.yRangeMode=rangeMode.value;updateRanges();updateRangeControls(true);redraw();});
      margin.addEventListener('change',()=>{const value=Number(margin.value);if(!margin.value||!Number.isFinite(value)||value<0||value>100){margin.value=plot.yMargin;return feedback('Vertical margin must be between 0% and 100%.',true);}plot.yMargin=value;updateRanges();redraw();});
      scaleStep.addEventListener('change',()=>{const value=Number(scaleStep.value);if(!scaleStep.value||!Number.isFinite(value)||value<=0||!Number.isFinite(1/value)){scaleStep.value=plot.yStep;return feedback('Vertical scale step must be a positive finite number.',true);}plot.yStep=value;updateRanges();redraw();});
      for(const [input,key] of [[minimum,'yMin'],[maximum,'yMax']])input.addEventListener('change',()=>{const value=input.value.trim()===''?NaN:Number(input.value),min=key==='yMin'?value:plot.yMin,max=key==='yMax'?value:plot.yMax;if(!Number.isFinite(min)||!Number.isFinite(max)||!Number.isFinite(max-min)||min>=max){updateRangeControls(true);return feedback('Vertical minimum must be less than maximum; both must be finite.',true);}plot[key]=value;updateRanges();updateRangeControls(true);redraw();});
      form.append(labelFor('Vertical range',rangeMode),labelFor('Margin per side (%)',margin),labelFor('Scale step',scaleStep),limits,full,element('p',{className:'hint data-range-hint',textContent:'Automatic limits move smoothly between step levels and include the displayed data and margin.'}));
      if(state.layout==='rows'||state.layout==='columns'){
        const name=state.layout==='rows'?'Row':'Column';const group=element('input',{type:'number',min:'1',max:'1000',step:'1',value:plot.group});group.setAttribute('aria-label',`${name} for subplot ${index+1}`);
        group.addEventListener('change',()=>{const value=Number(group.value);if(!Number.isInteger(value)||value<1||value>1000){group.value=plot.group;return feedback(`${name} must be a whole number between 1 and 1000.`,true);}plot.group=value;state.plots.sort((a,b)=>a.group-b.group);refresh();});form.append(labelFor(`${name} number`,group));
      }
      const sizes=element('div',{className:'data-size-grid'});
      for(const [key,name] of [['width','Width (%)'],['height','Height (%)']]){
        const input=element('input',{type:'number',min:'10',max:'100',step:'1',value:plot[key]});input.setAttribute('aria-label',`${name} for subplot ${index+1}`);input.addEventListener('change',()=>{const value=Number(input.value);if(!input.value||!Number.isFinite(value)||value<10||value>100){input.value=plot[key];return feedback('Subplot width and height must be between 10% and 100%.',true);}plot[key]=value;renderLayoutMap();redraw();});sizes.append(labelFor(name,input));
      }
      form.append(sizes);
      const backgroundMode=element('select');backgroundMode.setAttribute('aria-label',`Background for subplot ${index+1}`);backgroundMode.add(new Option('Figure background','figure'));backgroundMode.add(new Option('Custom color','custom'));backgroundMode.value=plot.backgroundColor?'custom':'figure';
      const backgroundColor=element('input',{type:'color',value:plot.backgroundColor ?? state.backgroundColor});backgroundColor.setAttribute('aria-label',`Background color for subplot ${index+1}`);
      const colorLabel=labelFor('Plot color',backgroundColor);colorLabel.className='data-plot-color';colorLabel.hidden=!plot.backgroundColor;
      backgroundMode.addEventListener('change',()=>{plot.backgroundColor=backgroundMode.value==='custom'?backgroundColor.value:null;colorLabel.hidden=backgroundMode.value!=='custom';redraw();});
      backgroundColor.addEventListener('input',()=>{plot.backgroundColor=backgroundColor.value;redraw();});form.append(labelFor('Plot background',backgroundMode),colorLabel);
      const placement=element('div',{className:'data-placement-actions'});
      for(const [direction,label] of [['beside','＋ Plot beside'],['below','＋ Plot below']]){const button=element('button',{type:'button',textContent:label});button.setAttribute('aria-label',`${label} subplot ${index+1}`);button.addEventListener('click',()=>{const result=insertPlotRelative(state.plots,state.layout,plot.id,direction,newPlot(state.labelSize));state.plots=result.plots;state.layout=result.layout;$('data-layout').value=state.layout;updateRanges();refresh();});placement.append(button);}
      const legend=plot.legend ??=defaultLegend(state.labelSize),legendSettings=element('details',{className:'data-legend-settings'}),legendTitle=element('summary',{textContent:'Legend'}),legendForm=element('div',{className:'data-form'});
      const show=element('input',{type:'checkbox',checked:legend.visible});show.setAttribute('aria-label',`Show legend for subplot ${index+1}`);show.addEventListener('change',()=>{legend.visible=show.checked;renderLayoutMap();redraw();});
      const showLabel=element('label',{className:'data-legend-show'});showLabel.append(show,document.createTextNode(' Show legend'));
      const position=element('select');position.setAttribute('aria-label',`Legend position for subplot ${index+1}`);for(const [value,label] of [['top-right','Top right'],['top-left','Top left'],['bottom-right','Bottom right'],['bottom-left','Bottom left'],['outside-top','Above plot · horizontal'],['custom','Custom · dragged']])position.add(new Option(label,value));position.value=legend.position;legendPositions.set(plot.id,position);position.addEventListener('change',()=>{legend.position=position.value;if(legend.position==='custom'&&!legend.point)legend.point={x:.5,y:.1};renderLayoutMap();redraw();});
      const legendSize=element('input',{type:'number',min:'10',max:'36',step:'1',value:legend.size});legendSize.setAttribute('aria-label',`Legend text size for subplot ${index+1}`);legendSizes.set(plot.id,legendSize);legendSize.addEventListener('change',()=>{const value=Number(legendSize.value);if(!Number.isFinite(value)||value<10||value>36){legendSize.value=legend.size;return feedback('Legend size must be between 10 and 36.',true);}legend.size=value;renderLayoutMap();redraw();});
      legendForm.append(showLabel,labelFor('Position',position),labelFor('Text size',legendSize));legendSettings.append(legendTitle,legendForm);
      const upload=element('label',{className:'add-button data-import data-plot-import'});upload.append(element('span',{textContent:'＋'}),document.createTextNode(' Add CSV files'));
      const fileInput=element('input',{type:'file',multiple:true,hidden:true});fileInput.setAttribute('aria-label',`Add CSV files to subplot ${index+1}`);fileInput.addEventListener('change',event=>importData(event,plot.id));upload.append(fileInput);
      const status=element('p',{className:'data-import-feedback',hidden:true});status.setAttribute('role','status');plotStatuses.set(plot.id,status);
      const saved=importMessages.get(plot.id);if(saved){status.hidden=false;status.textContent=saved.text;status.classList.toggle('error',saved.error);}
      const toggle=element('button',{type:'button',className:'data-series-toggle',hidden:true});toggle.setAttribute('aria-controls',`data-series-${plot.id}`);toggle.addEventListener('click',()=>{if(collapsedSeries.has(plot.id))collapsedSeries.delete(plot.id);else collapsedSeries.add(plot.id);renderSeries();});seriesToggles.set(plot.id,toggle);
      const sourceList=element('div',{className:'data-source-list',hidden:true});sourceList.setAttribute('aria-label',`CSV files in subplot ${index+1}`);sourceLists.set(plot.id,sourceList);
      const seriesList=element('div',{className:'data-series-list data-plot-series',id:`data-series-${plot.id}`});plotLists.set(plot.id,seriesList);
      card.append(head,form,placement,legendSettings,upload,status,sourceList,toggle,seriesList);list.append(card);
    });
    updateRangeControls(true);
    renderLayoutMap();
  }
  function dataSources(){return [...new Map(state.series.map(s=>[s.sourceId,s])).values()];}
  function refreshAnnotationSources(){
    const select=$('data-anchor-source'),previous=select.value,editing=state.texts.find(item=>item.id===editingText),sources=dataSources();select.replaceChildren();
    const totals=new Map(),counts=new Map();for(const source of sources)totals.set(source.source,(totals.get(source.source)??0)+1);
    for(const source of sources){const number=(counts.get(source.source)??0)+1;counts.set(source.source,number);const suffix=totals.get(source.source)>1?` · import ${number}`:'';select.add(new Option(`${source.source} (${source.times[0]}–${source.times.at(-1)} s)${suffix}`,source.sourceId));}
    if(editing?.anchor&&!sources.some(s=>s.sourceId===editing.anchor.sourceId))select.add(new Option(`Missing: ${editing.anchor.sourceName}`,editing.anchor.sourceId));
    if([...select.options].some(option=>option.value===previous))select.value=previous;
    if(!select.options.length)select.add(new Option('No CSV file loaded',''));
    updateAnnotationSourceHint();
  }
  function updateAnnotationSourceHint(){const source=dataSources().find(s=>s.sourceId===$('data-anchor-source').value);$('data-anchor-help').textContent=source?`Available timestamps: ${source.times[0]}–${source.times.at(-1)} s. The offset moves the anchor in time.`:'Select a loaded CSV file. Following requires the source to be present.';}
  function syncAnnotationForm(){
    const text=$('data-annotation-type').value==='text',mode=$('data-anchor-mode').value,anchored=mode!=='fixed',fixedPosition=mode!=='time';
    for(const [id,visible] of [['data-text-value-field',text],['data-text-align-field',text],['data-text-y-field',text],['data-text-size-field',text],['data-text-x-field',fixedPosition],['data-line-style-field',!text],['data-line-width-field',!text],['data-anchor-fields',anchored],['data-anchor-reattach-field',anchored],['data-anchor-reattach-help',anchored]])$(id).hidden=!visible;
    for(const [id,required] of [['data-text-value',text],['data-text-align',text],['data-text-y',text],['data-text-size',text],['data-text-x',fixedPosition],['data-line-width',!text],['data-anchor-source',anchored],['data-anchor-time',anchored],['data-anchor-offset',anchored]])$(id).required=required;
    for(const [id,enabled] of [['data-text-value',text],['data-text-align',text],['data-text-y',text],['data-text-size',text],['data-text-x',fixedPosition],['data-line-style',!text],['data-line-width',!text],['data-anchor-source',anchored],['data-anchor-time',anchored],['data-anchor-offset',anchored],['data-anchor-detach',anchored],['data-anchor-reattach',anchored]])$(id).disabled=!enabled;
    $('data-text-save').textContent=editingText?'Update annotation':`＋ Add ${text?'text':'line'}`;
  }
  function resetTextForm(){editingText=null;$('data-text-form').reset();$('data-text-cancel').hidden=true;refreshTextPlots();refreshAnnotationSources();syncAnnotationForm();}
  function renderTexts(){
    const list=$('data-text-list');list.replaceChildren();$('data-text-count').textContent=String(state.texts.length).padStart(2,'0');
    for(const item of state.texts){
      const card=element('div',{className:'data-text-item'}),title=element('strong',{textContent:item.type==='line'?'Vertical line':item.text});
      const index=state.plots.findIndex(p=>p.id===item.plotId),source=item.anchor&&dataSources().find(s=>s.sourceId===item.anchor.sourceId),position=item.anchor?`${item.anchor.mode==='attach'?`Fixed at ${item.x}% until `:''}${source?'':'Missing CSV: '}${item.anchor.sourceName} · ${item.anchor.time} s ${item.anchor.offset<0?'−':'+'} ${Math.abs(item.anchor.offset)} s${item.anchor.detachPercent!=null?` · stops at ${item.anchor.detachPercent}%`:''}${item.anchor.reattachTime!=null?` · reattaches at ${item.anchor.reattachTime} s`:''}`:`Fixed at ${item.x}%`,description=element('div',{className:'hint',textContent:`${plotName(state.plots[index],index)} · ${position} · ${item.start===null?'Start':`${item.start} s`} – ${item.end===null?'End':`${item.end} s`}`}),actions=element('div',{className:'data-text-actions'});
      const edit=element('button',{type:'button',textContent:'Edit'});edit.addEventListener('click',()=>{editingText=item.id;for(const [id,value] of [['data-annotation-type',item.type??'text'],['data-text-value',item.text??''],['data-text-align',item.align??'left'],['data-text-plot',item.plotId],['data-text-x',item.x],['data-text-y',item.y],['data-text-size',item.size],['data-text-color',item.color],['data-line-style',item.style??'solid'],['data-line-width',item.width??2],['data-anchor-mode',item.anchor?(item.anchor.mode==='attach'?'attach':'time'):'fixed'],['data-anchor-time',item.anchor?.time??''],['data-anchor-offset',item.anchor?.offset??0],['data-anchor-detach',item.anchor?.detachPercent??''],['data-anchor-reattach',item.anchor?.reattachTime??''],['data-text-start',item.start??''],['data-text-end',item.end??'']])$(id).value=value;refreshAnnotationSources();if(item.anchor)$('data-anchor-source').value=item.anchor.sourceId;updateAnnotationSourceHint();syncAnnotationForm();$('data-text-cancel').hidden=false;$(item.type==='line'?'data-annotation-type':'data-text-value').focus();});
      const remove=element('button',{type:'button',textContent:'Remove'});remove.addEventListener('click',()=>{state.texts=state.texts.filter(t=>t.id!==item.id);if(editingText===item.id)resetTextForm();renderTexts();redraw();});actions.append(edit,remove);card.append(title,description,actions);list.append(card);
    }
  }
  $('data-add-plot').addEventListener('click',()=>{const grouped=state.layout==='rows'||state.layout==='columns',group=grouped?state.plots.at(-1).group:Math.min(1000,Math.max(...state.plots.map(p=>p.group))+1);state.plots.push({...newPlot(state.labelSize),group});updateRanges();renderPlots();renderSeries();refreshTextPlots();renderTexts();redraw();});
  $('data-layout').addEventListener('change',event=>{state.layout=event.target.value;if(state.layout==='rows'||state.layout==='columns')state.plots.sort((a,b)=>a.group-b.group);renderPlots();renderSeries();refreshTextPlots();renderTexts();redraw();});
  $('data-text-cancel').addEventListener('click',resetTextForm);
  for(const id of ['data-annotation-type','data-anchor-mode'])$(id).addEventListener('change',syncAnnotationForm);
  $('data-anchor-source').addEventListener('change',updateAnnotationSourceHint);
  $('data-text-form').addEventListener('submit',event=>{
    event.preventDefault();const type=$('data-annotation-type').value,mode=$('data-anchor-mode').value,anchored=mode!=='fixed',value=type==='text'?$('data-text-value').value.trim():'',plotId=$('data-text-plot').value,x=mode==='time'?10:Number($('data-text-x').value),y=type==='text'?Number($('data-text-y').value):15,size=type==='text'?Number($('data-text-size').value):22,color=$('data-text-color').value,align=type==='text'?$('data-text-align').value:'left',width=type==='line'?Number($('data-line-width').value):2,style=type==='line'?$('data-line-style').value:'solid';
    const readTime=id=>$(id).value.trim()===''?null:Number($(id).value),start=readTime('data-text-start'),end=readTime('data-text-end');
    if((type==='text'&&!value)||!['left','center','right'].includes(align)||!state.plots.some(p=>p.id===plotId)||![x,y,size,width].every(Number.isFinite)||x<0||x>100||y<0||y>100||size<8||size>100||width<.5||width>8||(start!==null&&!Number.isFinite(start))||(end!==null&&!Number.isFinite(end))||(start!==null&&end!==null&&end<start))return feedback('Enter valid annotation settings and time range.',true);
    let anchor=null;if(anchored){
      const source=dataSources().find(s=>s.sourceId===$('data-anchor-source').value),time=readTime('data-anchor-time'),offset=readTime('data-anchor-offset'),detachPercent=readTime('data-anchor-detach'),reattachTime=readTime('data-anchor-reattach');
      if(!source||time===null||offset===null||!Number.isFinite(time)||!Number.isFinite(offset)||time<source.times[0]||time>source.times.at(-1)||!Number.isFinite(time+offset))return feedback('Choose a loaded CSV and a timestamp within its range, with a valid offset.',true);
      if(detachPercent!==null&&(!Number.isFinite(detachPercent)||detachPercent<0||detachPercent>100))return feedback('The detach position must be between 0% and 100%.',true);
      if(reattachTime!==null){
        if(!Number.isFinite(reattachTime)||reattachTime<time+offset||detachPercent===null)return feedback('Choose a detach position and a reattach timestamp at or after the attachment timestamp plus offset.',true);
        const initialWindow=dataWindow(state.start,Math.max(state.start,time+offset),state.windowSeconds,state.threshold,state.end),reattachWindow=dataWindow(state.start,reattachTime,state.windowSeconds,state.threshold,state.end);
        if(!hasReachedDetach({x,anchor:{time,offset,mode,detachPercent}},initialWindow,reattachWindow))return feedback('The annotation has not reached its detach position by the reattach timestamp. Choose a later timestamp or an earlier detach position.',true);
      }
      anchor={sourceId:source.sourceId,sourceName:source.source,time,offset,detachPercent,reattachTime,...(mode==='attach'?{mode:'attach'}:{})};
    }
    const item={id:editingText??makeId(),type,text:value,align,plotId,x,y,size,color,style,width,start,end,anchor},index=state.texts.findIndex(t=>t.id===editingText);if(index<0)state.texts.push(item);else state.texts[index]=item;resetTextForm();renderTexts();redraw();
  });
  function syncFields(){
    for(const [id,value] of [['data-window',state.windowSeconds],['data-threshold',state.threshold*100],['data-title',state.title],['data-title-align',state.titleAlign],['data-title-size',state.titleSize],['data-label-size',state.labelSize],['data-layout',state.layout],['data-figure-width',state.figureWidth],['data-figure-height',state.figureHeight],['data-background-color',state.backgroundColor],['data-background-opacity',state.backgroundOpacity*100]]) $(id).value=value;
    $('data-title-size-value').textContent=state.titleSize;$('data-label-size-value').textContent=state.labelSize;
    $('data-threshold-value').textContent=`${Math.round(state.threshold*100)}%`;$('data-background-opacity-value').textContent=`${Math.round(state.backgroundOpacity*100)}%`;$('data-show-markers').checked=state.showMarkers;
  }
  async function replaceSource(event,plotId,sourceId){
    const file=event.target.files[0];if(!file)return;
    if(pendingImports||loadingProject||savingProject||state.exporting){event.target.value='';return feedback('Wait for the current data operation to finish.',true);}
    pendingImports++;
    try{
      const parsed=parseDataCsv(await file.text(),file.name);
      if(!state.plots.some(plot=>plot.id===plotId))throw new Error('The subplot was removed before the CSV finished loading.');
      const updated=replaceDataSource(state.series,sourceId,parsed,(column,index)=>({id:makeId(),plotId,label:column.name,color:palette[(state.series.length+index)%palette.length],style:'solid',width:2.5,visible:true}));
      state.series=updated.series;
      for(const item of state.texts)if(item.anchor?.sourceId===sourceId)item.anchor.sourceName=parsed.name;
      const outside=state.texts.filter(item=>item.anchor?.sourceId===sourceId&&(item.anchor.time<parsed.times[0]||item.anchor.time>parsed.times.at(-1))).length;
      pause();bounds();renderSeries();renderTexts();
      const details=[`${updated.matched} matched`,`${updated.added} added`,`${updated.removed} removed`].join(', ');
      const message=`Updated ${parsed.name} across its subplots: ${details}.${outside?` ${outside} annotation${outside===1?' has':'s have'} a timestamp outside the new CSV range; review the annotation settings.`:''}`;
      importMessages.set(plotId,{text:message,error:false});const status=plotStatuses.get(plotId);if(status){status.hidden=false;status.textContent=message;status.classList.remove('error');}feedback(message);
    }catch(error){
      const message=`Could not replace CSV: ${error.message}`;if(state.plots.some(plot=>plot.id===plotId))importMessages.set(plotId,{text:message,error:true});const status=plotStatuses.get(plotId);if(status){status.hidden=false;status.textContent=message;status.classList.add('error');}feedback(message,true);
    }finally{pendingImports--;event.target.value='';}
  }
  async function importData(event,plotId){
    const files=[...event.target.files],errors=[];let added=0,resetTime=false;
    if(!files.length)return;if(loadingProject||savingProject){event.target.value='';return feedback('Wait for the graph project operation to finish.',true);}pendingImports++;
    try{
      for(const file of files)try{
        const parsed=parseDataCsv(await file.text(),file.name);
        if(!state.plots.some(plot=>plot.id===plotId)){errors.push(`${file.name}: the subplot was removed before import finished.`);continue;}
        if(!state.series.length)resetTime=true;
        const sourceId=makeId();for(const column of parsed.columns) {state.series.push({id:makeId(),sourceId,plotId,source:parsed.name,name:column.name,label:column.name,times:parsed.times,values:column.values,color:palette[state.series.length%palette.length],style:'solid',width:2.5,visible:true});added++;}
      }catch(error){errors.push(error.message);}
      if(added){pause();bounds(resetTime);renderSeries();}
      const message=errors.length?errors.join(' '):`Added ${added} data series.`;
      if(state.plots.some(plot=>plot.id===plotId))importMessages.set(plotId,{text:message,error:Boolean(errors.length)});
      const status=plotStatuses.get(plotId);if(status){status.hidden=false;status.textContent=message;status.classList.toggle('error',Boolean(errors.length));}
      feedback(message,Boolean(errors.length));
    }finally{pendingImports--;event.target.value='';}
  }
  $('data-window').addEventListener('change',event=>{const n=Number(event.target.value);if(!Number.isFinite(n)||n<.01){event.target.value=state.windowSeconds;return feedback('Window duration must be at least 0.01 seconds.',true);}state.windowSeconds=n;updateRanges();redraw();});
  $('data-threshold').addEventListener('input',event=>{state.threshold=Number(event.target.value)/100;$('data-threshold-value').textContent=`${event.target.value}%`;updateRanges();redraw();});
  $('data-title').addEventListener('input',event=>{state.title=event.target.value;redraw();});
  $('data-title-align').addEventListener('change',event=>{state.titleAlign=event.target.value;redraw();});
  $('data-title-size').addEventListener('input',event=>{state.titleSize=Number(event.target.value);$('data-title-size-value').textContent=event.target.value;redraw();});
  $('data-label-size').addEventListener('input',event=>{state.labelSize=Number(event.target.value);state.legendSize=state.labelSize;$('data-label-size-value').textContent=event.target.value;for(const plot of state.plots){plot.legend.size=state.labelSize;const input=legendSizes.get(plot.id);if(input)input.value=state.labelSize;}renderLayoutMap();redraw();});
  $('data-show-markers').addEventListener('change',event=>{state.showMarkers=event.target.checked;redraw();});
  $('data-background-color').addEventListener('input',event=>{state.backgroundColor=event.target.value;redraw();});
  $('data-background-opacity').addEventListener('input',event=>{state.backgroundOpacity=Number(event.target.value)/100;$('data-background-opacity-value').textContent=`${event.target.value}%`;redraw();});
  function resizeFigure(width,height){
    if(!validDataFigureSize(width,height)){feedback('Figure dimensions must be even pixels: width 320–3840, height 240–3840, up to 8.3 megapixels.',true);$('data-figure-width').value=state.figureWidth;$('data-figure-height').value=state.figureHeight;return false;}
    state.figureWidth=width;state.figureHeight=height;canvas.width=width;canvas.height=height;$('data-figure-width').value=width;$('data-figure-height').value=height;
    const ratio=width/height;$('data-frame-format').value=Math.abs(ratio-16/9)<.001?'16:9':Math.abs(ratio-4/3)<.001?'4:3':'custom';$('data-export-resolution').value=[540,720,1080].includes(height)?String(height):'custom';renderLayoutMap();redraw();summary();return true;
  }
  for(const id of ['data-figure-width','data-figure-height'])$(id).addEventListener('change',()=>resizeFigure(Number($('data-figure-width').value),Number($('data-figure-height').value)));
  $('data-frame-format').addEventListener('change',event=>{if(event.target.value==='custom')return;const ratio=event.target.value==='4:3'?4/3:16/9;resizeFigure(Math.round(state.figureHeight*ratio/2)*2,state.figureHeight);});
  $('data-export-resolution').addEventListener('change',event=>{if(event.target.value==='custom')return;const height=Number(event.target.value),ratio=state.figureWidth/state.figureHeight;resizeFigure(Math.round(height*ratio/2)*2,height);});
  $('data-play').addEventListener('click',()=>{if(state.end<=state.start)return feedback('Add a CSV file with a time range first.',true);if(state.playing)return pause();if(state.current>=state.end)setTime(state.start);state.playing=true;lastTick=null;$('data-play').textContent='❚❚';$('data-play').setAttribute('aria-label','Pause data');animation=requestAnimationFrame(frame);});
  $('data-restart').addEventListener('click',()=>{pause();setTime(state.start);});
  $('data-timeline').addEventListener('input',event=>{pause();setTime(Number(event.target.value));});
  function canvasPoint(event){const box=canvas.getBoundingClientRect();return {x:(event.clientX-box.left)/box.width*1280,y:(event.clientY-box.top)/box.height*(1280*canvas.height/canvas.width)};}
  canvas.addEventListener('pointerdown',event=>{if(state.exporting)return;const p=canvasPoint(event),box=legendBoxes.findLast(box=>p.x>=box.x&&p.x<=box.x+box.width&&p.y>=box.y&&p.y<=box.y+box.height);if(!box)return;event.preventDefault();drag={id:event.pointerId,plotId:box.plotId,plot:box.plot,x:p.x-box.x,y:p.y-box.y};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const plot=state.plots.find(plot=>plot.id===drag.plotId);if(!plot)return;const p=canvasPoint(event),area=drag.plot;plot.legend.position='custom';plot.legend.point={x:clamp((p.x-drag.x-area.left)/(area.right-area.left),0,1),y:clamp((p.y-drag.y-area.top)/(area.bottom-area.top),0,1)};const select=legendPositions.get(plot.id);if(select)select.value='custom';redraw();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{if(drag?.id===event.pointerId)drag=null;});

  function lock(locked){state.exporting=locked;$('data-settings').disabled=locked;for(const id of ['data-frame-format','data-export-format','data-export-resolution','data-export-fps','data-restart','data-play','data-timeline','data-speed'])$(id).disabled=locked;updateProjectControls();onExportState(locked);if(!locked)bounds();}
  function download(blob,name){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(blob);const link=$('data-download');link.href=downloadUrl;link.download=name;link.textContent=`Download ${name}`;link.hidden=false;link.click();}
  function summary(){const format=$('data-export-format').value,label=format==='webm-alpha'?'WEBM + ALPHA':format==='prores-4444'?'PRORES 4444 + ALPHA':format.toUpperCase();$('data-export-status').textContent=`${label} · ${state.figureWidth} × ${state.figureHeight} · ${$('data-export-fps').value} FPS`;}
  for(const id of ['data-export-format','data-export-resolution','data-export-fps'])$(id).addEventListener('change',summary);
  $('data-cancel').addEventListener('click',()=>{state.cancelled=true;$('data-cancel').disabled=true;feedback('Cancelling export…');});
  async function request(path,options={}){const response=await fetch(path,options),json=(response.headers.get('content-type')??'').includes('application/json');if(!json){if(path.endsWith('/start'))return null;throw new Error('Unexpected encoder response.');}const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Encoder failed.');return payload;}
  async function localVideo(target,width,height,fps,duration,frames,format){
    const transparent=format==='webm-alpha'||format==='prores-4444';
    const root='/__flightroom_export';let id=null,finished=false;const mime=transparent?'image/png':'image/jpeg';
    try{
      const session=await request(`${root}/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({width,height,fps,purpose:'data',frameCodec:transparent?'png':'jpeg',format,filename:format==='prores-4444'?'data-animation.mov':transparent?'data-animation.webm':'data-animation.mp4'})});if(!session?.id)return null;id=session.id;
      for(let i=0;i<frames;i++){
        if(state.cancelled)return null;const timing=videoFrameTiming(i,duration,fps);drawDataChart(target,state,i===frames-1?state.end:state.start+timing.timestamp,{opaque:!transparent});
        const image=await new Promise(resolve=>target.toBlob(resolve,mime,transparent?undefined:.96));if(!image || image.type!==mime)throw new Error('Could not capture the chart frame.');
        await request(`${root}/frame/${id}`,{method:'POST',headers:{'Content-Type':mime},body:image});if(i%5===0||i===frames-1){feedback(`Rendering data video · ${Math.round((i+1)/frames*100)}%`);await new Promise(resolve=>setTimeout(resolve,0));}
      }
      if(state.cancelled)return null;$('data-cancel').disabled=true;feedback('Finalizing data video…');const result=await request(`${root}/finish/${id}`,{method:'POST'});finished=true;return result.url;
    }finally{if(id&&!finished)try{await fetch(`${root}/cancel/${id}`,{method:'POST'});}catch{}}
  }
  $('data-export').addEventListener('click',async()=>{
    if(state.exporting)return;if(pendingImports||loadingProject||savingProject)return feedback('Wait for data loading to finish before exporting.',true);if(state.end<=state.start)return feedback('Add a CSV file with a time range first.',true);
    pause();state.cancelled=false;lock(true);$('data-cancel').hidden=false;$('data-cancel').disabled=false;$('data-download').hidden=true;
    const width=state.figureWidth,outputHeight=state.figureHeight,fps=Number($('data-export-fps').value),format=$('data-export-format').value,duration=state.end-state.start,frames=videoFrameCount(duration,fps);
    const target=document.createElement('canvas');target.width=width;target.height=outputHeight;let output=null,localError=null;
    try{
      feedback('Preparing data video…');
      await prepareMathLabels([state.title,...state.plots.flatMap(plot=>[plot.title,plot.xLabel,plot.yLabel]),...state.series.map(series=>series.label),...state.texts.map(item=>item.text)]);if(state.cancelled)return feedback('Export cancelled.');
      const transparent=format==='webm-alpha'||format==='prores-4444';
      if(format==='mp4'||transparent){
        try{const url=await localVideo(target,width,outputHeight,fps,duration,frames,format);if(state.cancelled)return feedback('Export cancelled.');if(url){const link=$('data-download'),name=format==='prores-4444'?'data-animation.mov':transparent?'data-animation.webm':'data-animation.mp4';if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}link.href=url;link.download=name;link.textContent=`Download ${name}`;link.hidden=false;link.click();return feedback(format==='prores-4444'?'ProRes 4444 data video ready.':transparent?'Transparent data WebM ready.':'Data MP4 ready.');}}catch(error){localError=error;if(state.cancelled)return feedback('Export cancelled.');}
      }
      if(format==='prores-4444')throw new Error('ProRes 4444 requires the local export server and FFmpeg with the prores_ks encoder.');
      const {Output,Mp4OutputFormat,WebMOutputFormat,BufferTarget,CanvasSource,Quality,canEncodeVideo}=await import('mediabunny');const codec=format==='mp4'?'avc':'vp9';
      if(!await canEncodeVideo(codec,{width,height:outputHeight,frameRate:fps,alpha:transparent?'keep':'discard'}))throw new Error(format==='mp4'?'MP4 encoding is unavailable. Install FFmpeg and restart the app, or choose WebM.':transparent?'Transparent WebM encoding is unavailable. Install FFmpeg with VP9 support or use a supported browser.':'WebM encoding is unavailable in this browser.');
      if(state.cancelled)return feedback('Export cancelled.');const result=new BufferTarget();output=new Output({format:format==='mp4'?new Mp4OutputFormat():new WebMOutputFormat(),target:result});const source=new CanvasSource(target,{codec,alpha:transparent?'keep':'discard',quality:new Quality({bitrate:Math.max(1500000,Math.round(12000000*width*outputHeight/(1920*1080)))})});output.addVideoTrack(source);await output.start();
      for(let i=0;i<frames;i++){if(state.cancelled){await output.cancel();return feedback('Export cancelled.');}const timing=videoFrameTiming(i,duration,fps);drawDataChart(target,state,i===frames-1?state.end:state.start+timing.timestamp,{opaque:!transparent});await source.add(timing.timestamp,timing.duration);if(i%5===0||i===frames-1){feedback(`Rendering data video · ${Math.round((i+1)/frames*100)}%`);await new Promise(resolve=>setTimeout(resolve,0));}}
      if(state.cancelled){await output.cancel();return feedback('Export cancelled.');}$('data-cancel').disabled=true;feedback('Finalizing data video…');source.close();await output.finalize();if(!result.buffer)throw new Error('The encoder produced no video.');download(new Blob([result.buffer],{type:format==='mp4'?'video/mp4':'video/webm'}),`data-animation.${format==='mp4'?'mp4':'webm'}`);feedback('Data video ready.');
    }catch(error){if(output&&(output.state==='started'||output.state==='pending'))try{await output.cancel();}catch{}feedback(`Could not export data video: ${error.message}${localError?` Local encoder: ${localError.message}`:''}`,true);}
    finally{$('data-cancel').hidden=true;lock(false);summary();}
  });

  $('data-save-project').addEventListener('click',async()=>{
    if(state.exporting||savingProject)return;if(pendingImports||loadingProject)return feedback('Wait for data loading to finish before saving.',true);
    try{const name=normalizeProjectName($('data-project-name').value);savingProject=true;updateProjectControls();feedback('Saving graph project…');
    const project={type:'flightroom-data',version:1,series:state.series,plots:state.plots,layout:state.layout,texts:state.texts,figureWidth:state.figureWidth,figureHeight:state.figureHeight,current:state.current,windowSeconds:state.windowSeconds,threshold:state.threshold,title:state.title,titleAlign:state.titleAlign,titleSize:state.titleSize,labelSize:state.labelSize,xLabel:state.plots[0].xLabel,yLabel:state.plots[0].yLabel,legendPosition:state.legendPosition,legendPoint:state.legendPoint,legendSize:state.legendSize,showLegend:state.showLegend,showMarkers:state.showMarkers,backgroundColor:state.backgroundColor,backgroundOpacity:state.backgroundOpacity,frameFormat:$('data-frame-format').value,exportFormat:$('data-export-format').value,exportResolution:state.figureHeight,exportFps:Number($('data-export-fps').value)};
    $('data-project-name').value=await saveProject(name,project);feedback(`Graph project saved to projects/${name}.json.`);
    }catch(error){feedback(`Could not save graph project: ${error.message}`,true);}finally{savingProject=false;updateProjectControls();}
  });
  async function loadDataProject(file,name){
    try{
      const p=JSON.parse(await file.text());
      if(p.type!=='flightroom-data'||p.version!==1||!Array.isArray(p.series)||!Number.isFinite(p.windowSeconds)||p.windowSeconds<.01||!Number.isFinite(p.threshold)||p.threshold<.1||p.threshold>.95||!Number.isFinite(p.legendSize)||p.legendSize<10||p.legendSize>36||!['top-left','top-right','bottom-left','bottom-right','custom'].includes(p.legendPosition)||typeof p.title!=='string'||p.title.length>120)throw new Error('Invalid graph project settings.');
      if((p.titleAlign!==undefined&&!['left','center','right'].includes(p.titleAlign))||(p.titleSize!==undefined&&(!Number.isInteger(p.titleSize)||p.titleSize<10||p.titleSize>48))||(p.labelSize!==undefined&&(!Number.isInteger(p.labelSize)||p.labelSize<10||p.labelSize>36)))throw new Error('Invalid chart text settings.');
      if((p.backgroundColor!==undefined && (typeof p.backgroundColor!=='string'||!/^#[0-9a-f]{6}$/i.test(p.backgroundColor))) || (p.backgroundOpacity!==undefined && (!Number.isFinite(p.backgroundOpacity)||p.backgroundOpacity<0||p.backgroundOpacity>1)))throw new Error('Invalid background settings.');
      if(p.legendPoint!==null && (!p.legendPoint || !Number.isFinite(p.legendPoint.x)||!Number.isFinite(p.legendPoint.y)||p.legendPoint.x<0||p.legendPoint.x>1||p.legendPoint.y<0||p.legendPoint.y>1))throw new Error('Invalid legend position.');
      const savedPlots=p.plots ?? [{id:'plot-1',title:'',xLabel:p.xLabel ?? 'Time (s)',yLabel:p.yLabel ?? 'Value',width:100,height:100}];
      if(!Array.isArray(savedPlots)||!savedPlots.length||new Set(savedPlots.map(plot=>plot?.id)).size!==savedPlots.length||savedPlots.some(plot=>!plot||typeof plot.id!=='string'||!plot.id||![plot.title,plot.xLabel,plot.yLabel].every(v=>typeof v==='string'&&v.length<=80)||![plot.width,plot.height].every(v=>Number.isFinite(v)&&v>=10&&v<=100)||(plot.group!==undefined&&(!Number.isInteger(plot.group)||plot.group<1||plot.group>1000))||(plot.titleSize!==undefined&&(!Number.isInteger(plot.titleSize)||plot.titleSize<10||plot.titleSize>32)))||!['vertical','horizontal','rows','columns'].includes(p.layout??'vertical'))throw new Error('Invalid subplot settings.');
      const validLegend=legend=>legend&&typeof legend.visible==='boolean'&&['top-left','top-right','bottom-left','bottom-right','outside-top','custom'].includes(legend.position)&&Number.isFinite(legend.size)&&legend.size>=10&&legend.size<=36&&(legend.point===null||(legend.point&&Number.isFinite(legend.point.x)&&Number.isFinite(legend.point.y)&&legend.point.x>=0&&legend.point.x<=1&&legend.point.y>=0&&legend.point.y<=1));
      const validRange=plot=>{const mode=plot.yRangeMode??'auto',margin=plot.yMargin??10,step=plot.yStep??1,min=plot.yMin??null,max=plot.yMax??null;return ['auto','manual'].includes(mode)&&Number.isFinite(margin)&&margin>=0&&margin<=100&&Number.isFinite(step)&&step>0&&Number.isFinite(1/step)&&((min===null&&max===null&&mode==='auto')||(Number.isFinite(min)&&Number.isFinite(max)&&min<max&&Number.isFinite(max-min)));};
      if(savedPlots.some(plot=>!validRange(plot)))throw new Error('Invalid subplot vertical range.');
      if(savedPlots.some(plot=>plot.backgroundColor!==undefined&&plot.backgroundColor!==null&&(typeof plot.backgroundColor!=='string'||!/^#[0-9a-f]{6}$/i.test(plot.backgroundColor))))throw new Error('Invalid subplot background color.');
      if(savedPlots.some(plot=>plot.legend!==undefined&&!validLegend(plot.legend)))throw new Error('Invalid subplot legend settings.');
      const plots=savedPlots.map((plot,i)=>({...plot,titleSize:plot.titleSize ?? 14,yRangeMode:plot.yRangeMode ?? 'auto',yMargin:plot.yMargin ?? 10,yStep:plot.yStep ?? 1,yMin:plot.yMin ?? null,yMax:plot.yMax ?? null,backgroundColor:plot.backgroundColor ?? null,group:plot.group ?? Math.min(1000,i+1),legend:plot.legend?{...plot.legend}:{visible:p.showLegend!==false,position:p.legendPosition,point:null,size:p.legendSize}}));
      const plotIds=new Set(plots.map(plot=>plot.id));
      const texts=p.texts ?? [];
      const validAnchor=anchor=>anchor===undefined||anchor===null||(typeof anchor==='object'&&typeof anchor.sourceId==='string'&&!!anchor.sourceId&&typeof anchor.sourceName==='string'&&anchor.sourceName.length<=500&&Number.isFinite(anchor.time)&&Number.isFinite(anchor.offset)&&Number.isFinite(anchor.time+anchor.offset)&&(anchor.mode===undefined||anchor.mode==='attach')&&(anchor.detachTime==null||(Number.isFinite(anchor.detachTime)&&anchor.detachTime>=anchor.time+anchor.offset))&&(anchor.detachPercent==null||(Number.isFinite(anchor.detachPercent)&&anchor.detachPercent>=0&&anchor.detachPercent<=100))&&(anchor.reattachTime==null||(anchor.detachPercent!=null&&Number.isFinite(anchor.reattachTime)&&anchor.reattachTime>=anchor.time+anchor.offset)));
      if(!Array.isArray(texts)||new Set(texts.map(t=>t?.id)).size!==texts.length||texts.some(t=>!t||typeof t.id!=='string'||!t.id||!['text','line'].includes(t.type??'text')||typeof t.text!=='string'||((t.type??'text')==='text'&&!t.text.trim())||t.text.length>120||(t.align!==undefined&&!['left','center','right'].includes(t.align))||!plotIds.has(t.plotId)||![t.x,t.y,t.size].every(Number.isFinite)||t.x<0||t.x>100||t.y<0||t.y>100||t.size<8||t.size>100||!/^#[0-9a-f]{6}$/i.test(t.color)||(t.start!==null&&!Number.isFinite(t.start))||(t.end!==null&&!Number.isFinite(t.end))||(t.start!==null&&t.end!==null&&t.end<t.start)||!validAnchor(t.anchor)||(t.type==='line'&&(!Number.isFinite(t.width)||t.width<.5||t.width>8||!['solid','dashed','dotted'].includes(t.style)))))throw new Error('Invalid plot annotation.');
      const oldHeight=[540,720,1080].includes(p.exportResolution)?p.exportResolution:1080;
      const figureWidth=p.figureWidth ?? (p.frameFormat==='4:3'?oldHeight*4/3:oldHeight*16/9),figureHeight=p.figureHeight ?? oldHeight;
      if(!validDataFigureSize(figureWidth,figureHeight))throw new Error('Invalid figure dimensions.');
      if(p.legendPosition==='custom'&&p.legendPoint){const h=1280*figureHeight/figureWidth;figureLayout(1280,h,plots,p.layout??'vertical',{labelSize:p.labelSize ?? 10}).forEach((layout,index)=>{if(savedPlots[index].legend)return;const area=layout.plot;plots[index].legend.point={x:clamp((p.legendPoint.x*1280-area.left)/(area.right-area.left),0,1),y:clamp((p.legendPoint.y*h-area.top)/(area.bottom-area.top),0,1)};});}
      const oldSources=new Map(),series=p.series.map(s=>{
        if(!s||![s.source,s.name,s.label].every(v=>typeof v==='string'&&v.length<=500)||!/^#[0-9a-f]{6}$/i.test(s.color)||!['solid','dashed','dotted'].includes(s.style)||!Number.isFinite(s.width)||s.width<.5||s.width>8||!Array.isArray(s.times)||!Array.isArray(s.values)||s.times.length<2||s.values.length!==s.times.length||s.times.some((t,i)=>!Number.isFinite(t)||(i&&t<=s.times[i-1]))||s.values.some(v=>v!==null&&!Number.isFinite(v)))throw new Error('Invalid graph series.');
        if(s.sourceId!==undefined&&(typeof s.sourceId!=='string'||!s.sourceId))throw new Error('Invalid CSV source.');
        let sourceId=s.sourceId;if(!sourceId){const matches=oldSources.get(s.source)??[],match=matches.find(item=>item.times.length===s.times.length&&item.times.every((time,i)=>time===s.times[i]));sourceId=match?.id??makeId();if(!match){matches.push({id:sourceId,times:s.times});oldSources.set(s.source,matches);}}
        const plotId=s.plotId ?? plots[0].id;if(!plotIds.has(plotId))throw new Error('A series refers to a missing subplot.');
        return {id:makeId(),sourceId,plotId,source:s.source,name:s.name,label:s.label,times:s.times,values:s.values,color:s.color,style:s.style,width:s.width,visible:s.visible!==false};
      });
      // Convert projects saved with the earlier time-based stop to the
      // equivalent position, preserving their appearance as they scroll.
      const start=series.length?Math.min(...series.map(s=>s.times[0])):0,end=series.length?Math.max(...series.map(s=>s.times.at(-1))):0;
      const migratedTexts=texts.map(item=>{
        if(!item.anchor || item.anchor.detachTime==null)return item;
        const {detachTime,...anchor}=item.anchor;
        if(anchor.detachPercent==null&&end>start){
          const window=dataWindow(start,detachTime,p.windowSeconds,p.threshold,end),fraction=(anchor.time+anchor.offset-window.left)/(window.right-window.left);
          anchor.detachPercent=fraction>=0&&fraction<=1?Number((fraction*100).toFixed(8)):null;
        }
        return {...item,anchor};
      });
      pause();importMessages.clear();collapsedSeries.clear();if(p.layout==='rows'||p.layout==='columns')plots.sort((a,b)=>a.group-b.group);Object.assign(state,{series,plots,layout:p.layout??'vertical',texts:migratedTexts,windowSeconds:p.windowSeconds,threshold:p.threshold,title:p.title,titleAlign:p.titleAlign ?? 'left',titleSize:p.titleSize ?? 18,labelSize:p.labelSize ?? 10,legendPosition:p.legendPosition,legendPoint:p.legendPoint,legendSize:p.legendSize,showLegend:p.showLegend!==false,showMarkers:p.showMarkers!==false,backgroundColor:p.backgroundColor ?? '#ffffff',backgroundOpacity:p.backgroundOpacity ?? 1,current:Number.isFinite(p.current)?p.current:(series[0]?.times[0]??0)});
      $('data-export-format').value=['webm','webm-alpha','prores-4444'].includes(p.exportFormat)?p.exportFormat:'mp4';$('data-export-fps').value=[15,24,30].includes(p.exportFps)?String(p.exportFps):'30';syncFields();resizeFigure(figureWidth,figureHeight);bounds();renderPlots();renderSeries();resetTextForm();renderTexts();summary();$('data-project-name').value=name??projectNameFromFile(file,p.projectName);feedback('Graph project loaded.');
    }catch(error){feedback(`Could not load graph project: ${error.message}`,true);}
  }
  async function openDataProject(getFile,name){if(state.exporting||loadingProject||savingProject)return;if(pendingImports)return feedback('Wait for data loading to finish before opening a project.',true);loadingProject=true;updateProjectControls();try{await loadDataProject(await getFile(),name);}catch(error){feedback(`Could not open graph project: ${error.message}`,true);}finally{loadingProject=false;updateProjectControls();}}
  $('data-project-input').addEventListener('change',async event=>{const file=event.target.files[0];if(file)await openDataProject(()=>file);event.target.value='';});
  dataProjectLibrary=setupProjectLibrary({select:$('data-project-library'),button:$('data-open-saved-project'),type:'flightroom-data',onOpen:name=>openDataProject(()=>openProject(name),name)});
  syncFields();resizeFigure(state.figureWidth,state.figureHeight);bounds();renderPlots();renderSeries();refreshTextPlots();renderTexts();syncAnnotationForm();summary();
  return {pause,redraw,isExporting:()=>state.exporting};
}
