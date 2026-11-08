import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCamera, validCameraKeys, cameraMetrics, cameraViewWithAngles, moveCameraKey, unwrapAngle, perspectiveCameraView } from '../src/camera.js';
const key = (time,position,target=[0,0,0],zoom=1) => ({time,position,target,zoom});

test('no keyframes leaves the view unchanged; a single key holds for the entire flight', () => {
  assert.equal(sampleCamera([], 5), null);
  const k=key(5,[0,0,4]);
  assert.deepEqual(sampleCamera([k],0),k); assert.deepEqual(sampleCamera([k],10),k);
});

test('camera holds endpoints and uses eased cubic Bezier interpolation between views', () => {
  const a=key(2,[0,0,4],[0,0,0],1), b=key(6,[4,0,0],[2,0,0],2), keys=[a,b];
  assert.deepEqual(sampleCamera(keys,0),a); assert.deepEqual(sampleCamera(keys,8),b);
  const quarter=sampleCamera(keys,3); assert.equal(quarter.target[0],.3125); assert.equal(quarter.zoom,1.15625);
  const middle=sampleCamera(keys,4); assert.equal(middle.target[0],1); assert.equal(middle.zoom,1.5);
  assert.ok(middle.position[0]>1 && middle.position[2]>0);
});

test('opposite views follow an arc instead of crossing through the target', () => {
  const v=sampleCamera([key(0,[0,0,4]),key(2,[0,0,-4])],1);
  assert.ok(Math.hypot(...v.position)>3.99);
});

test('keyframe validation rejects invalid or unordered saved views', () => {
  assert.ok(validCameraKeys([key(0,[0,0,1]),key(1,[1,0,0])]));
  assert.equal(validCameraKeys([key(1,[0,0,1]),key(1,[1,0,0])]),false);
  assert.equal(validCameraKeys([key(0,[0,0,1],[0,0,0],0)]),false);
});


test('camera angles use the flight Z-up frame and zoom measures target distance', () => {
  const x=cameraMetrics(key(0,[2,0,0]));
  assert.equal(x.azimuth,0); assert.equal(x.elevation,0); assert.equal(x.distance,2);
  const y=cameraMetrics(key(0,[0,0,-3]));
  assert.equal(y.azimuth,90); assert.equal(y.elevation,0); assert.equal(y.distance,3);
  const up=cameraMetrics(key(0,[0,4,0])); assert.equal(up.elevation,90); assert.equal(up.distance,4);
  const translated=cameraMetrics(key(0,[3,2,-1],[1,0,-1]));
  assert.ok(Math.abs(translated.elevation-45)<1e-9); assert.ok(Math.abs(translated.distance-Math.sqrt(8))<1e-9);
});

test('editing camera angles rotates around the target while preserving distance and zoom',()=>{
  const original={...key(0,[4,2,-1],[1,0,-1],2),projection:'perspective'};
  const changed=cameraViewWithAngles(original,90,30),metrics=cameraMetrics(changed);
  assert.ok(Math.abs(metrics.azimuth-90)<1e-9);assert.ok(Math.abs(metrics.elevation-30)<1e-9);
  assert.ok(Math.abs(metrics.distance-cameraMetrics(original).distance)<1e-9);assert.deepEqual(changed.target,original.target);assert.equal(changed.zoom,2);
  assert.throws(()=>cameraViewWithAngles(original,0,91),/elevation/);
});

test('moving a camera keyframe preserves its view, allows reordering and rejects collisions',()=>{
  const first=key(1,[1,2,3]),middle=key(3,[4,5,6]),last=key(8,[7,8,9]),keys=[first,middle,last],view=JSON.stringify({...middle,time:0});
  assert.ok(moveCameraKey(keys,middle,9,0,10));assert.deepEqual(keys.map(k=>k.time),[1,8,9]);assert.equal(JSON.stringify({...middle,time:0}),view);
  assert.equal(moveCameraKey(keys,middle,8,0,10),false);assert.deepEqual(keys.map(k=>k.time),[1,8,9]);
  assert.ok(moveCameraKey(keys,middle,-1,0,10));assert.deepEqual(keys.map(k=>k.time),[0,1,8]);assert.ok(validCameraKeys(keys));
});

test('azimuth graph unwraps smoothly across the 180 degree boundary', () => {
  assert.equal(unwrapAngle(-179,179),181);
  assert.equal(unwrapAngle(179,-179),-181);
});


test('orthographic keyframes interpolate view height and preserve projection at a keyframe', () => {
  const a={...key(0,[0,0,4]),projection:'orthographic',viewHeight:4};
  const b={...key(2,[4,0,0]),projection:'orthographic',viewHeight:8};
  const c={...key(4,[0,0,5]),projection:'perspective'};
  assert.equal(sampleCamera([a,b,c],1).viewHeight,6);
  assert.equal(sampleCamera([a,b,c],1).projection,'orthographic');
  assert.deepEqual(sampleCamera([a,b,c],2),b);
  assert.equal(sampleCamera([a,b,c],3).projection,'orthographic');
  assert.equal(sampleCamera([a,b,c],4).projection,'perspective');
  assert.ok(validCameraKeys([a,b,c]));
  assert.equal(validCameraKeys([{...a,viewHeight:0}]),false);
});

test('view height reflects perspective distance and orthographic zoom', () => {
  const perspective=cameraMetrics({...key(0,[0,0,4]),projection:'perspective'});
  const orthographic=cameraMetrics({...key(0,[0,0,4],[0,0,0],2),projection:'orthographic',viewHeight:6});
  assert.ok(perspective.viewHeight>3 && perspective.viewHeight<3.1);
  assert.equal(orthographic.viewHeight,3);
});

test('legacy orthographic views convert to perspective with the same framing at the target', () => {
  const original={...key(2,[1,4,2],[1,0,2],2),projection:'orthographic',viewHeight:6};
  const converted=perspectiveCameraView(original);
  assert.equal(converted.projection,'perspective');
  assert.deepEqual(converted.position,original.position);
  assert.deepEqual(converted.target,original.target);
  assert.ok(Math.abs(cameraMetrics(converted).viewHeight-cameraMetrics(original).viewHeight)<1e-10);
  assert.equal(perspectiveCameraView(key(0,[1,2,3])).zoom,1);
});

test('overhead transitions approach the saved view without a sudden camera rotation', () => {
  const a={...key(0,[3,2,4]),projection:'perspective'};
  const b={...key(10,[0,5,0.000005]),projection:'perspective'};
  const near=sampleCamera([a,b],9.9), almost=sampleCamera([a,b],9.99);
  const angleA=cameraMetrics(near).azimuth, angleB=cameraMetrics(almost).azimuth;
  assert.ok(Math.abs(unwrapAngle(angleB,angleA)-angleA)<1);
  assert.equal(almost.projection,'perspective');
  assert.ok(Math.hypot(...almost.position.map((v,i)=>v-b.position[i]))<0.01);
  const reverse=sampleCamera([b,a],0.01);
  assert.ok(Math.abs(unwrapAngle(cameraMetrics(reverse).azimuth,cameraMetrics(b).azimuth)-cameraMetrics(b).azimuth)<1);
});
