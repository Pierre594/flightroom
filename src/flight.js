import Papa from 'papaparse';

export const COLUMNS = ['time','position_x','position_y','position_z','roll_rad','pitch_rad','yaw_rad'];
// Keep the internal coordinate keys used by saved projects and the 3D scene.
const POSITION_COLUMNS = [['position_x','x_m'],['position_y','y_m'],['position_z','z_m']];
const ANGLE_SETS = [
  {columns:['roll_rad','pitch_rad','yaw_rad'],unit:'radians'},
  {columns:['roll','pitch','yaw'],unit:'radians'},
  {columns:['roll_deg','pitch_deg','yaw_deg'],unit:'degrees'}
];

// Project data is normalized to radians. An explicit import unit overrides the
// header names; auto mode preserves older saved projects that stored degrees.
export function parseFlight(text, name = 'CSV', options = {}) {
  const result=Papa.parse(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>{const value=h.trim().replace(/^\uFEFF/,'');return ['time','time_s'].includes(value.toLowerCase())?value.toLowerCase():value;}});
  if(result.errors.length) throw new Error(`${name}: ${result.errors[0].message}`);
  const fields=result.meta.fields ?? [];
  if(fields.includes('time') && fields.includes('time_s')) throw new Error(`${name}: use only one time column (time or time_s).`);
  const timeColumn=fields.includes('time')?'time':fields.includes('time_s')?'time_s':null;
  for(const [current,legacy] of POSITION_COLUMNS)if(fields.includes(current)&&fields.includes(legacy))throw new Error(`${name}: use only one position column for ${current} (${current} or ${legacy}).`);
  const missing=[...(timeColumn?[]:['time']),...POSITION_COLUMNS.filter(([current,legacy])=>!fields.includes(current)&&!fields.includes(legacy)).map(([current])=>current)];
  if(missing.length) throw new Error(`${name}: missing columns: ${missing.join(', ')}`);
  const sets=ANGLE_SETS.filter(set=>set.columns.every(column=>fields.includes(column)));
  if(!sets.length) throw new Error(`${name}: missing angle columns; use roll_rad, pitch_rad, yaw_rad (or the legacy _deg names).`);
  const requested=options.angleUnit ?? 'auto';
  if(!['auto','radians','degrees'].includes(requested)) throw new Error(`${name}: unsupported angle unit.`);
  const source=sets.find(set=>set.unit===requested) ?? sets[0];
  const unit=requested==='auto'?source.unit:requested;
  const factor=unit==='degrees'?Math.PI/180:1;
  if(result.data.length<2) throw new Error(`${name}: at least two samples are required.`);
  const readNumber=(raw,key,index)=>{
    if(raw[key]==null || String(raw[key]).trim()==='') throw new Error(`${name}: empty ${key} at row ${index+2}.`);
    const value=Number(raw[key]);if(!Number.isFinite(value)) throw new Error(`${name}: invalid ${key} at row ${index+2}.`);
    return value;
  };
  let previousTime=-Infinity;
  const rows=result.data.map((raw,index)=>{
    const row={time:readNumber(raw,timeColumn,index)};for(const [current,legacy] of POSITION_COLUMNS) row[legacy]=readNumber(raw,fields.includes(current)?current:legacy,index);
    source.columns.forEach((key,i)=>{row[COLUMNS[i+4]]=readNumber(raw,key,index)*factor;});
    if(index && row.time<=previousTime) throw new Error(`${name}: timestamps must be strictly increasing.`);
    previousTime=row.time;
    return row;
  });
  return {name,rows,start:rows[0].time,end:rows.at(-1).time,angleUnit:unit,declaredAngleUnit:source.unit};
}

export function sampleFlight(flight,time) {
  const rows=flight.rows;
  if(time<=flight.start) return {a:rows[0],b:rows[0],alpha:0};
  if(time>=flight.end) return {a:rows.at(-1),b:rows.at(-1),alpha:0};
  let low=0,high=rows.length-1;
  while(high-low>1) {const mid=Math.floor((low+high)/2);if(rows[mid].time<=time) low=mid;else high=mid;}
  return {a:rows[low],b:rows[high],alpha:(time-rows[low].time)/(rows[high].time-rows[low].time)};
}

// Reinterpret the original CSV numbers without losing the flight's identity.
// Current rows are normalized, so reverse the old unit before applying the new.
export function reinterpretFlightAngles(flight, newUnit) {
  const oldUnit=flight.angleUnit ?? 'radians';
  if(!['radians','degrees'].includes(oldUnit) || !['radians','degrees'].includes(newUnit)) throw new Error('Unsupported angle unit.');
  if(oldUnit===newUnit) return;
  const factor=newUnit==='radians'?180/Math.PI:Math.PI/180;
  const angles=['roll_rad','pitch_rad','yaw_rad'];
  if(flight.rows.some(row=>angles.some(key=>!Number.isFinite(row[key]*factor)))) throw new Error('Angle values are too large to convert.');
  for(const row of flight.rows) for(const key of angles) row[key]*=factor;
  flight.angleUnit=newUnit;
}
