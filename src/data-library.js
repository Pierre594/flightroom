// A source owns its time vector and fields; subplot series only reference them.
export function createDataSource(parsed,makeId) {
  return {sourceId:makeId(),source:parsed.name,times:parsed.times,columns:parsed.columns.map(column=>({id:makeId(),name:column.name,values:column.values}))};
}

export function replaceLibrarySource(source,parsed,series,makeId) {
  const names=new Map();for(const column of source.columns){if(!names.has(column.name))names.set(column.name,[]);names.get(column.name).push(column);}
  let matched=0;const columns=parsed.columns.map(column=>{const previous=names.get(column.name)?.shift();if(previous)matched++;return {id:previous?.id??makeId(),name:column.name,values:column.values};});
  const byId=new Map(columns.map(column=>[column.id,column]));let removedCurves=0;
  const updated=series.flatMap(item=>{
    if(item.sourceId!==source.sourceId)return [item];
    const column=byId.get(item.columnId);if(!column){removedCurves++;return [];}
    return [{...item,source:parsed.name,name:column.name,times:parsed.times,values:column.values}];
  });
  return {source:{...source,source:parsed.name,times:parsed.times,columns},series:updated,matched,added:columns.length-matched,removed:source.columns.length-matched,removedCurves};
}

const sameArray=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
// Legacy projects stored samples independently for each curve. Keep every
// curve and style, and group compatible samples into reusable source fields.
export function migrateLegacySeries(series,makeId) {
  const sources=[],byId=new Map(),unnamed=new Map(),result=[];
  for(const item of series){
    let id=item.sourceId;
    if(!id){const candidates=unnamed.get(item.source)??[];let match=candidates.find(source=>sameArray(source.times,item.times));if(!match){match={sourceId:makeId(),source:item.source,times:item.times,columns:[]};candidates.push(match);unnamed.set(item.source,candidates);sources.push(match);byId.set(match.sourceId,match);}id=match.sourceId;}
    let source=byId.get(id);
    if(source&&!sameArray(source.times,item.times)){source=null;id=makeId();}
    if(!source){source={sourceId:id,source:item.source,times:item.times,columns:[]};sources.push(source);byId.set(id,source);}
    // A legacy curve represented one original CSV column. Keep duplicate
    // columns distinct, even if their names and samples happen to match.
    const column={id:makeId(),name:item.name,values:item.values};source.columns.push(column);
    result.push({...item,id:makeId(),sourceId:source.sourceId,columnId:column.id,source:source.source,times:source.times,values:column.values});
  }
  return {sources,series:result};
}

export function restoreLibrarySeries(sources,series,makeId) {
  if(!Array.isArray(sources)||new Set(sources.map(s=>s?.sourceId)).size!==sources.length)throw new Error('Invalid CSV library.');
  const sourceMap=new Map();
  for(const source of sources){
    if(!source||typeof source.sourceId!=='string'||!source.sourceId||typeof source.source!=='string'||source.source.length>500||!Array.isArray(source.times)||source.times.length<2||source.times.some((time,i)=>!Number.isFinite(time)||(i>0&&time<=source.times[i-1]))||!Array.isArray(source.columns)||!source.columns.length||new Set(source.columns.map(c=>c?.id)).size!==source.columns.length||source.columns.some(c=>!c||typeof c.id!=='string'||!c.id||typeof c.name!=='string'||c.name.length>500||!Array.isArray(c.values)||c.values.length!==source.times.length||c.values.some(value=>value!==null&&!Number.isFinite(value))))throw new Error('Invalid CSV library.');
    sourceMap.set(source.sourceId,source);
  }
  return series.map(item=>{
    const source=sourceMap.get(item.sourceId),column=source?.columns.find(c=>c.id===item.columnId);
    if(!source||!column)throw new Error('A curve refers to a missing CSV field.');
    return {...item,id:makeId(),source:source.source,name:column.name,times:source.times,values:column.values};
  });
}
