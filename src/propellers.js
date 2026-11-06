import * as THREE from 'three';

// This CAD assembly exports the blade geometry with origins away from the hub.
// Its separately named motor instances provide the actual shaft locations.
export function preparePropellers(root) {
  const blades=[], motors=[];
  root.updateMatrixWorld(true);
  root.traverse(node=>{
    if (/^occurrence[ _]of[ _]Gemfan5146[ _](?:CCW|CW)(?:_\d+)?$/i.test(node.name)) blades.push(node);
    if (/^occurrence[ _]of[ _]iFlight[ _]XING2[ _]2207(?:_\d+)?$/i.test(node.name)) motors.push(node);
  });
  const available=new Set(motors);
  let count=0;
  for (const blade of blades) {
    if (!available.size || !blade.parent) continue;
    const box=new THREE.Box3().setFromObject(blade);
    if (box.isEmpty()) continue;
    const center=box.getCenter(new THREE.Vector3());
    let motor=null, nearest=Infinity;
    for (const candidate of available) {
      const point=candidate.getWorldPosition(new THREE.Vector3());
      const distance=Math.hypot(point.x-center.x,point.z-center.z);
      if (distance<nearest) { nearest=distance; motor=candidate; }
    }
    // Reject unrelated motors rather than invent a shaft for an unknown model.
    const size=box.getSize(new THREE.Vector3());
    if (!motor || nearest>Math.max(size.x,size.z)*.5) continue;
    available.delete(motor);
    const shaft=motor.getWorldPosition(new THREE.Vector3()); shaft.y=center.y;
    const parent=blade.parent, pivot=new THREE.Group();
    pivot.name=`${blade.name}_spin_pivot`;
    pivot.position.copy(parent.worldToLocal(shaft));
    const parentRotation=parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const axis=new THREE.Vector3(0,1,0).applyQuaternion(parentRotation).normalize();
    pivot.userData.propellerSpin={axis:axis.toArray(),direction:/[ _]CCW(?:_\d+)?$/i.test(blade.name)?1:-1};
    parent.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(blade); count++;
  }
  return count;
}

export function collectPropellers(root) {
  const propellers=[];
  root.traverse(node=>{
    if (node.userData.propellerSpin) propellers.push({node,axis:new THREE.Vector3().fromArray(node.userData.propellerSpin.axis),direction:node.userData.propellerSpin.direction,base:node.quaternion.clone(),blur:node.children.filter(child=>child.userData.propellerBlur)});
  });
  return propellers;
}

export function updatePropellers(propellers, time, rpm, enabled, blurEnabled = true) {
  const angle=enabled ? (time * rpm * 2 * Math.PI / 60) % (2 * Math.PI) : 0;
  // Approximate a 1/20-second exposure; cap the trail to avoid a full revolution.
  const exposure=Math.min(rpm * 2 * Math.PI / 1200, Math.PI / 2);
  for (const propeller of propellers) {
    propeller.node.quaternion.copy(propeller.base).multiply(new THREE.Quaternion().setFromAxisAngle(propeller.axis,angle*propeller.direction));
    for (const ghost of propeller.blur) {
      ghost.visible=Boolean(enabled && blurEnabled && rpm>0);
      ghost.quaternion.setFromAxisAngle(propeller.axis,-exposure*ghost.userData.propellerBlur.fraction*propeller.direction);
    }
  }
}
