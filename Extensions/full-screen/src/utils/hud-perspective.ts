import CFM from "./config";

// Perspective HUD: a horizontal fisheye over the TV overlay. Nothing moves up or down or turns;
// the HUD is only stretched sideways, most in the middle, so text and artwork widen as they get
// closer to the centre.
//
// The warp is pinned at the HUD's own side margins, so the gap between the screen edge and the
// artwork or lyrics is the same with the effect on or off. Between the margins a point at u
// (-1 left margin, 0 centre, 1 right margin) is drawn at f(u) = u + k sin(pi u) / pi: the margins
// stay put, the centre is magnified by 1 + k, the margins are narrowed by 1 - k, and the curve is
// smooth everywhere, so there is no seam in the middle.
//
// Text is not resampled (that loses anti-aliasing): text blocks, their words, lyric lines,
// buttons and images are each moved and stretched to cover exactly their own slice of the curve.
// The blurred background is warped as an image with an SVG displacement filter.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Centre magnification at 100% strength is 1 + MAX_WARP, and the margins narrow to 1 - MAX_WARP.
const MAX_WARP = 0.4;

// Text blocks are stretched as a whole; their words then take only their own difference, which
// keeps every word inside its block's clipping box.
const BLOCKS = ["#fsd-ctx-details", "#fsd-title > span", "#fsd-artist > span", "#fsd-album > span", "#fsd_up_next_text"].join(", ");
const LINE = "fsd-curve-line";
const WORD = "fsd-curve-word";
const LYRIC_LINES = "#fad-lyrics-plus-container .lyrics-lyricsContainer-LyricsLine";
// The perspective slider itself is left flat: warping it would move the track under the pointer
// while it is being dragged.
const PIECES = [
    "#fsd-art",
    "#fsd-ctx-icon",
    "#fsd-title > svg",
    "#fsd-artist > svg",
    "#fsd-album > svg",
    ".fsd-controls button",
    ".extra-controls button",
    "#fsd-progress-container > *",
    "#fsd_next_art",
    "#fsd_next_tit_art",
    "#fsd-volume-container > *",
    "#fsd-overview-card > *",
    LYRIC_LINES,
].join(", ");
// The HUD's side margins are read from these, which only move when the layout does.
const LEFT_EDGE = "#fsd-ctx-icon, #fsd-art";

type Applied = { shift: number; stretch: number };
// A piece's box on the flat layout, and where its transform origin sits on it.
type Flat = { left: number; right: number; origin: number };
// x -> origin + stretch * (x - origin) + shift, which is what `translate` plus `scale` draw.
type Mapping = Applied & { origin: number };

const IDENTITY: Mapping = { origin: 0, shift: 0, stretch: 1 };
const backward = (m: Mapping, y: number) => m.origin + (y - m.shift - m.origin) / m.stretch;

let warp = 0;
let margins = { left: 0, right: 0 };
let container: HTMLElement | null = null;
let frame = 0;
let textObserver: MutationObserver | null = null;
const applied = new WeakMap<Element, Applied>();
const written = new WeakMap<Element, string>();

export function setHudPerspectiveStrength(element: HTMLElement, value: number) {
    container = element;
    const normalized = clamp(Number(value) || 0, 0, 100) / 100;
    const compactScale = window.innerWidth <= 800 ? 0.55 : 1;
    warp = MAX_WARP * normalized * compactScale;
    if (active()) start();
    else stop();
    updateBackground();
}

function active() {
    return Boolean(
        container?.isConnected &&
            container.classList.contains("hud-perspective") &&
            document.body.classList.contains("fsd-activated") &&
            warp > 0,
    );
}

function start() {
    splitWords();
    if (!textObserver && container) {
        // Song changes replace the text; split the new words as they arrive.
        textObserver = new MutationObserver(() => {
            splitWords();
            textObserver?.takeRecords();
        });
        textObserver.observe(container, { childList: true, characterData: true, subtree: true });
    }
    if (!frame) frame = requestAnimationFrame(tick);
}

function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    textObserver?.disconnect();
    textObserver = null;
    if (!container) return;
    for (const piece of container.querySelectorAll<HTMLElement>(`${BLOCKS}, ${PIECES}, ${WORD}`)) reset(piece);
    joinWords();
}

function reset(piece: HTMLElement) {
    piece.style.removeProperty("translate");
    piece.style.removeProperty("scale");
    applied.delete(piece);
    written.delete(piece);
}

// f(u) = u + k sin(pi u) / pi: f(+-1) = +-1, slope 1 + k at the centre and 1 - k at the ends.
function profile(u: number) {
    return u + (warp * Math.sin(Math.PI * u)) / Math.PI;
}

// Where the fisheye draws screen position x. Outside the margins nothing moves.
function fisheye(x: number) {
    const cx = window.innerWidth / 2;
    const half = x < cx ? cx - margins.left : margins.right - cx;
    if (half <= 0) return x;
    const u = (x - cx) / half;
    if (Math.abs(u) >= 1) return x;
    return cx + half * profile(u);
}

// The piece's box on the flat layout: undoes its parent block's transform, then its own from the
// last frame.
function flatBox(piece: HTMLElement, parent: Mapping): Flat | null {
    const box = piece.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const last = applied.get(piece) ?? { shift: 0, stretch: 1 };
    const shownLeft = backward(parent, box.left);
    const width = (backward(parent, box.right) - shownLeft) / last.stretch;
    // Our stretch is about the piece's transform origin, which keeps its own transform's scale.
    const ownScale = piece.offsetWidth ? width / piece.offsetWidth : 1;
    const offset = (parseFloat(getComputedStyle(piece).transformOrigin) || 0) * ownScale;
    const left = shownLeft - last.shift + offset * (last.stretch - 1);
    return { left, right: left + width, origin: left + offset };
}

// Moves and stretches the piece so its flat box [left, right] is drawn over
// [fisheye(left), fisheye(right)], given what its parent block already does to it.
function place(piece: HTMLElement, flat: Flat, parent: Mapping): Mapping {
    const left = backward(parent, fisheye(flat.left));
    const right = backward(parent, fisheye(flat.right));
    const stretch = (right - left) / (flat.right - flat.left);
    const shift = left - flat.origin - stretch * (flat.left - flat.origin);
    applied.set(piece, { shift, stretch });
    const key = `${shift.toFixed(1)}|${stretch.toFixed(3)}`;
    if (written.get(piece) !== key) {
        written.set(piece, key);
        piece.style.translate = `${shift.toFixed(1)}px 0`;
        piece.style.scale = `${stretch.toFixed(3)} 1`;
    }
    return { origin: flat.origin, shift, stretch };
}

function onScreen(box: Flat) {
    return box.right > 0 && box.left < window.innerWidth;
}

// The HUD's side margin: the gap left of the context icon or artwork, or right of the lyrics,
// whichever is smaller, used on both sides so the warp stays centred on the screen.
function updateMargins(pieces: HTMLElement[], flats: (Flat | null)[]) {
    const width = window.innerWidth;
    let margin = Infinity;
    pieces.forEach((piece, i) => {
        const flat = flats[i];
        if (!flat || !onScreen(flat)) return;
        if (piece.matches(LEFT_EDGE)) margin = Math.min(margin, flat.left);
        else if (piece.matches(LYRIC_LINES)) margin = Math.min(margin, width - flat.right);
    });
    margin = Number.isFinite(margin) ? clamp(margin, 0, width / 4) : 0;
    margins = { left: margin, right: width - margin };
}

// Lays every piece out on the fisheye. Pieces keep moving (lyrics scroll, controls collapse), so
// this runs each frame while the effect is on and only writes styles that changed.
function tick() {
    frame = 0;
    if (!active() || !container) {
        stop();
        updateBackground();
        return;
    }
    const blocks = Array.from(container.querySelectorAll<HTMLElement>(BLOCKS));
    const words = Array.from(container.querySelectorAll<HTMLElement>(WORD));
    const pieces = Array.from(container.querySelectorAll<HTMLElement>(PIECES));
    // Read every position first, then write, so the frame lays out once.
    const blockFlats = blocks.map((block) => flatBox(block, IDENTITY));
    const lastBlock = new Map<Element, Mapping>();
    blocks.forEach((block, i) => {
        const flat = blockFlats[i];
        const last = applied.get(block);
        if (flat && last) lastBlock.set(block, { origin: flat.origin, ...last });
    });
    const wordBlocks = words.map((word) => word.closest<HTMLElement>(BLOCKS));
    const wordFlats = words.map((word, i) => flatBox(word, (wordBlocks[i] && lastBlock.get(wordBlocks[i]!)) || IDENTITY));
    const pieceFlats = pieces.map((piece) => flatBox(piece, IDENTITY));
    updateMargins(pieces, pieceFlats);

    const blockNow = new Map<Element, Mapping>();
    blocks.forEach((block, i) => {
        const flat = blockFlats[i];
        if (flat) blockNow.set(block, place(block, flat, IDENTITY));
    });
    words.forEach((word, i) => {
        const flat = wordFlats[i];
        if (flat) place(word, flat, (wordBlocks[i] && blockNow.get(wordBlocks[i]!)) || IDENTITY);
    });
    pieces.forEach((piece, i) => {
        const flat = pieceFlats[i];
        if (!flat) return;
        if (!onScreen(flat)) {
            if (applied.has(piece)) reset(piece);
            return;
        }
        place(piece, flat, IDENTITY);
    });
    frame = requestAnimationFrame(tick);
}

// Wraps each run of text in one inline line element holding one box per word. The line keeps the
// block's own layout (line clamping counts it as a single child); the words can be transformed.
function splitWords() {
    if (!container) return;
    for (const block of container.querySelectorAll<HTMLElement>(BLOCKS)) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const texts: Text[] = [];
        while (walker.nextNode()) {
            const text = walker.currentNode as Text;
            if (!text.parentElement?.closest(LINE) && text.data.trim()) texts.push(text);
        }
        for (const text of texts) {
            const line = document.createElement(LINE);
            for (const part of text.data.split(/(\s+)/)) {
                if (!part) continue;
                if (/^\s+$/.test(part)) {
                    line.append(part);
                } else {
                    const word = document.createElement(WORD);
                    word.textContent = part;
                    line.append(word);
                }
            }
            text.replaceWith(line);
        }
    }
}

function joinWords() {
    if (!container) return;
    const parents = new Set<Node>();
    for (const line of container.querySelectorAll(LINE)) {
        if (line.parentNode) parents.add(line.parentNode);
        line.replaceWith(line.textContent ?? "");
    }
    parents.forEach((parent) => parent.normalize());
}

// The background is blurred, so warping it as an image looks clean.
function updateBackground() {
    const canvas = container?.querySelector<HTMLCanvasElement>("#fsd-background");
    if (!canvas) return;
    if (!active() || !CFM.get("hudPerspectiveBackground")) {
        canvas.style.removeProperty("filter");
        return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const id = `fsd-fisheye-${Math.round(warp * 1000)}-${width}x${height}`;
    if (!document.getElementById(id)) {
        document.getElementById("fsd-fisheye-filters")?.remove();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "fsd-fisheye-filters";
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.style.position = "absolute";
        const { map, scale } = displacementMap(width, height);
        svg.innerHTML =
            `<filter id="${id}" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
            `<feImage href="${map}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>` +
            `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
        document.body.appendChild(svg);
    }
    canvas.style.filter = `url(#${id})`;
}

// Output column x takes the flat image at the column the fisheye moved there (f inverted). The
// background has no margins, so it is warped edge to edge.
function displacementMap(width: number, height: number) {
    const cx = width / 2;
    // f is strictly increasing (slope >= 1 - k > 0), so a few Newton steps invert it.
    const inverse = (v: number) => {
        let u = v;
        for (let i = 0; i < 6; i++) u -= (profile(u) - v) / (1 + warp * Math.cos(Math.PI * u));
        return u;
    };
    let maxShift = 0;
    const mapWidth = Math.max(2, Math.round(width / 2));
    const shifts = new Float32Array(mapWidth);
    for (let i = 0; i < mapWidth; i++) {
        const v = (i / (mapWidth - 1)) * 2 - 1;
        shifts[i] = (inverse(v) - v) * cx;
        maxShift = Math.max(maxShift, Math.abs(shifts[i]));
    }
    const range = Math.ceil(maxShift * 2 * 1.02) || 1;
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = 1;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(mapWidth, 1);
    for (let i = 0; i < mapWidth; i++) {
        image.data[i * 4] = Math.round(128 + (shifts[i] / range) * 255);
        image.data[i * 4 + 1] = 128;
        image.data[i * 4 + 2] = 128;
        image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return { map: canvas.toDataURL(), scale: range };
}
