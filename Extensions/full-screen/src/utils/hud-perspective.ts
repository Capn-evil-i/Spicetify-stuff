import CFM from "./config";

// Perspective HUD: a horizontal fisheye over the TV overlay. Nothing moves up or down or turns;
// the screen is only stretched sideways, most in the middle and not at all at the left and right
// edges, so text and artwork widen as they get closer to the centre.
//
// A point at u (-1 left edge, 0 centre, 1 right edge) is drawn at g(u) = u(1 + k) / (1 + k u^2).
// g keeps both edges in place, magnifies the centre by 1 + k and is smooth everywhere, so there
// is no seam in the middle.
//
// Text is not resampled (that loses anti-aliasing): words, lyric lines, buttons and images are
// each moved and stretched to cover exactly their own slice of the curve. The blurred background
// is warped as an image with an SVG displacement filter.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Magnification of the centre at 100% strength is 1 + MAX_WARP.
const MAX_WARP = 0.5;

// Text blocks move as a whole; their words then add only their own difference, so words stay
// inside the blocks' clipping boxes.
const BLOCKS = ["#fsd-ctx-details", "#fsd-title > span", "#fsd-artist > span", "#fsd-album > span", "#fsd_up_next_text"].join(", ");
const LINE = "fsd-curve-line";
const WORD = "fsd-curve-word";
const LYRIC_LINES = "#fad-lyrics-plus-container .lyrics-lyricsContainer-LyricsLine";
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
    "#fsd-perspective-container > *",
    "#fsd-overview-card > *",
    LYRIC_LINES,
].join(", ");

type Applied = { shift: number; stretch: number };

let warp = 0;
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

// Where the fisheye draws screen position x.
function fisheye(x: number) {
    const cx = window.innerWidth / 2;
    const u = clamp((x - cx) / cx, -1, 1);
    return cx + (cx * u * (1 + warp)) / (1 + warp * u * u);
}

// The piece's box on the flat layout (before the fisheye), undoing what was applied last frame.
// `outer` is the shift its block already moved it by.
function flatBox(piece: HTMLElement, outer: number) {
    const box = piece.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const last = applied.get(piece) ?? { shift: 0, stretch: 1 };
    const width = box.width / last.stretch;
    // Our stretch is about the piece's transform origin, which keeps its own transform's scale.
    const originOffset = parseFloat(getComputedStyle(piece).transformOrigin) || 0;
    const ownScale = piece.offsetWidth ? width / piece.offsetWidth : 1;
    const left = box.left - outer - last.shift + originOffset * ownScale * (last.stretch - 1);
    return { left, right: left + width, originOffset: originOffset * ownScale };
}

// Moves and stretches the piece so its flat box [left, right] covers [fisheye(left), fisheye(right)].
function place(piece: HTMLElement, box: { left: number; right: number; originOffset: number }, outer: number, stretchIt: boolean) {
    const target = { left: fisheye(box.left), right: fisheye(box.right) };
    const stretch = stretchIt ? (target.right - target.left) / (box.right - box.left) : 1;
    const origin = box.left + box.originOffset;
    const shift = target.left - origin - stretch * (box.left - origin) - outer;
    applied.set(piece, { shift, stretch });
    const key = `${shift.toFixed(1)}|${stretch.toFixed(3)}`;
    if (written.get(piece) === key) return;
    written.set(piece, key);
    piece.style.translate = `${shift.toFixed(1)}px 0`;
    if (stretchIt) piece.style.scale = `${stretch.toFixed(3)} 1`;
}

function onScreen(box: { left: number; right: number }) {
    return box.right > 0 && box.left < window.innerWidth;
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
    const blockBoxes = blocks.map((block) => flatBox(block, 0));
    const wordOuter = words.map((word) => {
        const block = word.closest<HTMLElement>(BLOCKS);
        return block ? applied.get(block)?.shift ?? 0 : 0;
    });
    const wordBoxes = words.map((word, i) => flatBox(word, wordOuter[i]));
    const pieceBoxes = pieces.map((piece) => flatBox(piece, 0));

    // Blocks only move (their words stretch); the shift is taken at the block's centre.
    const blockShift = new Map<Element, number>();
    blocks.forEach((block, i) => {
        const box = blockBoxes[i];
        if (!box) return;
        const centre = (box.left + box.right) / 2;
        const shift = fisheye(centre) - centre;
        blockShift.set(block, shift);
        applied.set(block, { shift, stretch: 1 });
        const key = shift.toFixed(1);
        if (written.get(block) !== key) {
            written.set(block, key);
            block.style.translate = `${key}px 0`;
        }
    });
    words.forEach((word, i) => {
        const box = wordBoxes[i];
        if (!box) return;
        const block = word.closest<HTMLElement>(BLOCKS);
        place(word, box, block ? blockShift.get(block) ?? 0 : 0, true);
    });
    pieces.forEach((piece, i) => {
        const box = pieceBoxes[i];
        if (!box) return;
        if (!onScreen(box)) {
            if (applied.has(piece)) reset(piece);
            return;
        }
        place(piece, box, 0, true);
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

// Output column x takes the flat image at the column the fisheye moved there (g inverted).
function displacementMap(width: number, height: number) {
    const cx = width / 2;
    const inverse = (v: number) =>
        v === 0 || warp === 0 ? v : ((1 + warp) - Math.sqrt((1 + warp) ** 2 - 4 * warp * v * v)) / (2 * warp * v);
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
