import * as THREE from 'three';

// Build one lightweight, color-matched mesh per rotor and share it between its
// translucent trailing samples. Original edges and shadow casters stay separate.
export function addPropellerBlur(root) {
  root.updateMatrixWorld(true);
  const pivots=[];
  root.traverse(node=>{ if (node.userData.propellerSpin) pivots.push(node); });
  for (const pivot of pivots) {
    const inverse=pivot.matrixWorld.clone().invert(), meshes=[];
    pivot.traverse(mesh=>{
      if (!mesh.isMesh || mesh.userData.droneShadowCaster || mesh.userData.propellerBlur || !mesh.geometry?.attributes?.position || Array.isArray(mesh.material) || !mesh.material?.visible) return;
      meshes.push(mesh);
    });
    const vertexCount=meshes.reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count,0);
    const indexCount=meshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count),0);
    if (!vertexCount || !indexCount) continue;
    const vertices=new Float32Array(vertexCount*3), colors=new Float32Array(vertexCount*3), indices=new Uint32Array(indexCount);
    let vertexOffset=0, indexOffset=0;
    for (const mesh of meshes) {
      const position=mesh.geometry.attributes.position, index=mesh.geometry.index;
      const transform=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
      const color=mesh.material.color ?? new THREE.Color(0xffffff), point=new THREE.Vector3();
      for (let i=0;i<position.count;i++) {
        point.fromBufferAttribute(position,i).applyMatrix4(transform);
        const j=(vertexOffset+i)*3;
        vertices[j]=point.x;vertices[j+1]=point.y;vertices[j+2]=point.z;
        colors[j]=color.r;colors[j+1]=color.g;colors[j+2]=color.b;
      }
      const count=index?.count ?? position.count;
      for (let i=0;i<count;i++) indices[indexOffset+i]=vertexOffset+(index ? index.getX(i) : i);
      vertexOffset+=position.count;indexOffset+=count;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geometry.setIndex(new THREE.BufferAttribute(indices,1));
    const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.12,depthWrite:false});
    for (const fraction of [1/4,2/4,3/4]) {
      const ghost=new THREE.Mesh(geometry,material);
      ghost.name='Propeller motion blur';ghost.userData.propellerBlur={fraction};ghost.visible=false;ghost.frustumCulled=false;
      pivot.add(ghost);
    }
  }
}
