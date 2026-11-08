import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMathLabel, mathLabelSvg} from '../src/math-labels.js';

test('inline math can be mixed with ordinary text and escaped dollars', () => {
  assert.deepEqual(parseMathLabel(String.raw`Cost \$5, $T_{1}$ (N)`), [
    {text:'Cost $5, '}, {math:'T_{1}'}, {text:' (N)'},
  ]);
  assert.equal(parseMathLabel('Normal title'), null);
  assert.equal(parseMathLabel('Unclosed $x'), null);
});

test('common equations produce self-contained SVG and invalid math falls back', () => {
  for (const label of [String.raw`Tension $T_{\mathrm{est},1}$ (N)`, String.raw`$\frac{a}{b}$`, String.raw`$\boldsymbol{F} = m\alpha$`]) {
    const result=mathLabelSvg(label);
    assert.ok(result?.widthEm>0 && result.heightEm>0);
    assert.match(result.svg, /<svg/);
    assert.match(result.svg, /<path/);
  }
  assert.equal(mathLabelSvg(String.raw`$\notacommand$`), null);
  assert.equal(mathLabelSvg('Unclosed $x'), null);
});
