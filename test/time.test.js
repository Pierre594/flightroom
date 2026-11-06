import test from 'node:test';
import assert from 'node:assert/strict';
import {formatElapsedTime} from '../src/time.js';
test('timeline and video timestamps handle rounding across minute boundaries',()=>{
  assert.equal(formatElapsedTime(0),'00:00.0');assert.equal(formatElapsedTime(1.25),'00:01.3');
  assert.equal(formatElapsedTime(59.99),'01:00.0');assert.equal(formatElapsedTime(61.2),'01:01.2');assert.equal(formatElapsedTime(-1),'00:00.0');
});
