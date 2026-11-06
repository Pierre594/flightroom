// Onshape names its untextured flat-color materials with the original sRGB
// components but exports those same components as glTF linear base colors.
// Correct only materials where both the exporter and the numeric name match.
// Other glTF files, textures, alpha settings and all other properties are kept.
export function correctOnshapeColors(gltf) {
  if (!/^ONSHAPE BY PTC INC\b/i.test(gltf.asset?.generator ?? '')) return 0;
  const seen = new Set();
  let corrected = 0;
  gltf.scene.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      if (!material.color || material.map || material.vertexColors) continue;
      const match = /^(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)_(\d+(?:\.\d+)?)(?:_|$)/.exec(material.name ?? '');
      if (!match) continue;
      const [r, g, b] = match.slice(1).map(Number);
      if ([r,g,b].some(v => v < 0 || v > 1) || Math.abs(material.color.r-r)>1e-5 || Math.abs(material.color.g-g)>1e-5 || Math.abs(material.color.b-b)>1e-5) continue;
      material.color.convertSRGBToLinear();
      corrected++;
    }
  });
  return corrected;
}
