import * as THREE from 'three';

export function validAnnotations(annotations) {
  return Array.isArray(annotations) && new Set(annotations.map(a=>a?.id)).size===annotations.length && annotations.every(a=>
    a && typeof a.id==='string' && a.id.length>0 && typeof a.text==='string' && a.text.trim().length>0 && a.text.length<=120 &&
    [a.x,a.y,a.z,a.start,a.end].every(Number.isFinite) && a.start>=0 && a.end>=a.start &&
    (a.size===undefined || (Number.isFinite(a.size) && a.size>=.1 && a.size<=20)) &&
    (a.flightId==null || (typeof a.flightId==='string' && a.flightId.length>0)));
}
export function annotationVisible(annotation, elapsed) { return elapsed>=annotation.start && elapsed<=annotation.end; }
// CSV coordinates are Z-up; Three.js maps (X,Y,Z) to (X,Z,-Y).
export function annotationScenePosition(annotation, flightPosition = null) {
  if(annotation.flightId && !flightPosition) return null;
  return [annotation.x+(flightPosition?.x ?? 0),annotation.z+(flightPosition?.y ?? 0),-annotation.y+(flightPosition?.z ?? 0)];
}

export function makeAnnotationSprite(annotation) {
  const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d');
  ctx.font='600 40px sans-serif';
  canvas.width=Math.max(120,Math.min(1500,Math.ceil(ctx.measureText(annotation.text).width+48))); canvas.height=80;
  ctx.font='600 40px sans-serif';ctx.textBaseline='middle';ctx.textAlign='center';
  ctx.fillStyle='rgba(34,48,37,.88)';ctx.beginPath();ctx.roundRect(0,0,canvas.width,canvas.height,14);ctx.fill();
  ctx.fillStyle='#ffffff';ctx.fillText(annotation.text,canvas.width/2,canvas.height/2,canvas.width-40);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,sizeAttenuation:false});
  const sprite=new THREE.Sprite(material); sprite.position.set(annotation.x,annotation.z,-annotation.y);
  sprite.userData.annotationAspect=canvas.width/canvas.height; sprite.userData.annotationSize=annotation.size ?? 1; sprite.renderOrder=10;
  return sprite;
}
