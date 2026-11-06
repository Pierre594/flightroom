import * as THREE from 'three';
import { modelPartRoot } from './model-parts.js';

// Opaque meshes share an invisible shadow caster per rigid model part.
// Parts requiring material-dependent shadows or deformation keep their own caster.
export function addShadowCaster(model) {
  model.updateWorldMatrix(true, true);
  const groups = new Map();
  model.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const dynamic = mesh.isSkinnedMesh || mesh.isInstancedMesh || Boolean(mesh.morphTargetInfluences);
    const special = materials.some(m => !m || m.transparent || m.alphaTest > 0 || m.alphaMap || m.transmission > 0 || m.displacementMap || m.visible === false);
    if (dynamic || special) { mesh.castShadow = true; return; }
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const available = index ? index.count : position.count;
    const first = Math.min(available, Math.max(0, geometry.drawRange.start));
    const count = Math.max(0, Math.min(available-first, geometry.drawRange.count));
    if (!count) return;
    const vertices = new Float32Array(count * 3);
    const owner = modelPartRoot(mesh, model);
    let group=groups.get(owner);
    if (!group) { group={inverse:owner.matrixWorld.clone().invert(),chunks:[],total:0}; groups.set(owner,group); }
    const transform = new THREE.Matrix4().multiplyMatrices(group.inverse, mesh.matrixWorld);
    const point = new THREE.Vector3();
    for (let i=0; i<count; i++) {
      point.fromBufferAttribute(position, index ? index.getX(first+i) : first+i).applyMatrix4(transform);
      vertices[i*3] = point.x; vertices[i*3+1] = point.y; vertices[i*3+2] = point.z;
    }
    group.chunks.push(vertices); group.total += vertices.length;
  });
  let first=null;
  for (const [owner,group] of groups) {
    const positions = new Float32Array(group.total); let offset = 0;
    for (const chunk of group.chunks) { positions.set(chunk, offset); offset += chunk.length; }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material = new THREE.MeshBasicMaterial({colorWrite:false, depthWrite:false, side:THREE.DoubleSide});
    const caster = new THREE.Mesh(geometry,material);
    caster.name = 'Drone shadow caster'; caster.userData.droneShadowCaster = true; caster.castShadow = true; caster.frustumCulled = false;
    owner.add(caster); first ??= caster;
  }
  return first;
}

// Fit a directional shadow map to the entire flight and its ground projections.
export function fitShadowLight(light, flights, modelRadius = 0) {
  const direction = new THREE.Vector3(4,8,5).normalize();
  const bounds = new THREE.Box3();
  for (const flight of flights) for (const row of flight.rows) {
    const p = new THREE.Vector3(row.x_m,row.z_m,-row.y_m);
    bounds.expandByPoint(p);
    bounds.expandByPoint(new THREE.Vector3(p.x-p.y*direction.x/direction.y,0,p.z-p.y*direction.z/direction.y));
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,1,1));
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(2,bounds.getSize(new THREE.Vector3()).length()/2+Math.max(0,modelRadius)*2+.5);
  const distance = radius*3+5;
  light.target.position.copy(center); light.target.updateMatrixWorld();
  light.position.copy(center).addScaledVector(direction,distance);
  const cam=light.shadow.camera; cam.left=-radius; cam.right=radius; cam.top=radius; cam.bottom=-radius; cam.near=.1; cam.far=distance+radius*2; cam.updateProjectionMatrix();
  light.shadow.needsUpdate = true;
}
