import * as THREE from 'three';

// Convert the flight's Z-up frame to Three.js Y-up, then apply yaw/pitch/roll.
const basis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
const basisInverse=basis.clone().invert();
export function flightOrientation(row) {
  const qx=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),row.roll_rad);
  const qy=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),row.pitch_rad);
  const qz=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),row.yaw_rad);
  return basis.clone().multiply(qz).multiply(qy).multiply(qx).multiply(basisInverse);
}
