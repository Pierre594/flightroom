import * as THREE from 'three';
import exampleModelUrl from '../models/example/Drone1.glb?url';
import exampleFlightUrl from '../data/example/Drone1.csv?url';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseFlight, sampleFlight, reinterpretFlightAngles } from './flight.js';
import { flightOrientation } from './orientation.js';
import { sampleCamera, validCameraKeys, cameraMetrics, cameraViewWithAngles, moveCameraKey, unwrapAngle, perspectiveCameraView, CAMERA_FOV_DEGREES } from './camera.js';
import { followPose, followRelativeView, followWorldView, validFollow } from './follow-camera.js';
import { correctOnshapeColors } from './materials.js';
import { addModelEdges } from './edges.js';
import { addShadowCaster, fitShadowLight } from './shadows.js';
import { makeAxisLabels } from './axis-labels.js';
import { cableCurve, makeCableMesh, DEFAULT_CABLE_DIAMETER } from './cables.js';
import { preparePropellers, collectPropellers, updatePropellers } from './propellers.js';
import { addPropellerBlur } from './propeller-blur.js';
import { batchRigidOnshapeMeshes } from './batch-model.js';
import { modelIdsFromAssets, readModelAssignment } from './model-assignments.js';
import { orderCubeFiles, normalizeBackground } from './background.js';
import { validAnnotations, annotationVisible, annotationScenePosition, makeAnnotationSprite } from './annotations.js';
import {onMathLabelsReady, prepareMathLabels} from './math-labels.js';
import { formatElapsedTime as clock } from './time.js';
import { videoDimensions, videoFrameCount, videoFrameTiming } from './export-video.js';
import { initDataPanel } from './data-panel.js';
import {normalizeProjectName} from './project-names.js';
import {saveProject,openProject,projectNameFromFile,setupProjectLibrary} from './project-storage.js';
import Papa from 'papaparse';
import './style.css';

const $ = id => document.getElementById(id);
const colors = [0xcc8666, 0x7193a6, 0xa28bb6, 0xc9a95e, 0x76a591, 0xca7b91];
const state = { flights: [], model: null, current: 0, start: 0, end: 10, playing: false, recording: false, lastTick: null, recorder: null, offlineExport: false, exportCancelled: false, cameraKeys: [], follow: null, cables: [], annotations: [] };
const container = $('canvas-container');
const scene = new THREE.Scene(); const plainBackground = new THREE.Color(0xe9ede6); scene.background = plainBackground;
const skyScene = new THREE.Scene();
const skyCamera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, .01, 100);
let backgroundAsset = null, backgroundLoading = false;
const perspectiveCamera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, .01, 10000);
const orthographicCamera = new THREE.OrthographicCamera(-1,1,1,-1,.01,10000);
let camera = perspectiveCamera; camera.position.set(5, 4, 7);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
const timestampScene=new THREE.Scene();
const timestampCamera=new THREE.OrthographicCamera(0,1,1,0,.1,10); timestampCamera.position.z=1;
const timestampCanvas=document.createElement('canvas'); timestampCanvas.width=896; timestampCanvas.height=240;
const timestampTexture=new THREE.CanvasTexture(timestampCanvas); timestampTexture.colorSpace=THREE.SRGBColorSpace; timestampTexture.minFilter=THREE.LinearFilter; timestampTexture.generateMipmaps=false;
const timestampMaterial=new THREE.MeshBasicMaterial({map:timestampTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
const timestampPlane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),timestampMaterial);timestampScene.add(timestampPlane);
let lastTimestamp=null;
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(.5, .6, -.5); controls.enableDamping = false; controls.update();
scene.add(new THREE.HemisphereLight(0xffffff, 0xd5dbd2, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.25); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.01; scene.add(sun, sun.target);
const gridSize = 30;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(gridSize, gridSize), new THREE.MeshBasicMaterial({ color: 0xe2e7df })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.012; floor.renderOrder=-3; scene.add(floor);
const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(gridSize,gridSize), new THREE.ShadowMaterial({color:0x29312c, opacity:0.38, depthWrite:false})); shadowFloor.rotation.x=-Math.PI/2; shadowFloor.position.y=-.006; shadowFloor.receiveShadow=true; scene.add(shadowFloor);
const grid = new THREE.GridHelper(gridSize, 30, 0xb0bcb0, 0xcbd4ca); grid.position.y = .002; grid.renderOrder=-2; for(const material of (Array.isArray(grid.material)?grid.material:[grid.material])) material.depthWrite=false; scene.add(grid);
const axes = new THREE.Group();
function axis(from, to, color) { const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]); const line=new THREE.Line(geometry, new THREE.LineBasicMaterial({ color,depthTest:true,depthWrite:false })); line.renderOrder=-1; axes.add(line); }
// Flight coordinates are Z-up: X -> Three.js X, Y -> -Three.js Z, Z -> Three.js Y.
axis([-15,.009,0],[15,.009,0],0xc77e67); axis([0,.009,15],[0,.009,-15],0x76a674); axis([0,0,0],[0,3,0],0x6c8fac);
const axisLabels = makeAxisLabels(); axes.add(axisLabels); scene.add(axes);
let lastAxisLabelScale = null;
function updateAxisLabelScale() {
  const factor = camera.isOrthographicCamera ? (camera.top-camera.bottom)/camera.zoom / (2*Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEGREES/2))) : 1;
  const fontSize=Number($('axis-label-size').value);
  const cacheKey=`${factor}/${fontSize}`; if (cacheKey === lastAxisLabelScale) return;
  lastAxisLabelScale = cacheKey;
  axisLabels.traverse(object => { if (object.isSprite) object.scale.set(.128*factor*fontSize,.048*factor*fontSize,1); });
  for(const sprite of annotationSprites.values()) sprite.scale.set(.05*sprite.userData.annotationAspect*sprite.userData.annotationSize*factor,.05*sprite.userData.annotationSize*factor,1);
}
const flightGroup = new THREE.Group(); scene.add(flightGroup);
const cableGroup = new THREE.Group(); scene.add(cableGroup);
const annotationGroup = new THREE.Group(); scene.add(annotationGroup);
const annotationSprites = new Map();
let annotationEditId = null;
const cableMeshes = new Map();
const models = new Map();
let modelsLoading = 0;
function makeId() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
const gltfLoader = new GLTFLoader();
function pos(row) { return new THREE.Vector3(row.x_m, row.z_m, -row.y_m); }
function toast(message, error = false) { $('message').textContent = message; $('message').classList.toggle('error', error); }
function resize() {
  if (state.recording) return; // Keep the encoded frame dimensions stable during export.
  const cssWidth = container.clientWidth;
  if (!cssWidth || !container.clientHeight) return;
  const [numerator, denominator] = $('frame-format').value === '4:3' ? [4,3] : [16,9];
  // Even dimensions retain the exact ratio and support common MP4 conversion formats.
  const step = numerator * 2;
  const pixels = Math.max(step, Math.floor(cssWidth * Math.min(Math.max(window.devicePixelRatio, 1.5), 2) / step) * step);
  renderer.setSize(pixels, pixels * denominator / numerator, false);
  const aspect = numerator / denominator;
  perspectiveCamera.aspect = aspect; perspectiveCamera.updateProjectionMatrix();
  const halfHeight = (orthographicCamera.top - orthographicCamera.bottom) / 2;
  orthographicCamera.left = -halfHeight * aspect; orthographicCamera.right = halfHeight * aspect; orthographicCamera.updateProjectionMatrix();
  updateAxisLabelScale(); resizeTimestamp();
}
function setOrthographicHeight(height) {
  const aspect = $('frame-format').value === '4:3' ? 4/3 : 16/9;
  orthographicCamera.top = height/2; orthographicCamera.bottom = -height/2;
  orthographicCamera.left = -height*aspect/2; orthographicCamera.right = height*aspect/2;
  orthographicCamera.updateProjectionMatrix();
}
function switchProjection(projection) {
  const next = projection === 'orthographic' ? orthographicCamera : perspectiveCamera;
  if (camera === next) return;
  const distance = Math.max(camera.position.distanceTo(controls.target), .01);
  const perspectiveHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov/2));
  if (next === orthographicCamera) {
    setOrthographicHeight(perspectiveHeight / camera.zoom); next.zoom = 1;
  } else {
    const visibleHeight = (camera.top-camera.bottom) / camera.zoom;
    next.zoom = perspectiveHeight / visibleHeight;
  }
  next.position.copy(camera.position); next.quaternion.copy(camera.quaternion); next.updateProjectionMatrix();
  camera = next; controls.object = next;
  $('projection-label').textContent = next === orthographicCamera ? 'ORTHOGRAPHIC VIEW' : 'PERSPECTIVE VIEW';
  controls.update();
}
function setFrameFormat(value) {
  const format = value === '4:3' ? '4:3' : '16:9';
  $('frame-format').value = format;
  $('viewport').style.setProperty('--frame-aspect', format.replace(':', ' / '));
  resize();
}
new ResizeObserver(resize).observe(container);
const viewport=$('viewport'), viewportShell=$('viewport-shell');
function setViewportWidth(pixels) {
  const available=viewportShell.clientWidth;
  if (!available) return;
  const maximum=Math.max(0,available-2), minimum=Math.min(320,maximum*.8);
  const width=THREE.MathUtils.clamp(pixels,minimum,maximum);
  viewport.style.setProperty('--viewport-width',`${(width/available*100).toFixed(3)}%`);
}
for (const handle of document.querySelectorAll('.viewport-resize-handle')) {
  let drag=null;
  handle.addEventListener('pointerdown',event=>{
    if (state.recording || event.button!==0) return;
    event.preventDefault();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:viewport.clientWidth};
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove',event=>{
    if (!drag || event.pointerId!==drag.id) return;
    const corner=handle.dataset.corner;
    const horizontal=(event.clientX-drag.x)*(corner.endsWith('right')?1:-1)*2;
    const aspect=$('frame-format').value==='4:3'?4/3:16/9;
    const vertical=(event.clientY-drag.y)*(corner.startsWith('bottom')?1:-1)*aspect;
    setViewportWidth(drag.width+(Math.abs(horizontal)>Math.abs(vertical)?horizontal:vertical));
  });
  const stop=event=>{ if (drag?.id===event.pointerId) drag=null; };
  handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);handle.addEventListener('lostpointercapture',stop);
  handle.addEventListener('keydown',event=>{
    if (state.recording || !['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const sign=['ArrowRight','ArrowUp'].includes(event.key)?1:-1;
    setViewportWidth(viewport.clientWidth+sign*(event.shiftKey?80:20));
  });
}
function recalcDuration() {
  state.start = state.flights.length ? Math.min(...state.flights.map(f => f.start)) : 0;
  state.end = state.flights.length ? Math.max(...state.flights.map(f => f.end)) : 0;
  state.current = THREE.MathUtils.clamp(state.current, state.start, state.end);
  $('timeline').min = state.start; $('timeline').max = state.end; $('total-time').textContent = clock(state.end - state.start); renderKeyframes();
}
function disposePath(path) { path.geometry.dispose(); path.material.dispose(); }
function rebuildScene() {
  while (flightGroup.children.length) { const child = flightGroup.children[0]; flightGroup.remove(child); if (child.userData.path) disposePath(child); }
  const scale = Number($('model-scale').value);
  for (const [index, flight] of state.flights.entries()) {
    const group = new THREE.Group();
    const asset = models.get(flight.modelId ?? 'default') ?? models.get('default');
    flight.propellers=[];
    if (asset) { const model = asset.scene.clone(true); model.scale.setScalar((scale > 0 ? scale : 1) * (flight.modelScale ?? 1)); group.add(model); flight.propellers=collectPropellers(model); }
    flight.object = group; flightGroup.add(group);
    const geometry = new THREE.BufferGeometry().setFromPoints(flight.rows.map(pos));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: colors[index % colors.length], transparent: true, opacity: .7 })); line.userData.path = true; line.visible = $('show-paths').checked; flightGroup.add(line);
  }
  let radius = 0;
  for (const flight of state.flights) {
    const asset = models.get(flight.modelId ?? 'default') ?? models.get('default');
    if (asset) radius = Math.max(radius, asset.radius * (scale > 0 ? scale : 1) * (flight.modelScale ?? 1));
  }
  fitShadowLight(sun,state.flights,radius);
  updateAtTime(); renderList();
}
function updateAtTime() {
  for (const flight of state.flights) {
    if (!flight.object) continue;
    const { a,b,alpha } = sampleFlight(flight, state.current);
    flight.object.position.copy(pos(a)).lerp(pos(b), alpha);
    flight.object.quaternion.copy(flightOrientation(a)).slerp(flightOrientation(b), alpha);
    updatePropellers(flight.propellers, state.current-state.start, Number($('propeller-rpm').value), $('show-propellers').checked, $('propeller-blur').checked);
  }
  updateCables(); updateAnnotations(); updateTimestamp();
  applyCamera();
  $('timeline').value = state.current; $('current-time').textContent = clock(state.current - state.start);
  updateKeyframeSelection();
  updateGraphCursor();
}
let applyingFollow=false;
function followFlight() { return state.flights.find(f=>f.id===state.follow?.flightId); }
function cameraViewAt(time) {
  const flight=followFlight();
  if (flight) return followWorldView(state.follow.view,followPose(flight,time));
  return sampleCamera(state.cameraKeys,time);
}
function refreshFollowInputs() {
  const active=Boolean(followFlight());
  $('follow-offsets').hidden=!active;
  $('follow-hint').textContent=active?'Left-drag orbits the flight; right-drag pans and scroll zooms. Keyframes resume when follow is off.':'Select a flight to follow its position and heading.';
  $('camera-graph-help').textContent=active?'Curves show the follow view over time; values show the current view.':'Curves show saved views; values show the current view. View height shows the zoom at the target.';
  if (!active) return;
  const position=state.follow.view.position;
  for (const [id,value] of [['follow-offset-x',position[0]],['follow-offset-y',-position[2]],['follow-offset-z',position[1]]]) $(id).value=Number(value.toFixed(3));
}
function renderFollowControls() {
  const select=$('follow-target'); select.replaceChildren(new Option('Off · use camera keyframes',''));
  for (const flight of state.flights) select.add(new Option(flight.name,flight.id));
  select.value=state.follow?.flightId ?? '';select.disabled=state.recording || !state.flights.length;
  for (const id of ['follow-offset-x','follow-offset-y','follow-offset-z']) $(id).disabled=state.recording;
  refreshFollowInputs();
}
function applyCamera() {
  const view = cameraViewAt(state.current);
  if (!view) return;
  applyingFollow=Boolean(followFlight());
  try {
    switchProjection(view.projection ?? 'perspective');
    if (camera.isOrthographicCamera) setOrthographicHeight(view.viewHeight);
    camera.position.fromArray(view.position); controls.target.fromArray(view.target); camera.zoom = view.zoom; camera.updateProjectionMatrix(); controls.update(); updateAxisLabelScale();
  } finally { applyingFollow=false; }
}
function updateKeyframeSelection() {
  const selected = state.cameraKeys.findIndex(k => Math.abs(k.time - state.current) < 0.005);
  $('add-keyframe').disabled=state.recording || Boolean(followFlight());
  $('add-keyframe').title=followFlight()?'Turn follow mode off to edit camera keyframes.':'';
  $('add-keyframe').textContent = selected >= 0 ? '↻ Update view at current time' : '＋ Add view at current time';
  document.querySelectorAll('.keyframe-jump').forEach((button, i) => button.classList.toggle('active', i === selected));
}
function jumpToKeyframe(key) {
  state.current = THREE.MathUtils.clamp(key.time, state.start, state.end); setPlaying(false); updateAtTime();
}
function enableKeyframeDrag(marker,key,jump) {
  let drag=null,ignoreClick=false;
  marker.addEventListener('pointerdown',event=>{
    if(state.recording||event.button!==0)return;
    event.preventDefault();event.stopPropagation();drag={pointerId:event.pointerId,startX:event.clientX,original:key.time,moved:false,blocked:false};marker.setPointerCapture(event.pointerId);
  });
  marker.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(!drag.moved&&Math.abs(event.clientX-drag.startX)<4)return;
    if(!drag.moved){drag.moved=true;if(state.playing)setPlaying(false);marker.classList.add('dragging');}
    const bounds=$('keyframe-markers').getBoundingClientRect();if(!bounds.width)return;
    const fraction=THREE.MathUtils.clamp((event.clientX-bounds.left)/bounds.width,0,1),time=state.start+fraction*(state.end-state.start);
    drag.blocked=!moveCameraKey(state.cameraKeys,key,time,state.start,state.end);if(drag.blocked)return;
    marker.style.left=`${(key.time-state.start)/(state.end-state.start)*100}%`;marker.title=`Camera keyframe at ${key.time.toFixed(2)} s`;jump.textContent=clock(key.time-state.start);
    state.current=key.time;drawCameraGraph();updateAtTime();
  });
  const finish=(event,cancelled=false)=>{
    if(!drag||drag.pointerId!==event.pointerId)return;const saved=drag;drag=null;
    if(!saved.moved)return;
    ignoreClick=true;
    if(cancelled){key.time=saved.original;state.cameraKeys.sort((a,b)=>a.time-b.time);state.current=THREE.MathUtils.clamp(key.time,state.start,state.end);}
    renderKeyframes();updateAtTime();
    toast(cancelled?'Keyframe move cancelled.':saved.blocked?'A keyframe already exists at that time; kept the last valid position.':`Camera keyframe moved to ${clock(key.time-state.start)}.`);
  };
  marker.addEventListener('pointerup',event=>finish(event));marker.addEventListener('pointercancel',event=>finish(event,true));
  marker.addEventListener('click',()=>{if(ignoreClick){ignoreClick=false;return;}jumpToKeyframe(key);});
}
function renderKeyframes() {
  const list = $('keyframe-list'), markers = $('keyframe-markers'); list.replaceChildren(); markers.replaceChildren();
  const count = state.cameraKeys.length; $('keyframe-count').textContent = `${count} view${count === 1 ? '' : 's'}`;
  if (!count) { const empty = document.createElement('span'); empty.className = 'keyframe-empty'; empty.textContent = 'Set your view, then add a keyframe at the current time.'; list.append(empty); }
  state.cameraKeys.forEach((key, i) => {
    const chip = document.createElement('div'); chip.className = 'keyframe-chip';
    const jump = document.createElement('button'); jump.className = 'keyframe-jump'; jump.textContent = clock(key.time - state.start); jump.title = `Go to camera keyframe at ${key.time.toFixed(2)} s`; jump.disabled = state.recording || key.time < state.start || key.time > state.end; jump.addEventListener('click', () => jumpToKeyframe(key));
    const del = document.createElement('button'); del.className = 'keyframe-delete'; del.textContent = '×'; del.title = `Delete camera keyframe at ${key.time.toFixed(2)} s`; del.setAttribute('aria-label', del.title); del.disabled = state.recording;
    del.addEventListener('click', () => { state.cameraKeys.splice(i, 1); renderKeyframes(); applyCamera(); toast('Camera keyframe removed.'); });
    chip.append(jump, del); list.append(chip);
    if (key.time >= state.start && key.time <= state.end && state.end > state.start) {
      const marker = document.createElement('button'); marker.className = 'keyframe-marker'; marker.style.left = `${(key.time-state.start)/(state.end-state.start)*100}%`; marker.title = `${jump.title}; drag to move`; marker.setAttribute('aria-label', `${jump.title}; drag to move`); marker.disabled = state.recording; enableKeyframeDrag(marker,key,jump); markers.append(marker);
    }
  });
  updateKeyframeSelection();
  drawCameraGraph();
}
$('add-keyframe').addEventListener('click', () => {
  if (followFlight()) return;
  if (!state.flights.length) return toast('Add a flight before creating a camera keyframe.', true);
  setPlaying(false);
  const time = Math.round(state.current * 100) / 100;
  const view = { time, ...currentCameraView() };
  const index = state.cameraKeys.findIndex(k => Math.abs(k.time - time) < 0.005);
  if (index >= 0) state.cameraKeys[index] = view; else state.cameraKeys.push(view);
  state.cameraKeys.sort((a,b) => a.time-b.time); state.current = time; renderKeyframes(); updateAtTime();
  toast(`Camera view ${index >= 0 ? 'updated' : 'added'} at ${clock(time-state.start)}.`);
});
const graph = { left: 145, right: 970, lanes: [18, 95, 172, 249], height: 59, samples: [], ranges: [], cursor: null, dots: [] };
const graphSeries = [
  { key: 'azimuth', label: 'AZIMUTH', unit: '°', color: '#c77e61' },
  { key: 'elevation', label: 'ELEVATION', unit: '°', color: '#6f9b84' },
  { key: 'distance', label: 'DISTANCE', unit: ' m', color: '#7c91b0' },
  { key: 'viewHeight', label: 'VIEW HEIGHT', unit: ' m', color: '#aa86ad' }
];
function currentCameraView() { return { position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom, projection: camera.isOrthographicCamera ? 'orthographic' : 'perspective', ...(camera.isOrthographicCamera ? { viewHeight: camera.top-camera.bottom } : {}) }; }
function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  return element;
}
function drawCameraGraph() {
  const svg = $('camera-graph-svg'); svg.replaceChildren();
  const duration = Math.max(0, state.end - state.start);
  const times = Array.from({length: 241}, (_, i) => state.start + duration * i / 240);
  for (const key of state.cameraKeys) if (key.time > state.start && key.time < state.end) times.push(key.time);
  times.sort((a,b) => a-b);
  let previous;
  graph.samples = times.map(time => {
    const metrics = cameraMetrics(cameraViewAt(time) ?? currentCameraView());
    if (previous !== undefined) metrics.azimuth = unwrapAngle(metrics.azimuth, previous);
    previous = metrics.azimuth; return {time, ...metrics};
  });
  graph.ranges = [];
  graph.dots = [];
  for (let i=0; i<=4; i++) {
    const x = graph.left + (graph.right-graph.left)*i/4;
    svg.append(svgElement('line',{x1:x,y1:10,x2:x,y2:312,stroke:'#edf1ea','stroke-width':1}));
    svg.append(svgElement('text',{x,y:331,'text-anchor':i===0?'start':i===4?'end':'middle',fill:'#a0ad9e','font-size':10},clock(duration*i/4)));
  }
  graphSeries.forEach((series, index) => {
    const values = graph.samples.map(sample => sample[series.key]);
    let min = Math.min(...values), max = Math.max(...values);
    const padding = Math.max((max-min)*.14, (series.key === 'distance' || series.key === 'viewHeight') ? .1 : 2);
    min -= padding; max += padding; graph.ranges.push({min, max});
    const top = graph.lanes[index], bottom = top + graph.height;
    svg.append(svgElement('text', {x:10,y:top+11,fill:'#7d8d79','font-size':10,'font-weight':700,'letter-spacing':'.07em'}, series.label));
    for (let n=0;n<3;n++) {
      const y = top + graph.height*n/2, value = max-(max-min)*n/2;
      svg.append(svgElement('line',{x1:graph.left,y1:y,x2:graph.right,y2:y,stroke:'#e6ece3','stroke-width':1}));
      svg.append(svgElement('text',{x:graph.left-8,y:y+3,'text-anchor':'end',fill:'#a0ad9e','font-size':10}, `${value.toFixed(1)}${series.unit}`));
    }
    const points = graph.samples.map(sample => {
      const x = graph.left + (duration ? (sample.time-state.start)/duration : 0)*(graph.right-graph.left);
      const y = bottom - (sample[series.key]-min)/(max-min)*graph.height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    svg.append(svgElement('polyline',{points,fill:'none',stroke:series.color,'stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'}));
  });
  for (const key of state.cameraKeys) if (duration && key.time >= state.start && key.time <= state.end) {
    const x = graph.left + (key.time-state.start)/duration*(graph.right-graph.left);
    svg.append(svgElement('line',{x1:x,y1:10,x2:x,y2:312,stroke:'#d8c2b0','stroke-width':1,'stroke-dasharray':'3 4'}));
  }
  graph.cursor = svgElement('line',{y1:10,y2:312,stroke:'#879984','stroke-width':1.5}); svg.append(graph.cursor);
  graphSeries.forEach(series => { const dot = svgElement('circle',{r:4,fill:series.color,stroke:'#fff','stroke-width':2}); graph.dots.push(dot); svg.append(dot); });
  $('graph-end').textContent = clock(duration); updateGraphCursor();
}
function updateGraphCursor() {
  if (!graph.cursor || !graph.samples.length) return;
  const metrics = cameraMetrics(currentCameraView());
  const duration = state.end-state.start;
  const fraction = duration > 0 ? THREE.MathUtils.clamp((state.current-state.start)/duration,0,1) : 0;
  const sample = graph.samples.reduce((a,b) => Math.abs(b.time-state.current)<Math.abs(a.time-state.current)?b:a);
  metrics.azimuth = unwrapAngle(metrics.azimuth, sample.azimuth);
  $('graph-time').textContent = clock(state.current-state.start);
  $('graph-azimuth-value').textContent = `${metrics.azimuth.toFixed(1)}°`;
  $('graph-elevation-value').textContent = `${metrics.elevation.toFixed(1)}°`;
  $('graph-distance-value').textContent = `${metrics.distance.toFixed(2)} m`;
  $('graph-viewheight-value').textContent = `${metrics.viewHeight.toFixed(2)} m`;
  const x = graph.left + fraction*(graph.right-graph.left);
  graph.cursor.setAttribute('x1',x); graph.cursor.setAttribute('x2',x);
  graphSeries.forEach((series,index) => {
    const range=graph.ranges[index]; const value=THREE.MathUtils.clamp(metrics[series.key],range.min,range.max);
    const y=graph.lanes[index]+graph.height-(value-range.min)/(range.max-range.min)*graph.height;
    graph.dots[index].setAttribute('cx',x); graph.dots[index].setAttribute('cy',y);
  });
}
function updateCameraPosition(force=false) {
  const values = [camera.position.x, -camera.position.z, camera.position.y];
  for (const [i,id] of ['camera-x','camera-y','camera-z'].entries()) $(id).textContent = (Math.abs(values[i]) < .005 ? 0 : values[i]).toFixed(2);
  const angles=cameraMetrics(currentCameraView());
  for(const [id,value] of [['camera-azimuth',angles.azimuth],['camera-elevation',angles.elevation]])if(force||document.activeElement!==$(id))$(id).value=(Math.abs(value)<.05?0:value).toFixed(1);
}
controls.addEventListener('change', () => {
  updateAxisLabelScale(); updateCameraPosition();
  const flight=followFlight();
  if (flight && !applyingFollow) { state.follow.view=followRelativeView(currentCameraView(),followPose(flight,state.current)); refreshFollowInputs(); drawCameraGraph(); }
  else if (!state.cameraKeys.length && !flight) drawCameraGraph(); else updateGraphCursor();
});
updateCameraPosition();
$('follow-target').addEventListener('change',event=>{
  if (state.playing) setPlaying(false);
  const flight=state.flights.find(f=>f.id===event.target.value);
  if(flight){const pose=followPose(flight,state.current),view=currentCameraView();view.target=pose.position.toArray();if(new THREE.Vector3().fromArray(view.position).distanceTo(pose.position)<1e-6)view.position=pose.position.clone().add(new THREE.Vector3(1,1,1)).toArray();state.follow={flightId:flight.id,view:followRelativeView(view,pose)};}
  else state.follow=null;
  renderFollowControls();renderKeyframes();updateAtTime();
  toast(flight?`Following ${flight.name}. Adjust the view with the mouse or offset fields.`:'Follow camera off. Camera keyframes are active.');
});
renderer.domElement.addEventListener('pointerdown',event=>{
  const flight=followFlight();if(!flight||state.recording||event.button!==0)return;
  const target=followPose(flight,state.current).position;if(camera.position.distanceTo(target)<1e-6)return;
  controls.target.copy(target);controls.update();
},{capture:true});
for(const id of ['camera-azimuth','camera-elevation'])$(id).addEventListener('change',()=>{
  const azimuth=$('camera-azimuth').value.trim()===''?NaN:Number($('camera-azimuth').value),elevation=$('camera-elevation').value.trim()===''?NaN:Number($('camera-elevation').value);
  try{const view=cameraViewWithAngles(currentCameraView(),azimuth,elevation);if(state.playing)setPlaying(false);camera.position.fromArray(view.position);controls.update();updateCameraPosition(true);}
  catch(error){updateCameraPosition(true);toast(error.message,true);}
});
for (const id of ['follow-offset-x','follow-offset-y','follow-offset-z']) $(id).addEventListener('change',()=>{
  if (!followFlight()) return;
  const inputs=['follow-offset-x','follow-offset-y','follow-offset-z'].map(key=>$(key));
  const values=inputs.map(input=>input.value.trim()===''?NaN:Number(input.value));
  if (!values.every(Number.isFinite)) { refreshFollowInputs();return toast('Follow offsets must be finite numbers.',true); }
  const position=[values[0],values[2],-values[1]];
  if (new THREE.Vector3().fromArray(position).distanceTo(new THREE.Vector3().fromArray(state.follow.view.target))<1e-6) { refreshFollowInputs();return toast('The camera offset must differ from the target offset.',true); }
  state.follow.view.position=position;drawCameraGraph();updateAtTime();
});
$('camera-graph-svg').addEventListener('pointerdown', event => {
  if (state.recording || state.end<=state.start) return;
  const box = $('camera-graph-svg').getBoundingClientRect();
  const x = (event.clientX-box.left)/box.width*1000;
  const fraction = THREE.MathUtils.clamp((x-graph.left)/(graph.right-graph.left),0,1);
  if (state.playing) setPlaying(false); state.current = state.start+fraction*(state.end-state.start); updateAtTime();
});
function renderList() {
  const list = $('flight-list'); list.replaceChildren();
  state.flights.forEach((flight, i) => {
    const card=document.createElement('div'); card.className='flight-card';
    const row=document.createElement('div'); row.className='flight-item';
    const dot=document.createElement('span'); dot.className='flight-color'; dot.style.background=`#${colors[i%colors.length].toString(16).padStart(6,'0')}`;
    const details=document.createElement('div'); details.className='flight-details';
    const title=document.createElement('strong'); title.textContent=flight.name;
    const small=document.createElement('small'); small.textContent=`${flight.rows.length} samples · ${flight.end-flight.start} s`;
    details.append(title,small);
    const remove=document.createElement('button'); remove.className='remove-flight'; remove.textContent='×'; remove.title=`Remove ${flight.name}`; remove.setAttribute('aria-label',remove.title); remove.disabled=state.recording;
    remove.addEventListener('click',()=>{ const removed=state.flights.splice(i,1)[0]; if(state.follow?.flightId===removed.id) state.follow=null; state.cables=state.cables.filter(c=>c.from!==removed.id&&c.to!==removed.id); rebuildCables(); recalcDuration(); rebuildScene(); pruneModels(); });
    row.append(dot,details,remove); card.append(row);
    const modelRow=document.createElement('div'); modelRow.className='flight-model-row';
    const asset=models.get(flight.modelId ?? 'default');
    const modelName=document.createElement('div'); modelName.className='flight-model-name'; modelName.textContent=`Model: ${asset?.name ?? 'Loading…'}${(flight.modelId ?? 'default') === 'default' ? ' (default)' : ''}`; modelName.title=modelName.textContent;
    const upload=document.createElement('label'); upload.className='flight-model-upload'; upload.textContent='Choose GLB'; upload.title=`Choose a model for ${flight.name}`;
    const input=document.createElement('input'); input.type='file'; input.accept='.glb,model/gltf-binary'; input.hidden=true; input.disabled=state.recording; input.setAttribute('aria-label',`Choose GLB for ${flight.name}`); upload.append(input);
    input.addEventListener('change',async()=>{
      const file=input.files[0]; if(!file) return;
      const token=makeId(); flight.modelRequest=token; modelsLoading++; input.disabled=true; modelName.textContent='Loading model…';
      try {
        const asset=await prepareModel(await file.arrayBuffer(),file.name);
        if (!state.flights.includes(flight) || flight.modelRequest!==token) { disposeModel(asset); return; }
        const id=makeId(); models.set(id,asset); flight.modelId=id; rebuildScene(); pruneModels(); toast(`Model assigned to ${flight.name}.`);
      } catch(err) { if (flight.modelRequest===token) { modelName.textContent=`Model: ${models.get(flight.modelId ?? 'default')?.name ?? 'unavailable'}`; toast(`Could not load model for ${flight.name}: ${err.message}`,true); } }
      finally { modelsLoading--; input.disabled=state.recording; }
    });
    modelRow.append(modelName,upload);
    if ((flight.modelId ?? 'default') !== 'default') {
      const reset=document.createElement('button'); reset.className='flight-model-reset'; reset.textContent='Use default'; reset.disabled=state.recording; reset.addEventListener('click',()=>{flight.modelRequest=null; flight.modelId='default'; rebuildScene(); pruneModels();}); modelRow.append(reset);
    }
    const scaleLabel=document.createElement('label'); scaleLabel.className='flight-scale-label'; scaleLabel.append(document.createTextNode('Scale'));
    const scaleInput=document.createElement('input'); scaleInput.className='flight-scale-input'; scaleInput.type='number'; scaleInput.min='0.000001'; scaleInput.step='0.1'; scaleInput.value=flight.modelScale ?? 1; scaleInput.disabled=state.recording; scaleInput.setAttribute('aria-label',`Model scale for ${flight.name}`);
    scaleInput.addEventListener('change',()=>{ const value=Number(scaleInput.value); if(!Number.isFinite(value)||value<=0){scaleInput.value=flight.modelScale ?? 1; toast('Model scale must be greater than zero.',true); return;} flight.modelScale=value; rebuildScene(); });
    scaleLabel.append(scaleInput); modelRow.append(scaleLabel);
    const unitRow=document.createElement('label'); unitRow.className='flight-angle-unit'; unitRow.append(document.createTextNode('Angles interpreted as'));
    const unitSelect=document.createElement('select'); unitSelect.disabled=state.recording; unitSelect.setAttribute('aria-label',`Angle unit for ${flight.name}`);
    for(const [value,label] of [['radians','Radians'],['degrees','Degrees']]) { const option=document.createElement('option'); option.value=value; option.textContent=label; unitSelect.append(option); }
    unitSelect.value=flight.angleUnit ?? 'radians';
    unitSelect.addEventListener('change',()=>{
      try { reinterpretFlightAngles(flight,unitSelect.value); updateAtTime(); if(followFlight()) drawCameraGraph(); toast(`${flight.name} angles interpreted as ${flight.angleUnit}.`); }
      catch(err) { unitSelect.value=flight.angleUnit ?? 'radians'; toast(err.message,true); }
    });
    unitRow.append(unitSelect); card.append(modelRow,unitRow); list.append(card);
  });
  $('flight-count').textContent=String(state.flights.length).padStart(2,'0');
  renderCablePanel(); renderAnnotationPanel(); renderFollowControls();
  const legend=document.querySelector('.legend'); legend.replaceChildren();
  state.flights.forEach((f,i)=>{ const label=document.createElement('span'); const dot=document.createElement('i'); dot.className='legend-dot'; dot.style.background=`#${colors[i%colors.length].toString(16).padStart(6,'0')}`; label.append(dot,document.createTextNode(f.name.replace(/\.csv$/i,''))); legend.append(label); });
}
function rebuildAnnotations() {
  for(const sprite of annotationSprites.values()) { annotationGroup.remove(sprite); sprite.material.map.dispose(); sprite.material.dispose(); }
  annotationSprites.clear();
  for(const annotation of state.annotations) { const sprite=makeAnnotationSprite(annotation); annotationSprites.set(annotation.id,sprite); annotationGroup.add(sprite); }
  lastAxisLabelScale=null; updateAxisLabelScale(); updateAnnotations();
}
onMathLabelsReady(()=>{if(!state.recording && state.annotations.some(annotation=>annotation.text.includes('$')))rebuildAnnotations();});
function updateAnnotations() {
  const elapsed=state.current-state.start;
  annotationGroup.visible=$('show-annotations').checked;
  const flightPositions=new Map(state.flights.map(f=>[f.id,f.object?.position]));
  for(const annotation of state.annotations) {
    const sprite=annotationSprites.get(annotation.id); if(!sprite) continue;
    const position=annotationScenePosition(annotation,annotation.flightId ? flightPositions.get(annotation.flightId) : null);
    sprite.visible=Boolean(position)&&annotationVisible(annotation,elapsed);
    if(position) sprite.position.fromArray(position);
  }
}
function resetAnnotationForm() {
  annotationEditId=null; $('annotation-form').reset(); refreshAnnotationTargets(''); $('annotation-save').textContent='＋ Add text'; $('annotation-cancel').hidden=true;
}
function refreshAnnotationTargets(selected = $('annotation-attach').value) {
  const select=$('annotation-attach'); select.replaceChildren();
  const fixed=document.createElement('option'); fixed.value=''; fixed.textContent='Fixed world position'; select.append(fixed);
  for(const [index,flight] of state.flights.entries()) { const option=document.createElement('option'); option.value=flight.id; option.textContent=`${index+1}. ${flight.name}`; select.append(option); }
  if(selected && !state.flights.some(f=>f.id===selected)) { const missing=document.createElement('option'); missing.value=selected; missing.textContent='Missing flight — reassign'; select.append(missing); }
  select.value=selected;
  const attached=Boolean(selected);
  $('annotation-position-caption').textContent=attached?'OFFSET FROM FLIGHT · METERS':'POSITION · METERS';
  $('annotation-position-hint').textContent=attached?'Offset uses world axes and follows the selected flight. Text faces the camera.':'Text stays at its world position and faces the camera.';
}
$('annotation-attach').addEventListener('change',()=>refreshAnnotationTargets());
function renderAnnotationPanel() {
  refreshAnnotationTargets();
  const list=$('annotation-list');list.replaceChildren();$('annotation-count').textContent=String(state.annotations.length).padStart(2,'0');
  $('annotation-end').placeholder=`End (${Math.max(0,state.end-state.start).toFixed(1)} s)`;
  if(!state.annotations.length){const empty=document.createElement('span');empty.className='cable-empty';empty.textContent='No text annotations yet.';list.append(empty);return;}
  for(const item of state.annotations) {
    const card=document.createElement('div');card.className='annotation-item';
    const header=document.createElement('div');header.className='annotation-item-header';
    const title=document.createElement('span');title.className='annotation-item-name';title.textContent=item.text;title.title=item.text;
    const edit=document.createElement('button');edit.type='button';edit.className='annotation-item-button';edit.textContent='Edit';edit.disabled=state.recording;
    edit.setAttribute('aria-label',`Edit ${item.text}`);edit.addEventListener('click',()=>{
      annotationEditId=item.id;for(const key of ['text','x','y','z','start','end']) $('annotation-'+key).value=item[key]; $('annotation-size').value=item.size ?? 1; refreshAnnotationTargets(item.flightId ?? '');
      $('annotation-save').textContent='Save changes';$('annotation-cancel').hidden=false;$('annotation-text').focus();
    });
    const remove=document.createElement('button');remove.type='button';remove.className='annotation-item-button annotation-item-delete';remove.textContent='×';remove.disabled=state.recording;remove.setAttribute('aria-label',`Remove ${item.text}`);
    remove.addEventListener('click',()=>{state.annotations=state.annotations.filter(a=>a.id!==item.id);if(annotationEditId===item.id)resetAnnotationForm();rebuildAnnotations();renderAnnotationPanel();});
    header.append(title,edit,remove);
    const meta=document.createElement('div');meta.className='annotation-item-meta';const flight=state.flights.find(f=>f.id===item.flightId);
    const location=item.flightId ? flight ? `${flight.name} · offset` : 'Missing flight — edit to reassign' : 'World';
    meta.textContent=`${location} (${item.x}, ${item.y}, ${item.z}) m · ${item.start}–${item.end} s · ${item.size ?? 1}×`;
    if(item.flightId&&!flight)meta.classList.add('warning');
    card.append(header,meta);list.append(card);
  }
}
$('annotation-form').addEventListener('submit',event=>{
  event.preventDefault();if(state.recording)return;
  const text=$('annotation-text').value.trim();
  const number=id=>Number($('annotation-'+id).value);
  const end=$('annotation-end').value.trim()==='' ? Math.max(0,state.end-state.start) : number('end');
  const annotation={id:annotationEditId ?? makeId(),text,x:number('x'),y:number('y'),z:number('z'),start:number('start'),end,size:number('size'),flightId:$('annotation-attach').value || null};
  if(!validAnnotations([annotation])) return toast('Enter text, valid coordinates, size 0.1–20, and a time range with the end after the start.',true);
  const index=state.annotations.findIndex(a=>a.id===annotation.id);
  if(index>=0)state.annotations[index]=annotation; else state.annotations.push(annotation);
  rebuildAnnotations();renderAnnotationPanel();resetAnnotationForm();toast(index>=0?'Text annotation updated.':'Text annotation added.');
});
$('annotation-cancel').addEventListener('click',resetAnnotationForm);
function resizeTimestamp() {
  const w=renderer.domElement.width,h=renderer.domElement.height;if(!w||!h)return;
  const pixelRatio=w/Math.max(1,container.clientWidth), padding=16*pixelRatio;
  const width=Math.min(178*pixelRatio,Math.max(1,w-padding*2));const height=width*120/448;
  timestampCamera.right=w;timestampCamera.top=h;timestampCamera.updateProjectionMatrix();
  timestampPlane.scale.set(width,height,1);timestampPlane.position.set(w-padding-width/2,padding+height/2,0);
}
function updateTimestamp() {
  const text=clock(state.current-state.start);if(text===lastTimestamp)return;lastTimestamp=text;
  const ctx=timestampCanvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,timestampCanvas.width,timestampCanvas.height);ctx.scale(2,2);
  ctx.fillStyle='rgba(32,48,38,.86)';ctx.beginPath();ctx.roundRect(0,0,448,120,18);ctx.fill();
  ctx.textBaseline='middle';ctx.fillStyle='#c8dac3';ctx.font='700 28px sans-serif';ctx.fillText('TIME',24,61);
  ctx.fillStyle='#ffffff';ctx.font='600 46px monospace';ctx.fillText(text,125,64);timestampTexture.needsUpdate=true;
}
function rebuildCables() {
  for (const cable of cableMeshes.values()) { cableGroup.remove(cable.mesh); cable.dispose(); }
  cableMeshes.clear();
  for (const connection of state.cables) { const cable=makeCableMesh(); cableMeshes.set(connection.id,cable); cableGroup.add(cable.mesh); }
  updateCables();
}
function updateCables() {
  for (const connection of state.cables) {
    const first=state.flights.find(f=>f.id===connection.from), second=state.flights.find(f=>f.id===connection.to);
    const cable=cableMeshes.get(connection.id);
    if (!first?.object || !second?.object || !cable) continue;
    const curve=cableCurve(first.object.position,second.object.position,connection.length);
    cable.update(curve.points,curve.impossible,connection.diameter ?? DEFAULT_CABLE_DIAMETER);
    if (connection.statusElement) {
      connection.statusElement.textContent=curve.impossible ? `Too short by ${(curve.distance-connection.length).toFixed(2)} m` : `Separation: ${curve.distance.toFixed(2)} m`;
      connection.statusElement.classList.toggle('warning',curve.impossible);
    }
  }
}
function renderCablePanel() {
  const from=$('cable-from'), to=$('cable-to');
  const oldFrom=from.value,oldTo=to.value;
  for (const select of [from,to]) {
    select.replaceChildren();
    state.flights.forEach((flight,index)=>{ const option=document.createElement('option'); option.value=flight.id; option.textContent=`${index+1}. ${flight.name}`; select.append(option); });
  }
  if (state.flights.some(f=>f.id===oldFrom)) from.value=oldFrom;
  if (state.flights.some(f=>f.id===oldTo)) to.value=oldTo;
  else if (state.flights.length>1) to.value=state.flights[1].id;
  const disabled=state.recording || state.flights.length<2;
  from.disabled=disabled; to.disabled=disabled; $('cable-length').disabled=disabled; $('add-cable').disabled=disabled;
  const list=$('cable-list'); list.replaceChildren(); $('cable-count').textContent=String(state.cables.length).padStart(2,'0');
  if (!state.cables.length) { const empty=document.createElement('div');empty.className='cable-empty';empty.textContent=state.flights.length<2?'Add two flights to connect them.':'No cables added yet.';list.append(empty); }
  for (const c of state.cables) {
    const first=state.flights.find(f=>f.id===c.from),second=state.flights.find(f=>f.id===c.to);
    if(!first || !second) continue;
    const item=document.createElement('div');item.className='cable-item';
    const header=document.createElement('div');header.className='cable-item-header';
    const name=document.createElement('span');name.className='cable-item-name';name.textContent=`${first.name} ↔ ${second.name}`;name.title=name.textContent;
    const remove=document.createElement('button');remove.className='cable-item-remove';remove.textContent='×';remove.title='Remove cable';remove.setAttribute('aria-label',`Remove cable between ${first.name} and ${second.name}`);remove.disabled=state.recording;
    remove.addEventListener('click',()=>{state.cables=state.cables.filter(x=>x.id!==c.id);rebuildCables();renderCablePanel();});header.append(name,remove);
    const settings=document.createElement('label');settings.className='cable-item-settings';settings.append(document.createTextNode('Length'));
    const input=document.createElement('input');input.className='cable-length-input';input.type='number';input.min='.001';input.step='.1';input.value=c.length;input.disabled=state.recording;input.setAttribute('aria-label',`Cable length between ${first.name} and ${second.name} in meters`);
    input.addEventListener('change',()=>{const value=Number(input.value);if(!Number.isFinite(value)||value<=0){input.value=c.length;toast('Cable length must be greater than zero.',true);return;} c.length=value;updateCables();}); settings.append(input,document.createTextNode('m'));
    const thickness=document.createElement('label');thickness.className='cable-item-settings';thickness.append(document.createTextNode('Diameter'));
    const diameter=document.createElement('input');diameter.className='cable-length-input';diameter.type='number';diameter.min='.001';diameter.step='any';diameter.value=Number(((c.diameter ?? DEFAULT_CABLE_DIAMETER)*1000).toPrecision(12));diameter.disabled=state.recording;diameter.setAttribute('aria-label',`Cable diameter between ${first.name} and ${second.name} in millimeters`);
    diameter.addEventListener('change',()=>{const value=Number(diameter.value);if(!Number.isFinite(value)||value<.001){diameter.value=Number(((c.diameter ?? DEFAULT_CABLE_DIAMETER)*1000).toPrecision(12));toast('Cable diameter must be at least 0.001 mm.',true);return;}c.diameter=value/1000;updateCables();});thickness.append(diameter,document.createTextNode('mm'));
    const status=document.createElement('div');status.className='cable-item-status';status.setAttribute('aria-live','off');c.statusElement=status;
    item.append(header,settings,thickness,status);list.append(item);
  }
  updateCables();
}
$('add-cable').addEventListener('click',()=>{
  const from=$('cable-from').value,to=$('cable-to').value,length=Number($('cable-length').value);
  if(!state.flights.some(f=>f.id===from)||!state.flights.some(f=>f.id===to)||from===to) return toast('Select two different drones for the cable.',true);
  if(!Number.isFinite(length)||length<=0) return toast('Cable length must be greater than zero.',true);
  state.cables.push({id:makeId(),from,to,length,diameter:DEFAULT_CABLE_DIAMETER});rebuildCables();renderCablePanel();toast('Cable added.');
});
function setPlaying(value) { state.playing=value; state.lastTick=null; $('play').textContent=value?'❚❚':'▶'; $('play').title=value?'Pause':'Play'; $('play').setAttribute('aria-label',$('play').title); $('playback-status').textContent=state.recording?'RECORDING':value?'PLAYING':'PAUSED'; }
function fitView() {
  if (state.playing) setPlaying(false);
  switchProjection('perspective'); camera.zoom=1;
  const box=new THREE.Box3();
  for (const flight of state.flights) for (const row of flight.rows) box.expandByPoint(pos(row));
  if (box.isEmpty()) { controls.target.set(0,0,0); camera.position.set(5,4,7); }
  else { const center=box.getCenter(new THREE.Vector3()); const size=box.getSize(new THREE.Vector3()); const radius=Math.max(size.length(),2); controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(radius*1.6,radius*1.2,radius*2)); }
  camera.near=.01; camera.far=10000; camera.updateProjectionMatrix(); controls.update();
}
async function loadSamples() {
  const response=await fetch(exampleFlightUrl);
  if (!response.ok) throw new Error('Could not load the example Drone1.csv.');
  const flight=parseFlight(await response.text(),'Drone1.csv');
  state.follow=null; state.flights=[{...flight,id:makeId()}]; state.cables=[]; rebuildCables(); recalcDuration(); state.current=state.start; setPlaying(false); rebuildScene(); pruneModels();
}
async function prepareModel(buffer, name) {
  const gltf = await gltfLoader.parseAsync(buffer, '');
  correctOnshapeColors(gltf); preparePropellers(gltf.scene); addModelEdges(gltf.scene, $('show-edges').checked); addShadowCaster(gltf.scene); addPropellerBlur(gltf.scene); batchRigidOnshapeMeshes(gltf);
  const box=new THREE.Box3().setFromObject(gltf.scene);
  return {name,scene:gltf.scene,buffer:buffer.slice(0),radius:box.isEmpty()?0:Math.max(box.min.length(),box.max.length())};
}
function disposeModel(asset) {
  const geometries=new Set(), materials=new Set(), textures=new Set();
  asset.scene.traverse(o=>{ if(o.geometry) geometries.add(o.geometry); for(const m of (Array.isArray(o.material)?o.material:[o.material])) if(m) materials.add(m); });
  for(const m of materials) { for(const value of Object.values(m)) if(value?.isTexture) textures.add(value); m.dispose(); }
  for(const geometry of geometries) geometry.dispose(); for(const texture of textures) texture.dispose();
}
function pruneModels() {
  const used=new Set(state.flights.map(f=>f.modelId ?? 'default')); used.add('default');
  for(const [id,asset] of models) if(!used.has(id)) { models.delete(id); disposeModel(asset); }
}
async function loadModel(buffer, name) {
  const asset=await prepareModel(buffer,name); const previous=models.get('default'); models.set('default',asset);
  state.model=asset.scene; state.modelBuffer=asset.buffer; $('model-name').textContent=name; $('model-status').textContent='Model ready'; rebuildScene();
  if(previous) disposeModel(previous);
}
$('play').addEventListener('click',()=>{ if (!state.flights.length) return toast('Add a flight to start playback.',true); if (!state.playing && state.current >= state.end) state.current=state.start; setPlaying(!state.playing); });
$('restart').addEventListener('click',()=>{ state.current=state.start; setPlaying(false); updateAtTime(); });
$('timeline').addEventListener('input',e=>{ if (state.playing) setPlaying(false); state.current=Number(e.target.value); updateAtTime(); });
// Manual camera input takes ownership of the view until playback or scrubbing resumes.
controls.addEventListener('start', () => { if (state.playing && !state.recording) { setPlaying(false); toast(followFlight()?'Playback paused. Adjust the follow view, then resume playback.':'Playback paused. Adjust the view, then add or update a camera keyframe.'); } });
function snapView(direction) {
  if (state.playing) setPlaying(false);
  const distance = Math.max(camera.position.distanceTo(controls.target), .01);
  // Flight X/Y are horizontal, Z is up; +Y maps to Three.js -Z.
  const offsets = { top: new THREE.Vector3(0,1,1e-6), side: new THREE.Vector3(0,0,-1), back: new THREE.Vector3(-1,0,0) };
  camera.position.copy(controls.target).addScaledVector(offsets[direction].normalize(), distance);
  controls.update();
  toast(`${direction[0].toUpperCase()+direction.slice(1)} view selected. Add or update a keyframe to save it.`);
}
for (const direction of ['top','side','back']) $('view-'+direction).addEventListener('click', () => snapView(direction));
$('view-perspective').addEventListener('click',()=>{ if (state.playing) setPlaying(false); switchProjection('perspective'); toast('Perspective view selected. Add or update a keyframe to save it.'); });
$('fit-view').addEventListener('click',fitView);
$('frame-format').addEventListener('change', e => setFrameFormat(e.target.value));
function applyBackground() {
  const enabled=$('show-background').checked && backgroundAsset;
  scene.background=enabled ? null : plainBackground;
  skyScene.background=enabled ? backgroundAsset.texture : null;
  $('background-name').textContent=backgroundAsset?.name ?? 'No skybox selected';
  $('background-name').title=backgroundAsset?.name ?? '';
}
function renderScene() {
  if (skyScene.background) {
    skyCamera.quaternion.copy(camera.quaternion);
    skyCamera.aspect=$('frame-format').value === '4:3' ? 4/3 : 16/9;
    skyCamera.fov=perspectiveCamera.fov; skyCamera.zoom=camera.isPerspectiveCamera ? camera.zoom : 1; skyCamera.updateProjectionMatrix();
    renderer.autoClear=true; renderer.render(skyScene,skyCamera);
    renderer.autoClear=false; renderer.clearDepth(); renderer.render(scene,camera); renderer.autoClear=true;
  } else renderer.render(scene,camera);
  if ($('show-timestamp').checked) { renderer.autoClear=false; renderer.clearDepth(); renderer.render(timestampScene,timestampCamera); renderer.autoClear=true; }
}
function readImageFile(blob) {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
}
async function prepareBackground(descriptor, allowLegacy = false) {
  const sky=normalizeBackground(descriptor);
  if(!sky) throw new Error('No skybox image was supplied.');
  if(sky.kind==='panorama') {
    const texture=await new THREE.TextureLoader().loadAsync(sky.data);
    const width=texture.image?.width,height=texture.image?.height;
    if(!width || !height || (!allowLegacy && Math.abs(width/height-2)>.05)) { texture.dispose(); throw new Error('Use a 2:1 equirectangular panorama, such as 2048 × 1024.'); }
    texture.mapping=THREE.EquirectangularReflectionMapping; texture.colorSpace=THREE.SRGBColorSpace; texture.needsUpdate=true;
    return {kind:'panorama',name:sky.name,data:sky.data,texture};
  }
  const texture=await new THREE.CubeTextureLoader().loadAsync(sky.faces);
  const images=texture.images, size=images[0]?.width;
  if(!size || images.some(image=>image.width!==size || image.height!==size)) {texture.dispose();throw new Error('All six cube faces must be square and have the same dimensions.');}
  texture.colorSpace=THREE.SRGBColorSpace;
  return {kind:'cube',name:sky.name,faces:sky.faces,texture};
}
function setBackgroundBusy(busy) {
  backgroundLoading=busy;
  for(const id of ['background-input','cube-input','sample-background','show-background']) $(id).disabled=busy || state.recording;
}
async function chooseBackground(getDescriptor) {
  if(backgroundLoading || state.recording) return;
  setBackgroundBusy(true);
  try {
    const descriptor=await getDescriptor(), asset=await prepareBackground(descriptor);
    const old=backgroundAsset; backgroundAsset=asset; $('show-background').checked=true; applyBackground(); old?.texture.dispose();
    toast('Skybox loaded.');
  } catch(err) { if(!backgroundAsset) $('show-background').checked=false; applyBackground(); toast(`Could not load skybox: ${err.message}`,true); }
  finally { setBackgroundBusy(false); }
}
async function selectSampleSky() {
  return chooseBackground(async()=>{const response=await fetch(`${import.meta.env.BASE_URL}sky-panorama.png`);if(!response.ok)throw new Error('The sample sky is unavailable.');return {kind:'panorama',name:'Cloudy sky panorama',data:await readImageFile(await response.blob())};});
}
$('background-input').addEventListener('change',async e=>{const file=e.target.files[0];if(file) await chooseBackground(async()=>({kind:'panorama',name:file.name,data:await readImageFile(file)}));e.target.value='';});
$('cube-input').addEventListener('change',async e=>{const files=[...e.target.files];if(files.length) await chooseBackground(async()=>({kind:'cube',name:'Cube skybox',faces:await Promise.all(orderCubeFiles(files).map(readImageFile))}));e.target.value='';});
$('sample-background').addEventListener('click',selectSampleSky);
$('show-background').addEventListener('change',()=>{if($('show-background').checked&&!backgroundAsset) selectSampleSky(); else applyBackground();});
$('show-annotations').addEventListener('change',updateAnnotations);
$('show-timestamp').addEventListener('change',updateTimestamp);
$('show-floor').addEventListener('change',e=>{floor.visible=e.target.checked;shadowFloor.visible=e.target.checked&&$('show-shadows').checked;});
$('show-grid').addEventListener('change',e=>grid.visible=e.target.checked);
$('show-axes').addEventListener('change',e=>axes.visible=e.target.checked);
$('show-axis-labels').addEventListener('change',e=>axisLabels.visible=e.target.checked);
$('axis-label-size').addEventListener('input',e=>{ $('axis-label-size-value').textContent=`${Number(e.target.value).toFixed(1)}×`; updateAxisLabelScale(); });
$('show-shadows').addEventListener('change', e => { sun.castShadow=e.target.checked; shadowFloor.visible=e.target.checked&&$('show-floor').checked; });
$('show-edges').addEventListener('change',e=>{ for(const asset of models.values()) asset.scene.traverse(o=>{ if(o.userData.droneEdges) o.visible=e.target.checked; }); flightGroup.traverse(o=>{ if(o.userData.droneEdges) o.visible=e.target.checked; }); });
$('show-paths').addEventListener('change',e=>flightGroup.children.filter(x=>x.userData.path).forEach(x=>x.visible=e.target.checked));
$('show-propellers').addEventListener('change',updateAtTime);
$('propeller-blur').addEventListener('change',updateAtTime);
$('propeller-rpm').addEventListener('change',e=>{const value=Number(e.target.value);if(e.target.value.trim()===''||!Number.isFinite(value)||value<0||value>10000){e.target.value=127;toast('Propeller speed must be between 0 and 10,000 RPM.',true);}updateAtTime();});
$('model-scale').addEventListener('change',e=>{ if (!(Number(e.target.value)>0)) { e.target.value=1; toast('Model scale must be greater than zero.',true); } rebuildScene(); });
$('csv-input').addEventListener('change',async e=>{
  const files=[...e.target.files], angleUnit=$('csv-angle-unit').value; let added=0,mismatch=false;
  for (const file of files) {
    try { const flight=parseFlight(await file.text(),file.name,{angleUnit}); mismatch ||= flight.angleUnit!==flight.declaredAngleUnit; state.flights.push({...flight,id:makeId()}); added++; }
    catch(err) { toast(err.message,true); }
  }
  if (added) { recalcDuration(); rebuildScene(); if (added===files.length) toast(`Added ${added} flight${added===1?'':'s'} using ${angleUnit}${mismatch?' (the selected unit overrides the CSV headers)':''}.`); }
  e.target.value='';
});
$('model-input').addEventListener('change',async e=>{ const file=e.target.files[0]; if (!file) return; modelsLoading++; try { await loadModel(await file.arrayBuffer(),file.name); toast('Default model loaded.'); } catch(err) { toast(`Could not load model: ${err.message}`,true); } finally { modelsLoading--; e.target.value=''; } });
$('reset-samples').addEventListener('click',async()=>{ try { await loadSamples(); fitView(); toast('Example flight restored.'); } catch(err) { toast(err.message,true); } });
let flightProjectBusy=false,flightProjectLibrary=null;
function setFlightProjectBusy(busy){flightProjectBusy=busy;const disabled=busy||state.recording;for(const id of ['project-name','project-input','save-project','record'])$(id).disabled=disabled;flightProjectLibrary?.setLocked(disabled);}
function lockRecording(locked) {
  state.recording=locked; controls.enabled=!locked;
  for(const id of ['tab-3d','tab-data']) $(id).disabled=locked;
  for (const handle of document.querySelectorAll('.viewport-resize-handle')) handle.disabled=locked;
  for (const id of ['csv-angle-unit','play','restart','timeline','speed','fit-view','view-top','view-side','view-back','view-perspective','camera-azimuth','camera-elevation','cable-from','cable-to','cable-length','add-cable','model-input','model-scale','csv-input','reset-samples','show-background','background-input','cube-input','sample-background','show-floor','show-grid','show-axes','show-axis-labels','axis-label-size','show-annotations','show-timestamp','annotation-text','annotation-attach','annotation-size','annotation-x','annotation-y','annotation-z','annotation-start','annotation-end','annotation-save','annotation-cancel','show-paths','show-edges','show-shadows','show-propellers','propeller-blur','propeller-rpm','frame-format','export-format','export-speed','export-resolution','export-fps','save-project','project-input','add-keyframe']) $(id).disabled=locked;
  setFlightProjectBusy(flightProjectBusy); setBackgroundBusy(backgroundLoading); renderList(); renderKeyframes(); if (!locked) resize();
}
$('save-project').addEventListener('click', async()=>{
  if(flightProjectBusy||state.recording)return;
  if (modelsLoading || backgroundLoading) return toast('Wait for loading to finish before saving.',true);
  if (!state.modelBuffer) return toast('Load a model before saving the project.',true);
  try {
    const name=normalizeProjectName($('project-name').value);setFlightProjectBusy(true);toast('Saving project…');
    const encoded=await new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(new Blob([state.modelBuffer],{type:'model/gltf-binary'})); });
    const usedModels=[...new Set(state.flights.map(f=>f.modelId ?? 'default'))].filter(id=>id!=='default');
    const modelAssets=[]; for(const id of usedModels) { const asset=models.get(id); if(!asset) throw new Error('A flight model is unavailable.'); const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(new Blob([asset.buffer],{type:'model/gltf-binary'}));}); modelAssets.push({id,name:asset.name,data}); }
    const project={ type:'flightroom-3d',version:1, modelAssets, modelName:$('model-name').textContent, model:encoded, flights:state.flights.map(f=>({id:f.id,name:f.name,rows:f.rows,angleUnit:f.angleUnit ?? 'radians',modelId:f.modelId ?? 'default',modelScale:f.modelScale ?? 1})), cables:state.cables.map(({id,from,to,length,diameter})=>({id,from,to,length,diameter:diameter ?? DEFAULT_CABLE_DIAMETER})), camera:camera.position.toArray(), target:controls.target.toArray(), cameraZoom:camera.zoom, cameraProjection:camera.isOrthographicCamera ? 'orthographic' : 'perspective', cameraViewHeight:camera.isOrthographicCamera ? camera.top-camera.bottom : null, cameraKeys:state.cameraKeys, follow:state.follow, scale:Number($('model-scale').value), time:state.current, grid:$('show-grid').checked, axes:$('show-axes').checked, axisLabels:$('show-axis-labels').checked, axisLabelSize:Number($('axis-label-size').value), paths:$('show-paths').checked, edges:$('show-edges').checked, shadows:$('show-shadows').checked, showPropellers:$('show-propellers').checked, propellerBlur:$('propeller-blur').checked, propellerRpm:Number($('propeller-rpm').value), frameFormat:$('frame-format').value, csvAngleUnit:$('csv-angle-unit').value, exportFormat:$('export-format').value, exportSpeed:$('export-speed').value, exportResolution:Number($('export-resolution').value), exportFps:Number($('export-fps').value), floor:$('show-floor').checked, annotations:state.annotations, showAnnotations:$('show-annotations').checked, showTimestamp:$('show-timestamp').checked, background:backgroundAsset ? {kind:backgroundAsset.kind,name:backgroundAsset.name,...(backgroundAsset.kind==='cube'?{faces:backgroundAsset.faces}:{data:backgroundAsset.data}),visible:$('show-background').checked} : null };
    $('project-name').value=await saveProject(name,project);toast(`Project saved to projects/${name}.json.`);
  } catch(err) { toast(`Could not save project: ${err.message}`,true); }
  finally{setFlightProjectBusy(false);}
});
async function loadFlightProject(file,selectedName){
  if (modelsLoading || backgroundLoading) {toast('Wait for loading to finish before opening a project.',true);return;}
  try {
    const project=JSON.parse(await file.text());
    if ((project.type!==undefined&&project.type!=='flightroom-3d') || project.version!==1 || !Array.isArray(project.flights) || typeof project.model!=='string' || !project.model.startsWith('data:model/gltf-binary;base64,') || ![project.camera,project.target].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)) || !(Number(project.scale)>0)) throw new Error('Invalid or unsupported project file.');
    const modelAssets=project.modelAssets ?? [];
    const availableModels=modelIdsFromAssets(modelAssets);
    const flights=project.flights.map(f=>{
      const {modelId,modelScale}=readModelAssignment(f,availableModels);
      const parsed=parseFlight(Papa.unparse(f.rows),String(f.name||'Flight.csv'));
      if(f.angleUnit!==undefined && !['radians','degrees'].includes(f.angleUnit)) throw new Error('Invalid flight angle unit.');
      return {...parsed,id:typeof f.id==='string'&&f.id ? f.id : makeId(),angleUnit:f.angleUnit ?? parsed.angleUnit,modelId,modelScale};
    });
    const flightIds=new Set(flights.map(f=>f.id));
    if(flightIds.size!==flights.length) throw new Error('Duplicate drone identifiers.');
    if(!validFollow(project.follow,flightIds)) throw new Error('Invalid follow camera.');
    const cables=project.cables ?? [];
    if(!Array.isArray(cables) || cables.some(c=>!c || typeof c.id!=='string' || !c.id || !flightIds.has(c.from) || !flightIds.has(c.to) || c.from===c.to || !Number.isFinite(c.length) || c.length<=0 || (c.diameter !== undefined && (!Number.isFinite(c.diameter) || c.diameter < .000001))) || new Set(cables.map(c=>c.id)).size!==cables.length) throw new Error('Invalid cable connections.');
    const savedKeys = project.cameraKeys ?? []; if (!validCameraKeys(savedKeys)) throw new Error('Invalid camera keyframes.');
    const keys = savedKeys.map(perspectiveCameraView);
    const annotations=project.annotations ?? []; if(!validAnnotations(annotations)) throw new Error('Invalid text annotations.');
    const background=normalizeBackground(project.background);
    const importedBackground=background ? await prepareBackground(background,true) : null;
    const imported=new Map();
    try {
      const buffer=await (await fetch(project.model)).arrayBuffer();
      imported.set('default',await prepareModel(buffer,String(project.modelName||'Drone.glb')));
      for(const a of modelAssets) { const data=await (await fetch(a.data)).arrayBuffer(); imported.set(a.id,await prepareModel(data,String(a.name||'Drone.glb'))); }
    } catch(err) { for(const asset of imported.values()) disposeModel(asset); importedBackground?.texture.dispose(); throw err; }
    const oldModels=[...models.values()]; models.clear(); for(const [id,asset] of imported) models.set(id,asset);
    state.model=models.get('default').scene; state.modelBuffer=models.get('default').buffer; $('model-name').textContent=models.get('default').name; $('model-status').textContent='Model ready';
    state.follow=null; state.flights=flights; state.annotations=annotations.map(({id,text,x,y,z,start,end,size,flightId})=>({id,text,x,y,z,start,end,size:size ?? 1,flightId:flightId ?? null})); resetAnnotationForm(); rebuildAnnotations(); state.cables=cables.map(c=>({id:c.id,from:c.from,to:c.to,length:c.length,diameter:c.diameter ?? DEFAULT_CABLE_DIAMETER})); rebuildCables(); state.cameraKeys=keys; $('model-scale').value=project.scale;
    const previousBackground=backgroundAsset; backgroundAsset=importedBackground; $('show-background').checked=Boolean(project.background?.visible && importedBackground); applyBackground(); previousBackground?.texture.dispose();
    for(const [id,value] of [['show-floor',project.floor],['show-annotations',project.showAnnotations],['show-timestamp',project.showTimestamp],['show-grid',project.grid],['show-axes',project.axes],['show-axis-labels',project.axisLabels],['show-paths',project.paths],['show-edges',project.edges],['show-shadows',project.shadows],['show-propellers',project.showPropellers],['propeller-blur',project.propellerBlur]]) $(id).checked=value!==false;
    $('axis-label-size').value=Number.isFinite(project.axisLabelSize) && project.axisLabelSize>=.2 && project.axisLabelSize<=2 ? project.axisLabelSize : Number($('axis-label-size').defaultValue); $('axis-label-size-value').textContent=`${Number($('axis-label-size').value).toFixed(1)}×`; updateAxisLabelScale();
    $('propeller-rpm').value=Number.isFinite(project.propellerRpm) && project.propellerRpm>=0 && project.propellerRpm<=10000 ? project.propellerRpm : 127;
    $('csv-angle-unit').value=project.csvAngleUnit==='degrees'?'degrees':'radians';
    setFrameFormat(project.frameFormat); $('export-format').value=project.exportFormat === 'webm' ? 'webm' : 'mp4'; $('export-speed').value=project.exportSpeed === 'quality' ? 'quality' : 'fast'; $('export-resolution').value=[540,720,1080].includes(project.exportResolution) ? String(project.exportResolution) : '1080'; $('export-fps').value=[15,24,30].includes(project.exportFps) ? String(project.exportFps) : '30'; updateExportSummary();
    floor.visible=$('show-floor').checked; grid.visible=$('show-grid').checked; axes.visible=$('show-axes').checked; axisLabels.visible=$('show-axis-labels').checked; sun.castShadow=$('show-shadows').checked; shadowFloor.visible=$('show-shadows').checked&&$('show-floor').checked; for(const asset of models.values()) asset.scene.traverse(o=>{ if(o.userData.droneEdges) o.visible=$('show-edges').checked; }); recalcDuration(); state.current=THREE.MathUtils.clamp(Number.isFinite(project.time)?project.time:state.start,state.start,state.end); setPlaying(false); rebuildScene(); for(const old of oldModels) disposeModel(old); pruneModels();
    const savedView = { position: project.camera, target: project.target, zoom: Number.isFinite(project.cameraZoom) && project.cameraZoom>0 ? project.cameraZoom : 1, projection: project.cameraProjection === 'orthographic' && Number.isFinite(project.cameraViewHeight) && project.cameraViewHeight > 0 ? 'orthographic' : 'perspective', viewHeight: project.cameraViewHeight };
    const restoredView = perspectiveCameraView(savedView);
    switchProjection('perspective');
    camera.position.fromArray(restoredView.position); controls.target.fromArray(restoredView.target); camera.zoom=restoredView.zoom; camera.updateProjectionMatrix(); controls.update();
    state.follow=project.follow ?? null; renderFollowControls(); renderKeyframes(); if(state.follow) updateAtTime();$('project-name').value=selectedName??projectNameFromFile(file,project.projectName);toast(background?.legacy ? 'Project loaded. Its previous flat background is mapped as a panorama; replace it with a 360° image for best results.' : 'Project loaded.');
  } catch(err) { toast(`Could not load project: ${err.message}`,true); }
}
async function openFlightProject(file,name){if(flightProjectBusy||state.recording)return;setFlightProjectBusy(true);try{await loadFlightProject(file,name);}finally{setFlightProjectBusy(false);}}
$('project-input').addEventListener('change',async e=>{const file=e.target.files[0];if(file)await openFlightProject(file);e.target.value='';});
flightProjectLibrary=setupProjectLibrary({select:$('project-library'),button:$('open-saved-project'),type:'flightroom-3d',onOpen:async name=>{if(flightProjectBusy||state.recording)return;setFlightProjectBusy(true);try{await loadFlightProject(await openProject(name),name);}catch(error){toast(`Could not open project: ${error.message}`,true);}finally{setFlightProjectBusy(false);}}});
let latestVideoObjectUrl = null;
function exportFeedback(message,error=false) {
  const element=$('export-feedback'); element.hidden=false; element.textContent=message; element.classList.toggle('error',error);
}
function offerVideoDownload(url,name,isObjectUrl=false) {
  if(latestVideoObjectUrl) URL.revokeObjectURL(latestVideoObjectUrl);
  latestVideoObjectUrl=isObjectUrl?url:null;
  const link=$('download-video'); link.href=url; link.download=name; link.textContent=`Download ${name}`; link.hidden=false;
  link.click();
}
function offerVideoBlob(blob,name) { offerVideoDownload(URL.createObjectURL(blob),name,true); }
function exportProgress(message) { $('export-status').textContent=message.toUpperCase(); exportFeedback(message); }
async function localExportRequest(path,options={}) {
  const response=await fetch(path,options);
  const isJson=(response.headers.get('content-type') ?? '').includes('application/json');
  if(!isJson) { if(path.endsWith('/start')) return null; throw new Error('Local encoder returned an unexpected response.'); }
  const payload=await response.json();
  if(!response.ok) throw new Error(payload.error || `Local encoder returned ${response.status}.`);
  return payload;
}
async function localMp4Export(width,height,duration,fps,frames) {
  const root='/__flightroom_export';let id=null,complete=false,previous=Promise.resolve();const pending=[];
  const fast=$('export-speed').value==='fast', frameCodec=fast?'jpeg':'png', mime=fast?'image/jpeg':'image/png';
  try {
    const started=await localExportRequest(`${root}/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({width,height,fps,frameCodec})});
    if(!started?.id) return null;
    id=started.id;
    for(let i=0;i<frames;i++) {
      if(state.exportCancelled)break;
      const timing=videoFrameTiming(i,duration,fps);state.current=state.start+timing.timestamp;updateAtTime();renderScene();
      const captured=new Promise(resolve=>renderer.domElement.toBlob(resolve,mime,fast ? .96 : undefined));
      const upload=previous.then(async()=>{
        if(state.exportCancelled)return;
        const image=await captured;
        if(state.exportCancelled)return;
        if(!image || image.type!==mime)throw new Error(`Could not capture a ${frameCodec.toUpperCase()} video frame.`);
        await localExportRequest(`${root}/frame/${id}`,{method:'POST',headers:{'Content-Type':mime},body:image});
        if(i%5===0 || i===frames-1) exportProgress(`Rendering MP4 with FFmpeg · ${Math.round((i+1)/frames*100)}%`);
      });
      upload.catch(()=>{});previous=upload;pending.push(upload);
      // Keep at most two snapshots in flight and send them in timestamp order.
      if(pending.length>=2) await pending.shift();
    }
    await Promise.all(pending);
    if(state.exportCancelled)return null;
    $('cancel-export').disabled=true; exportProgress('Finalizing MP4…');
    const result=await localExportRequest(`${root}/finish/${id}`,{method:'POST'});complete=true;return result.url;
  } finally { await Promise.allSettled(pending); if(id && !complete) try { await fetch(`${root}/cancel/${id}`,{method:'POST'}); } catch {} }
}
function updateExportSummary() {
  $('export-status').textContent=`${$('export-format').value.toUpperCase()} · ${$('export-resolution').value}p · ${$('export-fps').value} FPS`;
  $('export-speed-control').hidden=$('export-format').value!=='mp4';
}
for(const id of ['export-format','export-resolution','export-fps']) $(id).addEventListener('change',updateExportSummary);
$('cancel-export').addEventListener('click',()=>{
  state.exportCancelled=true; $('cancel-export').disabled=true; exportProgress('Cancelling export…');
  if(state.recorder?.state==='recording') state.recorder.stop();
});
async function recordRealtime(format, bitrate, fps) {
  if(!renderer.domElement.captureStream || typeof MediaRecorder==='undefined') throw new Error('Video recording is not supported in this browser.');
  const types=format==='mp4' ? ['video/mp4;codecs=avc1.42E01E','video/mp4'] : ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mime=types.find(type=>MediaRecorder.isTypeSupported(type));
  if(!mime) throw new Error(`${format.toUpperCase()} encoding is unavailable in this browser. Try Chrome or choose WebM.`);
  const stream=renderer.domElement.captureStream(fps), chunks=[];
  try {
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});state.recorder=recorder;
    const done=new Promise((resolve,reject)=>{
      let failure=null;recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=e=>{failure=e.error ?? new Error('Recording failed.');};
      recorder.onstop=()=>failure ? reject(failure) : resolve(new Blob(chunks,{type:mime}));
    });
    state.current=state.start;updateAtTime();renderScene();state.offlineExport=false;recorder.start();setPlaying(true);
    exportProgress(`Recording ${format.toUpperCase()} in real time`);
    toast('Using real-time recording because frame-by-frame encoding is unavailable in this browser.');
    if(state.exportCancelled && recorder.state==='recording')recorder.stop();
    return await done;
  } finally { stream.getTracks().forEach(track=>track.stop());state.recorder=null; }
}
$('record').addEventListener('click',async()=>{
  if(state.recording)return;
  if(modelsLoading || backgroundLoading) { exportFeedback('Wait for loading to finish before exporting.',true); return toast('Wait for loading to finish before exporting.',true); }
  if(!state.flights.length || state.end<=state.start) { exportFeedback('Add a flight with a duration before exporting.',true); return toast('Add a flight with a duration before exporting.',true); }
  const format=$('export-format').value==='webm'?'webm':'mp4',height=Number($('export-resolution').value);
  const {width,height:outputHeight}=videoDimensions($('frame-format').value,height);
  const duration=state.end-state.start, fps=Number($('export-fps').value), frames=videoFrameCount(duration,fps), bitrate=height===1080?12000000:height===720?6000000:3500000;
  const originalTime=state.current; let output=null, finished=false, localFailure=null;
  state.exportCancelled=false;state.offlineExport=true;setPlaying(false);lockRecording(true);
  $('cancel-export').hidden=false;$('cancel-export').disabled=false;$('download-video').hidden=true;$('playback-status').textContent='EXPORTING';exportProgress('Preparing video export…');
  try {
    await prepareMathLabels(state.annotations.map(annotation=>annotation.text));
    if(state.exportCancelled){exportFeedback('Export cancelled.');toast('Export cancelled.');return;}
    rebuildAnnotations();
    renderer.setSize(width,outputHeight,false);resizeTimestamp();
    if(format==='mp4') {
      try {
        exportProgress('Starting local MP4 encoder…');
        const url=await localMp4Export(width,outputHeight,duration,fps,frames);
        if(state.exportCancelled){exportFeedback('Export cancelled.');toast('Export cancelled.');return;}
        if(url) {offerVideoDownload(url,'drone-flight.mp4');finished=true;exportFeedback('MP4 ready. If the download did not start, click Download drone-flight.mp4.');toast('Video exported as drone-flight.mp4.');return;}
      } catch(err) { localFailure=err; if(state.exportCancelled){exportFeedback('Export cancelled.');toast('Export cancelled.');return;} }
    }
    exportProgress('Checking browser video encoder…');
    const {Output,Mp4OutputFormat,WebMOutputFormat,BufferTarget,CanvasSource,Quality,canEncodeVideo}=await import('mediabunny');
    const codec=format==='mp4'?'avc':'vp9';
    let supported=false;
    try { supported=await canEncodeVideo(codec,{width,height:outputHeight,frameRate:fps}); } catch { supported=false; }
    if(state.exportCancelled) {exportFeedback('Export cancelled.');toast('Export cancelled.');return;}
    if(!supported) {
      const blob=await recordRealtime(format,bitrate,fps);
      if(state.exportCancelled){exportFeedback('Export cancelled.');toast('Export cancelled.');return;}
      if(!blob.size)throw new Error('Recording produced no video.');
      offerVideoBlob(blob,`drone-flight.${format}`);finished=true;exportFeedback(`${format.toUpperCase()} ready. If the download did not start, click Download drone-flight.${format}.`);toast(`Video exported as drone-flight.${format}.`);return;
    }
    const target=new BufferTarget();
    output=new Output({format:format==='mp4'?new Mp4OutputFormat():new WebMOutputFormat(),target});
    const source=new CanvasSource(renderer.domElement,{codec,quality:new Quality({bitrate})});
    output.addVideoTrack(source);await output.start();
    for(let i=0;i<frames;i++) {
      if(state.exportCancelled){await output.cancel();exportFeedback('Export cancelled.');toast('Export cancelled.');return;}
      const timing=videoFrameTiming(i,duration,fps);
      state.current=state.start+timing.timestamp;updateAtTime();renderScene();await source.add(timing.timestamp,timing.duration);
      if(i%5===0 || i===frames-1) { exportProgress(`Rendering ${format.toUpperCase()} · ${Math.round((i+1)/frames*100)}%`); await new Promise(resolve=>setTimeout(resolve,0)); }
    }
    if(state.exportCancelled){await output.cancel();exportFeedback('Export cancelled.');toast('Export cancelled.');return;}
    $('cancel-export').disabled=true;exportProgress('Finalizing video…');source.close();await output.finalize();
    if(!target.buffer)throw new Error('Encoding produced no video.');
    offerVideoBlob(new Blob([target.buffer],{type:format==='mp4'?'video/mp4':'video/webm'}),`drone-flight.${format}`);
    finished=true;exportFeedback(`${format.toUpperCase()} ready. If the download did not start, click Download drone-flight.${format}.`);toast(`Video exported as drone-flight.${format}.`);
  } catch(err) {
    if(output && (output.state==='started' || output.state==='pending')) try{await output.cancel();}catch{}
    const detail=localFailure ? ` Local encoder: ${localFailure.message.replace(/[.!?]+$/, '')}.` : '';
    const hint=format==='mp4'?' For local MP4 export, install FFmpeg and restart the application.':' Try a recent browser or choose MP4.';
    exportFeedback(`Could not export ${format.toUpperCase()}: ${err.message.replace(/[.!?]+$/, '')}.${detail}${hint}`,true); toast(`Could not export video: ${err.message}`,true);
  } finally {
    state.offlineExport=false;lockRecording(false);setPlaying(false);$('cancel-export').hidden=true;$('cancel-export').disabled=false;updateExportSummary();
    state.current=finished?state.end:originalTime;updateAtTime();renderScene();
  }
});
let dataActive=false;
const dataPanel=initDataPanel(locked=>{for(const id of ['tab-3d','tab-data']) $(id).disabled=locked;});
function switchWorkspace(showData) {
  if(state.recording || dataPanel.isExporting())return;
  setPlaying(false);dataPanel.pause();dataActive=showData;
  $('workspace-3d').hidden=showData;$('workspace-data').hidden=!showData;
  $('tab-3d').setAttribute('aria-selected',String(!showData));$('tab-data').setAttribute('aria-selected',String(showData));
  if(showData)dataPanel.redraw();else resize();
}
$('tab-3d').addEventListener('click',()=>switchWorkspace(false));
$('tab-data').addEventListener('click',()=>switchWorkspace(true));
for(const id of ['tab-3d','tab-data']) $(id).addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();const showData=id==='tab-3d';switchWorkspace(showData);$(showData?'tab-data':'tab-3d').focus();
});
function animate(now) {
  requestAnimationFrame(animate);
  if(state.offlineExport || dataActive)return;
  if (state.playing) {
    if (state.lastTick !== null) state.current=Math.min(state.end,state.current+(now-state.lastTick)/1000*(state.recording?1:Number($('speed').value)));
    state.lastTick=now; updateAtTime();
    if (state.current>=state.end) { setPlaying(false); if (state.recording && state.recorder?.state==='recording') { renderScene(); setTimeout(()=>{if(state.recorder?.state==='recording')state.recorder.stop();},100); } }
  }
  renderScene();
}
async function init() {
  try {
    const response=await fetch(exampleModelUrl); if (!response.ok) throw new Error('Could not load the example Drone1.glb.');
    await Promise.all([loadModel(await response.arrayBuffer(),'Drone1.glb'),loadSamples()]);
    fitView(); toast('Example flight loaded. Set your view, then press play.');
  } catch(err) { $('model-status').textContent='Model unavailable'; toast(err.message,true); }
  finally { $('loading').classList.add('hidden'); resize(); }
}
updateTimestamp(); resize(); requestAnimationFrame(animate); init();
