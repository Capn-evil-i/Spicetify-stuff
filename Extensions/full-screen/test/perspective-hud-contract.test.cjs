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

test('perspective strength sets the bend and compact layouts keep a gentler one', () => {
  assert.match(helper, /clamp\(Number\(value\) \|\| 0, 0, 100\)/);
  assert.match(helper, /window\.innerWidth <= 800 \? 0\.55 : 1/);
  assert.match(helper, /const MAX_BEND = 0\.09;/);
  assert.match(app, /setHudPerspectiveStrength\(DOM\.container, Number\(CFM\.get\("hudPerspectiveStrength"\)\)\)/);
  assert.match(config, /input\.oninput = \(\) =>[\s\S]*?setHudPerspectiveStrength\(DOM\.container, strength\)/);
  assert.match(baseStyles, /#fsd-hud-layer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?transform-style:\s*flat;/);
});

test('the HUD bends like a screen curved inwards: rows arc, nothing stretches sideways or turns', () => {
  // (x, y) -> (x, cy + (y - cy) h(x)), h = 1 - k (1 - u^2): 1 at the margins, level in the middle,
  // and steepest toward the edges instead of flattening off near them.
  assert.match(helper, /return \{ depth: 1 - u \* u, slope: \(-2 \* u\) \/ half \};/);
  assert.doesNotMatch(helper, /Math\.cos\(Math\.PI \* u\)/);
  assert.match(helper, /const curveY = \(x: number, y: number\) => midline\(\) \+ \(y - midline\(\)\) \* heightAt\(x\);/);
  // Pinned at the HUD's own margins, so the gap to the screen edge is the same on and off.
  assert.match(helper, /const half = x < cx \? cx - margins\.left : margins\.right - cx;/);
  // Words, the artwork and the progress bar are sheared (upright edges stay upright) and scaled
  // only vertically; no sideways scale, and nothing is resampled, so edges stay anti-aliased.
  assert.match(helper, /word\.style\.transform = `matrix\(1, \$\{shear\.toFixed\(4\)\}, 0, \$\{tall\.toFixed\(3\)\}, 0, /);
  assert.match(helper, /piece\.style\.translate = `0 \$\{dy\.toFixed\(1\)\}px`/);
  assert.match(helper, /piece\.style\.scale = `1 \$\{tall\.toFixed\(3\)\}`/);
  assert.match(helper, /placeSheared\(element, flat, null, 0\);/);
  assert.doesNotMatch(helper, /function bendRest|element\.style\.filter/, 'no displacement filter on HUD elements');
  assert.doesNotMatch(helper, /style\.rotate|rotate\(/, 'nothing turns');
  // Text blocks are sheared as a whole so their clipping follows the curve. Lyric lines stay where
  // lyrics-plus puts them and their words bend around the line's middle.
  assert.match(helper, /linePin\.set\(block, liftAt\(/);
  assert.doesNotMatch(helper, /block\.style\.translate/, 'lyric lines are not moved');
  assert.match(helper, /const BLOCKS = \[[\s\S]*?LYRIC_LINES,\s*\]\.join/);
  assert.match(helper, /function splitWords\(\)/);
  assert.match(helper, /function joinWords\(\)/);
  assert.match(tvStyles, /\.hud-perspective \{\s*fsd-curve-word \{\s*display: inline-block;\s*transform-origin: 0 0;/);
  assert.match(helper, /const BENT = \[\s*"#fsd-art",\s*"#fsd-progress-bar",\s*"#fsd_next_art",\s*"#fsd-ctx-icon",/);
  assert.doesNotMatch(helper, /"#fsd-perspective-container > \*"/, 'the slider is not bent under the pointer');
  // The HUD layer itself is never transformed or filtered, so clicks land where things are drawn.
  assert.doesNotMatch(tvStyles, /#fsd-hud-layer\s*\{[^}]*(transform|filter|perspective):/);
  assert.doesNotMatch(tvStyles, /\.hud-perspective\s*\{[\s\S]*?#fsd-overview-card\s*\{\s*left: auto;/, 'the clock card stays where it is');
});

test('the blurred background bends too, never from outside the image, and it can be turned off', () => {
  assert.match(helper, /feDisplacementMap/);
  assert.match(helper, /xChannelSelector="R" yChannelSelector="G"/);
  assert.match(helper, /const lowest = 1 - bend;/);
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

test('lyrics fade out at the top and bottom instead of being cut off', () => {
  // On the synced page (the box that clips the lines), not the container holding the buttons, and
  // not the zero-height lines wrapper, which would hide everything.
  assert.match(baseStyles, /\.lyrics-lyricsContainer-SyncedLyricsPage \{\s*-webkit-mask-image: linear-gradient\(to bottom, transparent 0%, #000 14%, #000 80%, transparent 100%\);/);
  assert.doesNotMatch(tvStyles, /\.lyrics-lyricsContainer-SyncedLyrics,|\.lyrics-lyricsContainer-SyncedLyrics \{[^}]*mask/);
});
