const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const animation = readFileSync(
  join(__dirname, '..', 'src', 'utils', 'animation.ts'),
  'utf8',
);

test('album background blur paints beyond the canvas edge to prevent dark clipping', () => {
  const start = animation.indexOf('export function animateCanvas(');
  const end = animation.indexOf('let prevColor', start);
  const source = animation.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(source, /const blurOverscan = blur \* 4/);
  assert.match(source, /const x = vals\.x - blurOverscan/);
  assert.match(source, /const y = vals\.y - blurOverscan/);
  assert.match(source, /const sizeX = vals\.width \+ blurOverscan \* 2/);
  assert.match(source, /const sizeY = vals\.height \+ blurOverscan \* 2/);
});
