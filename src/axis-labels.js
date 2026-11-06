import * as THREE from 'three';

// The flight frame is X/Y horizontal and Z up; Three.js maps (X,Y,Z) to (X,Z,-Y).
export function makeAxisLabels() {
  const group = new THREE.Group();
  const makeLabel = (text, position, color, title = false) => {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 144;
    const ctx = canvas.getContext('2d');
    ctx.scale(2,2);
    ctx.font = `700 35px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(248, 250, 246, 0.95)';
    ctx.strokeText(text,96,36); ctx.fillStyle = color; ctx.fillText(text,96,36);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter=THREE.LinearFilter; texture.generateMipmaps=false;
    // Draw with the opaque scene pass, but retain alpha blending for sharp,
    // antialiased text. Later scene objects can cover labels even if farther away.
    const material = new THREE.SpriteMaterial({map:texture,transparent:false,alphaTest:.001,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,depthTest:true,depthWrite:false,sizeAttenuation:false});
    const sprite = new THREE.Sprite(material); sprite.position.set(...position); sprite.scale.set(.128,.048,1); sprite.renderOrder=-1; group.add(sprite);
  };
  const xColor='#873928', yColor='#316c39', zColor='#315d88';
  const ticks=[];
  for (let n=-15;n<=15;n++) {
    if (!n) continue;
    makeLabel(`${n} m`,[n,.035,.23],xColor);
    makeLabel(`${n} m`,[.23,.035,-n],yColor);
    ticks.push(n,.02,-.045,n,.02,.045, -.045,.02,-n,.045,.02,-n);
  }
  makeLabel('0 m',[.1,.035,.14],'#6c756d');
  for (let n=1;n<=3;n++) {
    makeLabel(`${n} m`,[.23,n,0],zColor);
    ticks.push(-.045,n,0,.045,n,0);
  }
  makeLabel('X (m)',[15.3,.04,.23],xColor,true);
  makeLabel('Y (m)',[.23,.04,-15.3],yColor,true);
  makeLabel('Z (m)',[.23,3.25,0],zColor,true);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(ticks,3));
  const tickLines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x738375,transparent:false,opacity:.8,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,depthTest:true,depthWrite:false}));
  tickLines.renderOrder=-1; group.add(tickLines);
  return group;
}
