import * as THREE from 'three';

export const CAMERA_FOV_DEGREES = 42;

// Legacy presets used an orthographic camera. Match their framing at the target
// while keeping the entire camera animation in perspective.
export function perspectiveCameraView(view) {
  if (view.projection !== 'orthographic') return view;
  const distance = new THREE.Vector3().fromArray(view.position).distanceTo(new THREE.Vector3().fromArray(view.target));
  const visibleHeight = view.viewHeight / view.zoom;
  const zoom = 2 * Math.max(distance, .01) * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEGREES / 2)) / visibleHeight;
  const { viewHeight, ...result } = view;
  return { ...result, projection: 'perspective', zoom };
}

// The easing is the cubic Bézier curve with values 0, 0, 1, 1.
// Orbit direction travels along a spherical arc to avoid passing through the target.
export function sampleCamera(keys, time) {
  if (!keys.length) return null;
  if (time <= keys[0].time) return keys[0];
  if (time >= keys.at(-1).time) return keys.at(-1);
  let i = 1;
  while (keys[i].time < time) i++;
  const a = keys[i - 1], b = keys[i];
  if (time === b.time) return b;
  const t = (time - a.time) / (b.time - a.time);
  const u = t * t * (3 - 2 * t);
  const targetA = new THREE.Vector3().fromArray(a.target);
  const targetB = new THREE.Vector3().fromArray(b.target);
  const offsetA = new THREE.Vector3().fromArray(a.position).sub(targetA);
  const offsetB = new THREE.Vector3().fromArray(b.position).sub(targetB);
  const distanceA = offsetA.length(), distanceB = offsetB.length();
  let position;
  const target = targetA.lerp(targetB, u);
  if (distanceA < 1e-8 || distanceB < 1e-8) {
    position = new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), u);
  } else {
    const directionA = offsetA.normalize(), directionB = offsetB.normalize();
    // Near the pole, quaternion arcs can change azimuth almost instantaneously,
    // making OrbitControls spin as the camera arrives at an overhead view.
    if (Math.hypot(directionA.x, directionA.z) < 1e-4 || Math.hypot(directionB.x, directionB.z) < 1e-4) {
      const sphericalA = new THREE.Spherical().setFromVector3(directionA);
      const sphericalB = new THREE.Spherical().setFromVector3(directionB);
      if (Math.hypot(directionA.x, directionA.z) < 1e-12) sphericalA.theta = sphericalB.theta;
      if (Math.hypot(directionB.x, directionB.z) < 1e-12) sphericalB.theta = sphericalA.theta;
      const delta = THREE.MathUtils.euclideanModulo(sphericalB.theta - sphericalA.theta + Math.PI, 2 * Math.PI) - Math.PI;
      position = new THREE.Vector3().setFromSphericalCoords(THREE.MathUtils.lerp(distanceA, distanceB, u), THREE.MathUtils.lerp(sphericalA.phi, sphericalB.phi, u), sphericalA.theta + delta * u).add(target);
    } else {
      const rotation = new THREE.Quaternion().setFromUnitVectors(directionA, directionB);
      const partialRotation = new THREE.Quaternion().slerp(rotation, u);
      position = directionA.applyQuaternion(partialRotation).multiplyScalar(THREE.MathUtils.lerp(distanceA, distanceB, u)).add(target);
    }
  }
  const projection = a.projection ?? 'perspective';
  const result = { time, position: position.toArray(), target: target.toArray(), zoom: THREE.MathUtils.lerp(a.zoom, b.zoom, u), projection };
  if (projection === 'orthographic') {
    const endHeight = b.projection === 'orthographic' ? b.viewHeight : a.viewHeight;
    result.viewHeight = THREE.MathUtils.lerp(a.viewHeight, endHeight, u);
  }
  return result;
}

export function validCameraKeys(keys) {
  return Array.isArray(keys) && keys.every((k, i) => (k.projection === undefined || k.projection === 'perspective' || k.projection === 'orthographic') && (k.projection !== 'orthographic' || (Number.isFinite(k.viewHeight) && k.viewHeight > 0)) && Number.isFinite(k.time) && Number.isFinite(k.zoom) && k.zoom > 0 && [k.position, k.target].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) && (!i || keys[i - 1].time < k.time));
}

// The viewpoint is measured from the target in the flight's right-handed Z-up frame.
export function cameraMetrics(view) {
  const x = view.position[0] - view.target[0];
  const y = -(view.position[2] - view.target[2]);
  const z = view.position[1] - view.target[1];
  const horizontal = Math.hypot(x, y);
  const distance = Math.hypot(horizontal, z);
  const zoom = view.zoom || 1;
  const viewHeight = view.projection === 'orthographic' ? view.viewHeight / zoom : 2 * distance * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEGREES/2)) / zoom;
  return { azimuth: (Math.atan2(y, x) * 180 / Math.PI) || 0, elevation: (Math.atan2(z, horizontal) * 180 / Math.PI) || 0, distance, viewHeight };
}

// Keep the graph continuous when azimuth crosses the -180° / +180° boundary.
export function unwrapAngle(angle, reference) {
  return angle + 360 * Math.round((reference - angle) / 360);
}
