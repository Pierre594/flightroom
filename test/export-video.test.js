import test from 'node:test';
import assert from 'node:assert/strict';
import {videoDimensions,videoFrameCount,videoFrameTiming} from '../src/export-video.js';
test('export resolution preserves both supported aspect ratios',()=>{
  assert.deepEqual(videoDimensions('16:9',1080),{width:1920,height:1080});
  assert.deepEqual(videoDimensions('4:3',1080),{width:1440,height:1080});
  assert.deepEqual(videoDimensions('16:9',720),{width:1280,height:720});
  assert.deepEqual(videoDimensions('16:9',540),{width:960,height:540});
  assert.deepEqual(videoDimensions('4:3',540),{width:720,height:540});
  assert.throws(()=>videoDimensions('16:9',1000),/Unsupported/);
});
test('frame timestamps cover the complete duration without depending on render speed',()=>{
  assert.equal(videoFrameCount(3),90);const last=videoFrameTiming(89,3);assert.ok(Math.abs(last.timestamp+last.duration-3)<1e-12);
  assert.equal(videoFrameCount(1.01),31);const partial=videoFrameTiming(30,1.01);assert.ok(Math.abs(partial.duration-.01)<1e-12);
  assert.equal(videoFrameCount(2,15),30);assert.equal(videoFrameTiming(15,2,15).timestamp,1);
  assert.equal(videoFrameCount(2,24),48);assert.equal(videoFrameTiming(24,2,24).timestamp,1);
});
