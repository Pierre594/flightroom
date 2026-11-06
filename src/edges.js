import * as THREE from 'three';
import { modelPartRoot } from './model-parts.js';

// Merge static edges in model coordinates and animated edges in each moving part.
export function addModelEdges(model, visible = true) {
  model.updateWorldMatrix(true, true);
  const cached = new Map();
  const groups = new Map();
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || !mesh.geometry?.attributes?.position) return;
    let geometry = cached.get(mesh.geometry);
    if (!geometry) {
      geometry = new THREE.EdgesGeometry(mesh.geometry, 20);
      cached.set(mesh.geometry, geometry);
    }
    const attribute = geometry.getAttribute('position');
    if (!attribute?.count) return;
    const owner = modelPartRoot(mesh, model);
    let group = groups.get(owner);
    if (!group) { group = {inverse:owner.matrixWorld.clone().invert(),parts:[],total:0}; groups.set(owner,group); }
    const transform = new THREE.Matrix4().multiplyMatrices(group.inverse, mesh.matrixWorld);
    const point = new THREE.Vector3();
    const values = new Float32Array(attribute.count * 3);
    for (let i=0; i<attribute.count; i++) {
      point.fromBufferAttribute(attribute, i).applyMatrix4(transform);
      values[i*3] = point.x; values[i*3+1] = point.y; values[i*3+2] = point.z;
    }
    group.parts.push(values); group.total += values.length;
    // Move the filled surface slightly back in depth so its edges remain visible.
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
      if (material) { material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1; }
    }
  });
  for (const geometry of cached.values()) geometry.dispose();
  let first = null;
  for (const [owner, group] of groups) {
    const vertices = new Float32Array(group.total); let offset = 0;
    for (const part of group.parts) { vertices.set(part, offset); offset += part.length; }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x151515, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = 'Drone feature edges'; lines.userData.droneEdges = true; lines.visible = visible; lines.renderOrder = 1;
    owner.add(lines); first ??= lines;
  }
  return first;
}
