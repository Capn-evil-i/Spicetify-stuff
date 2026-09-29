const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const styles = readFileSync(join(root, 'src', 'styles', 'base.scss'), 'utf8');
const tvStyles = readFileSync(join(root, 'src', 'styles', 'tvMode.scss'), 'utf8');
const settingsStyles = readFileSync(join(root, 'src', 'styles', 'settings.scss'), 'utf8');
const configUi = readFileSync(join(root, 'src', 'ui', 'components', 'Config', 'Config.tsx'), 'utf8');
const popupModal = readFileSync(join(root, 'src', 'ui', 'components', 'PopupModal', 'PopupModal.tsx'), 'utf8');
const english = readFileSync(join(root, 'src', 'resources', 'locales', 'en-US.json'), 'utf8');
const defaults = readFileSync(join(root, 'src', 'constants', 'defaults.ts'), 'utf8');
const app = readFileSync(join(root, 'src', 'app.tsx'), 'utf8');
const progress = readFileSync(
  join(root, 'src', 'ui', 'components', 'ProgressBar', 'ProgressBar.tsx'),
  'utf8',
);
const overviewCard = readFileSync(
  join(root, 'src', 'ui', 'components', 'OverviewPopup', 'OverviewCard.tsx'),
  'utf8',
);
const htmlCreator = readFileSync(join(root, 'src', 'services', 'html-creator.ts'), 'utf8');
const activeLyricsClass = '.rzOQhNuCNTsDR8rE8ss1.dPaa_Hg0z0Ql_UBrV9uZ';

test('fullscreen progress glow targets the rendered fill and thumb in both toggle states', () => {
  assert.match(progress, /id="fsd-progress-bar-inner"/);
  assert.match(progress, /id="progress-thumb"/);

  const enabledStart = styles.indexOf('&.glow-progress {');
  const disabledStart = styles.indexOf('&:not(.glow-progress) {', enabledStart);
  const controlsStart = styles.indexOf('&.glow-controls {', disabledStart);
  assert.ok(enabledStart >= 0 && disabledStart > enabledStart && controlsStart > disabledStart);

  const enabled = styles.slice(enabledStart, disabledStart);
  const disabled = styles.slice(disabledStart, controlsStart);
  for (const selector of ['#fsd-progress-bar-inner', '#progress-thumb']) {
    assert.ok(enabled.includes(selector), `${selector} must receive glow when enabled`);
    assert.ok(disabled.includes(selector), `${selector} must be reset when glow is disabled`);
  }
});

test('Lyrics Plus current active line is styled when glow is on and off', () => {
  const enabledStart = styles.indexOf('&.glow-lyrics #fad-lyrics-plus-container');
  const disabledStart = styles.indexOf('&:not(.glow-lyrics) #fad-lyrics-plus-container');
  const titleStart = styles.indexOf('&.glow-title #fsd-title');
  assert.ok(enabledStart >= 0 && disabledStart > enabledStart && titleStart > disabledStart);
  assert.ok(styles.slice(enabledStart, disabledStart).includes(activeLyricsClass));
  assert.ok(styles.slice(disabledStart, titleStart).includes(activeLyricsClass));
});

test('song-title glow stays within a compact blur radius', () => {
  const start = styles.indexOf('&.glow-title #fsd-title');
  const end = styles.indexOf('&:not(.glow-title)', start);
  const title = styles.slice(start, end);
  assert.match(title, /0 0 12px/);
  assert.doesNotMatch(title, /0 0 (16|32)px/);
});

test('Glow All is prominent and synchronizes all six individual glow switches', () => {
  const glowGroup = configUi.slice(configUi.indexOf('const GLOW_SETTING_KEYS'), configUi.indexOf('export class ConfigManager'));
  for (const key of ['glowLyrics', 'glowTitle', 'glowDetails', 'glowProgressBar', 'glowControls', 'glowArt']) {
    assert.ok(glowGroup.includes(`"${key}"`), `${key} must be controlled by Glow All`);
    assert.ok(configUi.includes(`createGlowToggle(translations[LOCALE].settings.${key}, "${key}")`));
  }
  assert.match(configUi, /GLOW_SETTING_KEYS\.forEach\(\(key\) => CFM\.set\(key, enabled\)\)/);
  assert.match(configUi, /static syncGlowSettingInputs\(\)[\s\S]*?input\.checked = Boolean\(CFM\.get\(key\)\)/);
  assert.match(configUi, /this\.syncGlowSettingInputs\(\);\s*PopupModal\.display/);
  assert.match(configUi, /toggle\.indeterminate = partiallyEnabled/);
  assert.match(english, /"glowAll": "Glow All"/);
  assert.match(settingsStyles, /\.glow-all-setting[\s\S]*?width: 58px;[\s\S]*?height: 28px;/);
});

test('track-info glow stays close to the text instead of making gray bands', () => {
  const start = styles.indexOf('&.glow-details {');
  const end = styles.indexOf('&:not(.glow-details)', start);
  const details = styles.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(details, /0 0 3px/);
  assert.match(details, /0 0 12px/);
  assert.match(details, /#fsd-ctx-details/);
  assert.match(details, /#fsd-ctx-icon/);
  assert.doesNotMatch(details, /0 0 (14|16|24)px/);
});

test('player-control glow covers volume and overview buttons, including active controls', () => {
  for (const selector of [
    '.fsd-controls button',
    '#fsd-status button',
    '#fsd-volume-icon',
    '#fsd-volume-bar-inner',
    '#volume-thumb',
    '#fsd-time-display',
    '#fsd-overview-pin-button',
    '#fsd-overview-button-container button',
  ]) {
    assert.ok(styles.includes(selector), `${selector} should share the player-control glow`);
  }
  assert.match(styles, /filter: saturate\(1\.5\) contrast\(1\.5\) var\(--fsd-control-glow/);
  assert.match(styles, /--fsd-control-glow: drop-shadow\(0 0 3px var\(--fsd-glow-highlight\)\)/);
  assert.match(styles, /#fsd-volume-bar\s*\{[^}]*box-shadow:[^;]*!important;/);
  assert.match(styles, /#fsd-volume-bar-inner,[\s\S]*?#volume-thumb\s*\{[^}]*box-shadow:[^}]*!important;/);
});

test('TV lyrics keep scrolling available without painting a native scrollbar at the warped edge', () => {
  const tv = tvStyles.slice(tvStyles.indexOf('#full-screen-display[mode="tv"] {'));
  assert.match(tv, /#fad-lyrics-plus-container\s+\.lyrics-lyricsContainer-LyricsContainer[\s\S]*?scrollbar-width:\s*none\s*!important/);
  assert.match(tv, /&::-webkit-scrollbar\s*\{[^}]*display:\s*none\s*!important/);
});

test('album-art glow stays within the same restrained 12px radius', () => {
  const start = styles.indexOf('&.glow-art {');
  const end = styles.indexOf('&:not(.glow-art)', start);
  const art = styles.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(art, /0 0 12px/);
  assert.doesNotMatch(art, /0 0 (20|24|36)px/);
  assert.match(art, /#fsd-art-inner\s*\{\s*box-shadow: none !important;/);
});

test('text, controls, progress, and artwork share the active-lyrics glow strength', () => {
  assert.match(styles, /--fsd-glow-highlight: rgba\(255, 255, 255, 0\.95\)/);
  assert.match(styles, /--fsd-glow-color: rgba\(var\(--main-color\), 0\.55\)/);
  assert.match(styles, /0 0 3px var\(--fsd-glow-highlight\)/);
  assert.match(styles, /0 0 12px var\(--fsd-glow-color\)/);
  assert.doesNotMatch(styles, /0 0 (14|15|20|24)px/);
});

test('dialog child clicks do not count as clicks on the backdrop', () => {
  assert.match(popupModal, /if \(e\.target === dialog\) PopupModal\.hide\(\)/);
  assert.doesNotMatch(popupModal, /getBoundingClientRect\(\)/);
});

test('TV mode fits lyrics, metadata, and controls on narrow screens', () => {
  // Desktop TV keeps the stock lyrics column.
  assert.match(tvStyles, /#fad-lyrics-plus-container \{\s*width: 45%;/);
  assert.doesNotMatch(tvStyles, /clamp\(72px, 5vw, 120px\)/);

  const compactLayout = tvStyles.slice(tvStyles.indexOf('@media (max-width: 800px)'));
  for (const selector of [
    '#fad-lyrics-plus-container',
    '#fsd-foreground',
    '#fsd-art',
    '#fsd-details',
    '#fsd-status',
    '#fsd-progress-parent',
  ]) {
    assert.ok(compactLayout.includes(selector), `${selector} must have a compact layout rule`);
  }
  assert.match(compactLayout, /left: 16px;/);
  assert.match(compactLayout, /right: 16px;/);
  assert.match(compactLayout, /height: 72%/);
  assert.match(compactLayout, /height: auto;/);
  assert.match(compactLayout, /max-width: none;/);
  assert.match(compactLayout, /@media \(max-width: 480px\)[\s\S]*?#fsd-ctx-name[\s\S]*?white-space: nowrap/);
  assert.match(compactLayout, /\.lyrics-lyricsContainer-SyncedLyrics\s*\{\s*--lyrics-font-size: clamp\(15px, 4\.4vw, 18px\)/);
  assert.doesNotMatch(compactLayout, /\.lyrics-lyricsContainer-LyricsLine-active\s*\{\s*font-size:/);
});

test('Perspective HUD is opt-in, TV-only, and curves the HUD on compact displays too', () => {
  assert.match(defaults, /hudPerspective: false/);
  assert.match(app, /CFM\.getMode\(\) === "tv" && Boolean\(CFM\.get\("hudPerspective"\)\)/);
  assert.match(configUi, /translations\[LOCALE\]\.settings\.hudPerspective[\s\S]*?"hudPerspective"/);
  assert.match(english, /"hudPerspective": "Perspective HUD"/);
  assert.match(defaults, /hudPerspectiveStrength: 40/);
  assert.match(configUi, /createRange\([\s\S]*?"hudPerspectiveStrength"/);
  assert.ok(htmlCreator.includes('<canvas id="fsd-background"></canvas>\n<div id="fsd-hud-layer">'), 'the canvas must remain outside the transformed HUD');
  for (const id of ['fsd-ctx-container', 'fsd-upnext-container', 'fsd-volume-parent', 'fsd-overview-card-parent', 'fad-lyrics-plus-container', 'fsd-foreground']) {
    assert.ok(htmlCreator.includes(`id="${id}"`), `${id} must be included in the shared HUD markup`);
  }
  assert.match(tvStyles, /fsd-curve-word/);
});

test('Perspective HUD keeps the clock card and its reveal zone at the top centre', () => {
  assert.match(overviewCard, /evt\.clientX \/ window\.innerWidth > 0\.3 &&\s*evt\.clientX \/ window\.innerWidth < 0\.7/);
  assert.doesNotMatch(overviewCard, /revealFromTopRight/);
});
