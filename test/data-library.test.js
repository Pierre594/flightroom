import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDataCsv} from '../src/data-series.js';
import {createDataSource,replaceLibrarySource,migrateLegacySeries,restoreLibrarySeries} from '../src/data-library.js';

const ids=()=>{let n=0;return ()=>`id-${++n}`;};
test('library replacement updates every use of a matching field while preserving independent styles',()=>{
  const id=ids(),source=createDataSource(parseDataCsv('time,A,B\n0,1,2\n2,3,4\n','old.csv'),id);
  const series=[{id:'one',sourceId:source.sourceId,columnId:source.columns[0].id,plotId:'top',label:'Custom',color:'#123456',times:source.times,values:source.columns[0].values},{id:'two',sourceId:source.sourceId,columnId:source.columns[0].id,plotId:'bottom',label:'Other',color:'#abcdef',times:source.times,values:source.columns[0].values},{id:'three',sourceId:source.sourceId,columnId:source.columns[1].id,plotId:'top',label:'Removed'}];
  const result=replaceLibrarySource(source,parseDataCsv('time,A,C\n0,10,20\n3,30,40\n','new.csv'),series,id);
  assert.deepEqual([result.matched,result.added,result.removed,result.removedCurves],[1,1,1,1]);assert.equal(result.source.columns[0].id,source.columns[0].id);assert.equal(result.series.length,2);
  assert.deepEqual(result.series.map(s=>[s.plotId,s.label,s.color]),[['top','Custom','#123456'],['bottom','Other','#abcdef']]);
  assert.equal(result.series[0].times,result.source.times);assert.equal(result.series[1].values,result.source.columns[0].values);assert.equal(source.source,'old.csv');
});

test('legacy curves migrate into reusable sources without changing their styles or annotations identity',()=>{
  const id=ids(),base={sourceId:'csv',source:'old.csv',name:'A',times:[0,1],values:[2,3],plotId:'one',label:'A'};
  const result=migrateLegacySeries([base,{...base,plotId:'two',label:'Different'}, {...base,name:'B',values:[4,5]}],id);
  assert.equal(result.sources.length,1);assert.equal(result.sources[0].sourceId,'csv');assert.equal(result.sources[0].columns.length,3);assert.notEqual(result.series[0].columnId,result.series[1].columnId);assert.deepEqual(result.series.map(s=>s.label),['A','Different','A']);
});

test('library restore resolves references, keeps unplotted fields, and rejects missing data',()=>{
  const id=ids(),source=createDataSource(parseDataCsv('time,A,B\n0,1,2\n1,3,4\n','data.csv'),id);
  const saved=[{sourceId:source.sourceId,columnId:source.columns[0].id,plotId:'one',label:'Customized'}];
  const result=restoreLibrarySeries([source],saved,id);assert.equal(result[0].times,source.times);assert.equal(result[0].values,source.columns[0].values);assert.equal(source.columns.length,2);
  assert.throws(()=>restoreLibrarySeries([source],[{...saved[0],columnId:'missing'}],id),/missing CSV field/);
  assert.throws(()=>restoreLibrarySeries([{...source,columns:[{...source.columns[0],values:[1]}]}],saved,id),/Invalid CSV library/);
});

test('replacement keeps duplicate CSV columns distinct and matches them in order',()=>{
  const id=ids(),source=createDataSource(parseDataCsv('time,A,A\n0,1,2\n1,3,4\n','old.csv'),id);
  const series=source.columns.map((column,index)=>({id:`curve-${index}`,sourceId:source.sourceId,columnId:column.id,plotId:`plot-${index}`,label:`label-${index}`}));
  const updated=replaceLibrarySource(source,parseDataCsv('time,A,A\n0,5,6\n2,7,8\n','new.csv'),series,id);
  assert.deepEqual(updated.source.columns.map(c=>c.id),source.columns.map(c=>c.id));
  assert.deepEqual(updated.series.map(s=>s.values),[[5,7],[6,8]]);assert.deepEqual(updated.series.map(s=>s.plotId),['plot-0','plot-1']);
});
