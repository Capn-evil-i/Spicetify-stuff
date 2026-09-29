const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const helper = readFileSync(join(root, 'src', 'utils', 'hud-perspective.ts'), 'utf8');
const app = readFileSync(join(root, 'src', 'app.tsx'), 'utf8');
const config = readFileSync(join(root, 'src', 'ui', 'components', 'Config', 'Config.tsx'), 'utf8');
const upNext = readFileSync(join(root, 'src', 'ui', 'components', 'UpNext', 'UpNext.ts'), 'utf8');
const htmlCreator = readFileSync(join(root, 'src', 'services', 'html-creator.ts'), 'utf8');
const baseStyles = readFileSync(join(root, 'src', 'styles', 'base.scss'), 'utf8');
const tvStyles = readFileSync(join(root, 'src', 'styles', 'tvMode.scss'), 'utf8');

test('perspective strength sets the curve and compact layouts keep a gentler one', () => {
  assert.match(helper, /clamp\(Number\(value\) \|\| 0, 0, 100\)/);
  assert.match(helper, /window\.innerWidth <= 800 \? 0\.55 : 1/);
  assert.match(helper, /const MAX_BEND = /);
  assert.match(app, /setHudPerspectiveStrength\(DOM\.container, Number\(CFM\.get\("hudPerspectiveStrength"\)\)\)/);
  assert.match(config, /input\.oninput = \(\) =>[\s\S]*?setHudPerspectiveStrength\(DOM\.container, strength\)/);
  assert.match(baseStyles, /#fsd-hud-layer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?transform-style:\s*flat;/);
});

test('the curve keeps the edges and squeezes the middle, moving pieces instead of resampling text', () => {
  // scale(x) = 1 - bend * (1 - u^2): 1 at the edges (u = +-1), smallest in the middle.
  assert.match(helper, /const scale = 1 - bend \* \(1 - u \* u\);/);
  assert.match(helper, /dy: \(y - cy\) \* \(scale - 1\),/);
  assert.match(helper, /piece\.style\.translate = /);
  assert.match(helper, /write\(word, dy - inherited, slope, scale\)/);
  assert.match(helper, /piece\.style\.rotate = /);
  // Text is split into words that each follow the curve, and joined again when the curve is off.
  assert.match(helper, /function splitWords\(\)/);
  assert.match(helper, /function joinWords\(\)/);
  assert.match(tvStyles, /\.hud-perspective \{\s*fsd-curve-word \{\s*display: inline-block;/);
  // The flat HUD layer itself is never transformed or filtered, so clicks land where things are drawn.
  assert.doesNotMatch(tvStyles, /#fsd-hud-layer\s*\{[^}]*(transform|filter|perspective):/);
  assert.doesNotMatch(tvStyles, /--fsd-hud-yaw|hud-curve/);
  assert.doesNotMatch(tvStyles, /\.hud-perspective\s*\{[\s\S]*?#fsd-overview-card\s*\{\s*left: auto;/, 'the clock card stays where it is');
});

test('only the blurred background is bent as an image, and it can be turned off', () => {
  assert.match(helper, /feDisplacementMap/);
  assert.match(helper, /CFM\.get\("hudPerspectiveBackground"\)/);
  assert.match(helper, /#fsd-background/);
});

test('the blur canvas stays outside the shared layer and every fullscreen HUD element stays inside it', () => {
  const canvasIndex = htmlCreator.indexOf('<canvas id="fsd-background"></canvas>');
  const layerIndex = htmlCreator.indexOf('<div id="fsd-hud-layer">');
  const layerEnd = htmlCreator.lastIndexOf('</div>');
  assert.ok(canvasIndex >= 0 && layerIndex > canvasIndex, 'the artwork canvas must precede the HUD layer');
  assert.ok(layerEnd > layerIndex, 'the HUD layer must close after its children');
  const hudMarkup = htmlCreator.slice(layerIndex, layerEnd);
  for (const id of [
    'fsd-ctx-container',
    'fsd-upnext-container',
    'fsd-volume-parent',
    'fsd-overview-card-parent',
    'fad-lyrics-plus-container',
    'fsd-foreground',
    'fsd-progress-parent',
  ]) {
    assert.ok(hudMarkup.includes(`id="${id}"`), `${id} must be inside the shared HUD layer`);
  }
});

test('the up-next overlay keeps its show and hide states while joining the shared warp', () => {
  assert.match(upNext, /classList\.add\("upnext-visible"\)/);
  assert.match(upNext, /classList\.remove\("upnext-visible"\)/);
  assert.match(baseStyles, /#fsd-upnext-container[\s\S]*?&\.upnext-visible[\s\S]*?translateX\(0px\)/);
});

test('phone lyrics get enough scroll viewport to keep the active line visible', () => {
  assert.match(tvStyles, /@media \(max-width: 480px\)[\s\S]*?\.lyrics-lyricsContainer-LyricsContainer\s*\{\s*height: calc\(95% \+ clamp\(64px, calc\(376px - 80vw\), 120px\)\) !important/);
  assert.match(tvStyles, /@media \(max-width: 360px\)[\s\S]*?\.lyrics-lyricsContainer-SyncedLyrics\s*\{\s*--lyrics-font-size: clamp\(14px, 4\.2vw, 15\.5px\)/);
  assert.match(tvStyles, /@media \(max-width: 340px\)[\s\S]*?\.lyrics-lyricsContainer-SyncedLyrics\s*\{\s*--lyrics-font-size: 13px/);
  assert.match(tvStyles, /@media \(max-width: 340px\)[\s\S]*?#fad-lyrics-plus-container\s*\{\s*top: -12px;[\s\S]*?height: calc\(95% \+ 160px\) !important/);
});
