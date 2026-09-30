const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (...parts) => readFileSync(join(root, 'src', ...parts), 'utf8');
const app = read('app.tsx');
const config = read('ui', 'components', 'Config', 'Config.tsx');
const baseStyles = read('styles', 'base.scss');
const tvStyles = read('styles', 'tvMode.scss');

test('perspective works in every fullscreen mode, not only TV', () => {
  assert.match(app, /classList\.toggle\("hud-perspective", Boolean\(CFM\.get\("hudPerspective"\)\)\)/);
  assert.match(config, /classList\.toggle\("hud-perspective", Boolean\(CFM\.get\("hudPerspective"\)\)\)/);
  assert.doesNotMatch(app, /if \(CFM\.getMode\(\) === "tv"\) \{\s*ReactDOM\.render\(<PerspectiveBar/);
  assert.doesNotMatch(config, /CFM\.getMode\(\) === "tv"\s*\?\s*\[\s*this\.createToggle\(\s*translations\[LOCALE\]\.settings\.hudPerspective,/);
  assert.match(tvStyles, /^#full-screen-display\.hud-perspective \{/m);
});

test('the buttons row and the progress bar collapse on their own, in every mode', () => {
  assert.match(app, /classList\.toggle\("controls-collapsed", controlsHidden\)/);
  assert.match(app, /classList\.toggle\("progress-collapsed", progressHidden\)/);
  assert.match(baseStyles, /&\.controls-collapsed #fsd-status\.active,\s*&\.progress-collapsed #fsd-progress-parent \{\s*height: 0;/);
  assert.doesNotMatch(tvStyles, /&\.controls-collapsed \{/);
});

test('glows use the element\'s own colours', () => {
  assert.match(baseStyles, /--fsd-control-glow: drop-shadow\(0 0 2px var\(--fsd-own-glow\)\) drop-shadow\(0 0 8px var\(--fsd-own-glow\)\);/);
  assert.match(baseStyles, /&\.glow-art \{\s*#fsd-art \{[\s\S]*?&::before \{[\s\S]*?background-image: var\(--fsd-art-url\);[\s\S]*?filter: blur\(22px\)/);
  assert.match(app, /setProperty\("--fsd-art-url"/);
  assert.match(baseStyles, /#fsd-perspective-bar-inner,\s*#perspective-thumb,\s*#fsd-perspective-toggle \{/);
});

test('lyrics fade at their edges and their buttons sit in the corner, in every mode', () => {
  assert.match(baseStyles, /\.lyrics-lyricsContainer-SyncedLyricsPage \{\s*-webkit-mask-image: linear-gradient/);
  assert.match(baseStyles, /\.lyrics-config-button-container \{\s*position: fixed;\s*right: 16px;\s*bottom: 16px;/);
  assert.match(baseStyles, /\.lyrics-config-button \{\s*margin: 0 0 0 6px;\s*border-radius: 8px;\s*background-color: transparent;/);
});

test('split words underline themselves instead of underlining the spaces between them', () => {
  assert.match(tvStyles, /\.fsd-song-meta span:hover,\s*\.fsd-artist-list span:hover \{\s*text-decoration: none;\s*fsd-curve-word \{\s*text-decoration: underline;/);
});
