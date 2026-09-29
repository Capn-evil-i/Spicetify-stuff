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

test('perspective strength sets the fisheye and compact layouts keep a gentler one', () => {
  assert.match(helper, /clamp\(Number\(value\) \|\| 0, 0, 100\)/);
  assert.match(helper, /window\.innerWidth <= 800 \? 0\.55 : 1/);
  assert.match(helper, /const MAX_WARP = /);
  assert.match(app, /setHudPerspectiveStrength\(DOM\.container, Number\(CFM\.get\("hudPerspectiveStrength"\)\)\)/);
  assert.match(config, /input\.oninput = \(\) =>[\s\S]*?setHudPerspectiveStrength\(DOM\.container, strength\)/);
  assert.match(baseStyles, /#fsd-hud-layer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?transform-style:\s*flat;/);
});

test('the HUD is laid out on a screen curved inwards, mainly horizontally, without tilting', () => {
  // f(u) = u - k sin(pi u) / pi: f(+-1) = +-1, the sides drawn wider (closer), the middle narrower.
  assert.match(helper, /return u - \(warp \* Math\.sin\(Math\.PI \* u\)\) \/ Math\.PI;/);
  // Pinned at the HUD's own margins, so the gap to the screen edge is the same on and off.
  assert.match(helper, /const half = x < cx \? cx - margins\.left : margins\.right - cx;/);
  assert.match(helper, /function updateMargins\(/);
  // Height follows only a share of the width change, and nothing moves vertically or turns.
  assert.match(helper, /const VERTICAL = 0\.3;/);
  assert.match(helper, /piece\.style\.translate = `\$\{shift\.toFixed\(1\)\}px 0`/);
  assert.match(helper, /piece\.style\.scale = `\$\{stretch\.toFixed\(3\)\} \$\{ownTall\.toFixed\(3\)\}`/);
  assert.doesNotMatch(helper, /style\.rotate/, 'nothing is tilted');
  // Lyric lines bend word by word like the title, and words stay inside their scaled block.
  assert.match(helper, /const BLOCKS = \[[\s\S]*?LYRIC_LINES,\s*\]\.join/);
  assert.match(helper, /place\(word, flat, \(block && blockNow\.get\(block\)\) \|\| IDENTITY\)/);
  // Lyric lines move by their own vertical transform, so only their words change height.
  assert.match(helper, /blockNow\.set\(block, place\(block, flat, IDENTITY, false\)\)/);
  assert.match(helper, /function splitWords\(\)/);
  assert.match(helper, /function joinWords\(\)/);
  assert.match(tvStyles, /\.hud-perspective \{\s*fsd-curve-word \{\s*display: inline-block;/);
  assert.doesNotMatch(helper, /"#fsd-perspective-container > \*"/, 'the slider is not warped under the pointer');
  // The HUD layer itself is never transformed or filtered, so clicks land where things are drawn.
  assert.doesNotMatch(tvStyles, /#fsd-hud-layer\s*\{[^}]*(transform|filter|perspective):/);
  assert.doesNotMatch(tvStyles, /\.hud-perspective\s*\{[\s\S]*?#fsd-overview-card\s*\{\s*left: auto;/, 'the clock card stays where it is');
});

test('only the blurred background is warped as an image, and it can be turned off', () => {
  assert.match(helper, /feDisplacementMap/);
  assert.match(helper, /xChannelSelector="R" yChannelSelector="G"/);
  // The background never samples from outside the image.
  assert.match(helper, /tall\[i\] = \(1 \+ VERTICAL \* \(slope\(u\) - 1\)\) \/ shortest;/);
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
