export function normalizeProjectName(value) {
  if(typeof value!=='string')throw new Error('Enter a project name.');
  const name=value.trim().replace(/\.json$/i,'').trim();
  if(!name||name==='.'||name==='..'||/[\\/<>:"|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||new TextEncoder().encode(name).length>200)throw new Error('Enter a project name without path separators or invalid filename characters (maximum 200 UTF-8 bytes).');
  return name;
}
