export function videoDimensions(frameFormat, height) {
  if (![540,720,1080].includes(height)) throw new Error('Unsupported export resolution.');
  return {width:frameFormat==='4:3' ? height*4/3 : height*16/9,height};
}
export function videoFrameCount(duration, fps = 30) { return Math.max(1,Math.ceil(duration*fps-1e-8)); }
export function videoFrameTiming(index,duration,fps = 30) {
  const timestamp=index/fps;
  return {timestamp,duration:Math.min(1/fps,duration-timestamp)};
}
