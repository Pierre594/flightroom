import * as THREE from 'three';

export const DEFAULT_CABLE_DIAMETER = .012; // meters

// Static hanging cable under uniform gravity (Three.js Y is the vertical axis).
// Sample at evenly spaced arc lengths to keep even nearly vertical curves stable.
export function cableCurve(start, end, length, segments = 64) {
  const delta = end.clone().sub(start);
  const distance = delta.length();
  const horizontal = Math.hypot(delta.x, delta.z);
  const impossible = distance > length + 1e-7;
  const points = [];
  if (length <= distance + 1e-7) {
    for (let i=0; i<=segments; i++) points.push(start.clone().lerp(end,i/segments));
  } else if (horizontal < 1e-7 || length - Math.abs(delta.y) < 1e-10) {
    // The zero-horizontal-span limit is a hanging fold, not a straight cable.
    const bottom = (start.y + end.y - length)/2;
    const down = start.y-bottom;
    for (let i=0; i<=segments; i++) {
      const s=length*i/segments;
      const y=s<=down ? start.y-s : bottom+(s-down);
      points.push(new THREE.Vector3(THREE.MathUtils.lerp(start.x,end.x,i/segments),y,THREE.MathUtils.lerp(start.z,end.z,i/segments)));
    }
  } else {
    const ratio = Math.sqrt((length-delta.y)*(length+delta.y))/horizontal;
    let low=0, high=1;
    while (Math.sinh(high)/high < ratio && high<40) high*=2;
    for(let i=0;i<64;i++) { const mid=(low+high)/2; if(Math.sinh(mid)/mid<ratio) low=mid; else high=mid; }
    const u=(low+high)/2, a=horizontal/(2*u);
    const t0=-u+Math.atanh(delta.y/length);
    const xc=-a*t0, s0=Math.sinh(t0);
    for(let i=0;i<=segments;i++) {
      const t=Math.asinh((length*i/segments)/a+s0);
      const x=xc+a*t;
      const y=start.y+2*a*Math.sinh((t+t0)/2)*Math.sinh((t-t0)/2);
      points.push(new THREE.Vector3(start.x+delta.x*x/horizontal,y,start.z+delta.z*x/horizontal));
    }
    points[0].copy(start); points[segments].copy(end);
  }
  return {points,distance,impossible};
}

// Reuse the same GPU buffers as the cable changes shape during playback.
export function makeCableMesh(segments = 64, sides = 8) {
  const positions = new Float32Array((segments+1)*sides*3);
  const indices = [];
  for(let i=0;i<segments;i++) for(let j=0;j<sides;j++) {
    const a=i*sides+j,b=i*sides+(j+1)%sides,c=(i+1)*sides+j,d=(i+1)*sides+(j+1)%sides;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  const material=new THREE.MeshStandardMaterial({color:0x73503d,roughness:.8,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material); mesh.frustumCulled=false; mesh.castShadow=true;
  const tangent=new THREE.Vector3(), normal=new THREE.Vector3(), binormal=new THREE.Vector3(), vertex=new THREE.Vector3();
  function update(points, impossible, diameter = DEFAULT_CABLE_DIAMETER) {
    const radius = diameter / 2;
    for(let i=0;i<=segments;i++) {
      tangent.subVectors(points[Math.min(i+1,segments)],points[Math.max(i-1,0)]);
      if(tangent.lengthSq()<1e-20) tangent.set(0,1,0); else tangent.normalize();
      normal.crossVectors(tangent,Math.abs(tangent.y)<.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0)).normalize();
      binormal.crossVectors(tangent,normal).normalize();
      for(let j=0;j<sides;j++) {
        const angle=j*2*Math.PI/sides; vertex.copy(points[i]).addScaledVector(normal,radius*Math.cos(angle)).addScaledVector(binormal,radius*Math.sin(angle));
        const n=(i*sides+j)*3; positions[n]=vertex.x;positions[n+1]=vertex.y;positions[n+2]=vertex.z;
      }
    }
    geometry.attributes.position.needsUpdate=true; geometry.computeVertexNormals();
    material.color.setHex(impossible?0xbf4d41:0x73503d);
  }
  return {mesh,update,dispose(){geometry.dispose();material.dispose();}};
}
