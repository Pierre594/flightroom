import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFlight, sampleFlight, reinterpretFlightAngles } from '../src/flight.js';

const radiansHeader='time,x_m,y_m,z_m,roll_rad,pitch_rad,yaw_rad\n';
const degreesHeader='time_s,x_m,y_m,z_m,roll_deg,pitch_deg,yaw_deg\n';
test('sample flights use radians and are synchronized',async()=>{
  const one=parseFlight(await readFile('Drone1.csv','utf8'),'Drone1.csv');
  const two=parseFlight(await readFile('Drone2.csv','utf8'),'Drone2.csv');
  assert.equal(one.start,0);assert.equal(one.end,10);assert.equal(two.end,10);assert.equal(one.angleUnit,'radians');
  const sample=sampleFlight(one,.5);assert.equal(sample.alpha,.5);assert.equal(sample.a.z_m,0);assert.equal(sample.b.z_m,.5);
  assert.equal(two.rows.at(-1).x_m,1);assert.equal(two.rows.at(-1).y_m,1);assert.equal(two.rows.at(-1).z_m,1);
});
test('radians stay in radians; explicitly selected degrees and old project data are converted',()=>{
  const rad=parseFlight(radiansHeader+'0,0,0,0,0,0,0\n1,0,0,1,0,0,1.5707963267948966');
  assert.ok(Math.abs(rad.rows[1].yaw_rad-Math.PI/2)<1e-12);
  const old=parseFlight(degreesHeader+'0,0,0,0,0,0,0\n1,0,0,1,0,0,90');
  assert.ok(Math.abs(old.rows[1].yaw_rad-Math.PI/2)<1e-12);
  const forced=parseFlight(degreesHeader+'0,0,0,0,0,0,0\n1,0,0,1,0,0,1.5707963267948966','flight',{angleUnit:'radians'});
  assert.ok(Math.abs(forced.rows[1].yaw_rad-Math.PI/2)<1e-12);assert.equal(forced.declaredAngleUnit,'degrees');
  const override=parseFlight(radiansHeader+'0,0,0,0,0,0,0\n1,0,0,1,0,0,90','flight',{angleUnit:'degrees'});
  assert.ok(Math.abs(override.rows[1].yaw_rad-Math.PI/2)<1e-12);
});
test('CSV data with legacy degree labels can be imported as radians without editing it',()=>{
  const raw=degreesHeader+'0,0,0,0,0,0,0\n0.01,1,0,0,-0.0387361086905003,0.0223187524825335,-0.170653998851776';
  const flight=parseFlight(raw,'Drone1.csv',{angleUnit:'radians'});
  assert.ok(Math.abs(flight.rows[1].yaw_rad-(-0.170653998851776))<1e-12);
});
test('unqualified angle names are also accepted as radians',()=>{
  const text='time,x_m,y_m,z_m,roll,pitch,yaw\n0,0,0,0,0,0,0\n1,0,0,1,1,2,3';
  const f=parseFlight(text);assert.equal(f.rows[1].roll_rad,1);assert.equal(f.rows[1].pitch_rad,2);assert.equal(f.rows[1].yaw_rad,3);
});
test('invalid headers, values, and timestamps are rejected',()=>{
  assert.throws(()=>parseFlight('time_s,x_m\n0,0\n1,1'),/missing columns/);
  assert.throws(()=>parseFlight(radiansHeader+'0,0,0,0,0,0,0\n0,0,0,1,0,0,0'),/strictly increasing/);
  assert.throws(()=>parseFlight(radiansHeader+'0,0,0,0,0,0,0\n1,0,0,,0,0,0'),/empty z_m/);
  assert.throws(()=>parseFlight(radiansHeader+'0,0,0,0,0,0,0\n1,0,0,no,0,0,0'),/invalid z_m/);
  assert.throws(()=>parseFlight(radiansHeader+'0,0,0,0,0,0,0\n1,0,0,1,no,0,0'),/invalid roll_rad/);
});
test('holds first and last pose outside recorded range',()=>{
  const f=parseFlight(radiansHeader+'2,0,0,0,0,0,0\n3,1,1,1,0,0,0');
  assert.equal(sampleFlight(f,-1).a.time,2);assert.equal(sampleFlight(f,10).a.time,3);
});

test('canonical time and legacy time_s produce the same normalized flight',()=>{
  const rows='0,0,0,0,0,0,0\n2,2,0,1,0,0,0.5';
  const current=parseFlight(radiansHeader+rows),legacy=parseFlight(radiansHeader.replace('time,','time_s,')+rows);
  assert.deepEqual(current.rows,legacy.rows);assert.equal(current.rows[1].time,2);
  assert.equal(sampleFlight(legacy,1).alpha,.5);
  assert.throws(()=>parseFlight('time,time_s,x_m,y_m,z_m,roll_rad,pitch_rad,yaw_rad\n0,0,0,0,0,0,0,0\n1,1,0,0,1,0,0,0'),/only one time column/);
});


test('changing the unit of an existing flight reinterprets its original values',()=>{
  const f=parseFlight(degreesHeader+'0,0,0,0,0,0,0\n1,0,0,1,0,0,1.5707963267948966');
  assert.ok(Math.abs(f.rows[1].yaw_rad-Math.PI/2*Math.PI/180)<1e-12);
  reinterpretFlightAngles(f,'radians');assert.ok(Math.abs(f.rows[1].yaw_rad-Math.PI/2)<1e-12);
  reinterpretFlightAngles(f,'degrees');assert.ok(Math.abs(f.rows[1].yaw_rad-Math.PI/2*Math.PI/180)<1e-12);
});
