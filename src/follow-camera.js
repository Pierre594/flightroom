import * as THREE from 'three';
import { sampleFlight } from './flight.js';

// Flight coordinates are X/Y horizontal and Z up; Three.js uses X/Y-up/-Z.
export function followPose(flight, time) {
  const {a,b,alpha}=sampleFlight(flight,time);
  const delta=THREE.MathUtils.euclideanModulo(b.yaw_rad-a.yaw_rad+Math.PI,2*Math.PI)-Math.PI;
  return {
    position:new THREE.Vector3(THREE.MathUtils.lerp(a.x_m,b.x_m,alpha),THREE.MathUtils.lerp(a.z_m,b.z_m,alpha),-THREE.MathUtils.lerp(a.y_m,b.y_m,alpha)),
    heading:a.yaw_rad+delta*alpha
  };
}

function headingRotation(heading) { return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading); }

export function followRelativeView(view,pose) {
  const inverse=headingRotation(pose.heading).invert();
  const relative=coordinates=>new THREE.Vector3().fromArray(coordinates).sub(pose.position).applyQuaternion(inverse).toArray();
  return {...view,position:relative(view.position),target:relative(view.target)};
}

export function followWorldView(view,pose) {
  const rotation=headingRotation(pose.heading);
  const world=coordinates=>new THREE.Vector3().fromArray(coordinates).applyQuaternion(rotation).add(pose.position).toArray();
  return {...view,position:world(view.position),target:world(view.target)};
}

export function validFollow(follow,flightIds) {
  if (follow == null) return true;
  if (typeof follow !== 'object' || !flightIds.has(follow.flightId)) return false;
  const v=follow.view;
  if (!v || ![v.position,v.target].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)) || !Number.isFinite(v.zoom) || v.zoom<=0 || !['perspective','orthographic'].includes(v.projection) || (v.projection==='orthographic' && (!Number.isFinite(v.viewHeight)||v.viewHeight<=0))) return false;
  return new THREE.Vector3().fromArray(v.position).distanceTo(new THREE.Vector3().fromArray(v.target))>1e-6;
}
