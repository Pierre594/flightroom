export const CUBE_FACE_ORDER = ['px','nx','py','ny','pz','nz'];
export function validBackgroundData(data) {
  return typeof data === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(data);
}
export function orderCubeFiles(files) {
  if(files.length!==6) throw new Error('Select exactly six files named px, nx, py, ny, pz and nz.');
  const byName = new Map();
  for (const file of files) {
    const name=file.name.replace(/\.[^.]+$/,'').toLowerCase();
    if (!CUBE_FACE_ORDER.includes(name) || byName.has(name)) throw new Error('Cube face names must be px, nx, py, ny, pz and nz.');
    byName.set(name,file);
  }
  return CUBE_FACE_ORDER.map(name=>byName.get(name));
}
export function normalizeBackground(background) {
  if(background == null) return null;
  const kind=background.kind ?? 'panorama';
  if(kind==='panorama' && validBackgroundData(background.data)) return {kind,name:String(background.name||'Sky panorama'),data:background.data,visible:Boolean(background.visible),legacy:background.kind==null};
  if(kind==='cube' && Array.isArray(background.faces) && background.faces.length===6 && background.faces.every(validBackgroundData)) return {kind,name:String(background.name||'Cube skybox'),faces:background.faces,visible:Boolean(background.visible)};
  throw new Error('Invalid skybox data.');
}
