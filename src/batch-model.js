import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { modelPartRoot } from './model-parts.js';

// Onshape exports often contain thousands of independent, rigid meshes. Merge
// only compatible opaque pieces with the same material and moving-part parent.
// Animated, transparent, skinned, instanced and otherwise special meshes remain
// untouched; other exporters are intentionally left unchanged.
export function batchRigidOnshapeMeshes(gltf) {
  if (!/^ONSHAPE BY PTC INC\b/i.test(gltf.asset?.generator ?? '') || gltf.animations?.length) return 0;
  const root=gltf.scene, groups=new Map(), removedGeometries=new Set();
  root.updateMatrixWorld(true);
  root.traverse(mesh=>{
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.children.length || mesh.userData.droneShadowCaster || mesh.userData.propellerBlur || mesh.morphTargetInfluences || Array.isArray(mesh.material)) return;
    const material=mesh.material, geometry=mesh.geometry;
    if (!material || !material.visible || material.transparent || material.opacity!==1 || material.blending!==THREE.NormalBlending || material.transmission>0 || !geometry?.attributes?.position || Object.keys(geometry.morphAttributes).length) return;
    if (geometry.drawRange.start!==0 || geometry.drawRange.count<(geometry.index?.count ?? geometry.attributes.position.count)) return;
    for(let node=mesh;node;node=node.parent) if (!node.visible) return;
    const attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b));
    if (attributes.some(([,attribute])=>attribute.isInterleavedBufferAttribute || !attribute.array)) return;
    const owner=modelPartRoot(mesh,root);
    const transform=new THREE.Matrix4().multiplyMatrices(owner.matrixWorld.clone().invert(),mesh.matrixWorld);
    if (transform.determinant()<=0) return;
    const signature=attributes.map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join('|');
    const key=[owner.uuid,material.uuid,mesh.renderOrder,mesh.layers.mask,mesh.castShadow,mesh.receiveShadow,mesh.frustumCulled,Boolean(geometry.index),signature].join('/');
    let group=groups.get(key);
    if(!group) { group={owner,material,meshes:[],transforms:[]};groups.set(key,group); }
    group.meshes.push(mesh);group.transforms.push(transform);
  });
  let removed=0;
  for(const group of groups.values()) {
    if(group.meshes.length<2) continue;
    const parts=[]; let geometry;
    try {
      for(let i=0;i<group.meshes.length;i++) parts.push(group.meshes[i].geometry.clone().applyMatrix4(group.transforms[i]));
      geometry=mergeGeometries(parts,false);
    } catch {
      // Keep the original parts if a model contains an unsupported geometry.
      geometry=null;
    }
    finally { for(const part of parts) part.dispose(); }
    if(!geometry) continue;
    const source=group.meshes[0],batch=new THREE.Mesh(geometry,group.material);
    batch.name='Combined rigid model parts';batch.renderOrder=source.renderOrder;batch.layers.mask=source.layers.mask;
    batch.castShadow=source.castShadow;batch.receiveShadow=source.receiveShadow;batch.frustumCulled=source.frustumCulled;
    group.owner.add(batch);
    for(const mesh of group.meshes) { removedGeometries.add(mesh.geometry);mesh.removeFromParent();removed++; }
  }
  const retained=new Set();root.traverse(node=>{if(node.geometry)retained.add(node.geometry);});
  for(const geometry of removedGeometries) if(!retained.has(geometry)) geometry.dispose();
  return removed;
}
