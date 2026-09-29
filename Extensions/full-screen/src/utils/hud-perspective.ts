import CFM from "./config";

// Perspective HUD: the TV overlay is laid out on a curved screen, like a monitor bent around the
// viewer. The left and right edges stay where they are and the middle of the screen is drawn
// smaller, so rows of text bow toward the vertical centre as they cross the screen.
//
// Text is not resampled (that loses anti-aliasing): text blocks, their words, lyric lines,
// buttons and images are each moved and turned (never resized) to follow the curve at their own
// position. The blurred background is bent as an image with an SVG displacement filter.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// How much smaller the middle of the screen is drawn at 100% strength.
const MAX_BEND = 0.2;

// Text blocks move as a whole; their words then only add their own difference along the curve,
// so words stay inside the blocks' clipping boxes.
const BLOCKS = ["#fsd-ctx-details", "#fsd-title > span", "#fsd-artist > span", "#fsd-album > span", "#fsd_up_next_text"].join(", ");
const LINE = "fsd-curve-line";
const WORD = "fsd-curve-word";
const LYRIC_LINES = "#fad-lyrics-plus-container .lyrics-lyricsContainer-LyricsLine";
const RIGID = [
    "#fsd-art",
    "#fsd-ctx-icon",
    "#fsd-title > svg",
    "#fsd-artist > svg",
    "#fsd-album > svg",
    ".fsd-controls button",
    ".extra-controls button",
    "#fsd-progress-container > *",
    "#fsd_next_art",
    LYRIC_LINES,
].join(", ");

let bend = 0;
let container: HTMLElement | null = null;
let frame = 0;
let textObserver: MutationObserver | null = null;
// Offset applied last frame; an element's own place on the flat layout is its box minus this.
const applied = new WeakMap<Element, number>();
const written = new WeakMap<Element, string>();

export function setHudPerspectiveStrength(element: HTMLElement, value: number) {
    container = element;
    const normalized = clamp(Number(value) || 0, 0, 100) / 100;
    const compactScale = window.innerWidth <= 800 ? 0.55 : 1;
    bend = MAX_BEND * normalized * compactScale;
    if (active()) start();
    else stop();
    updateBackground();
}

function active() {
    return Boolean(
        container?.isConnected &&
            container.classList.contains("hud-perspective") &&
            document.body.classList.contains("fsd-activated") &&
            bend > 0,
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
    for (const piece of container.querySelectorAll<HTMLElement>(`${BLOCKS}, ${RIGID}`)) reset(piece);
    joinWords();
}

function reset(piece: HTMLElement) {
    piece.style.removeProperty("translate");
    piece.style.removeProperty("rotate");
    piece.style.removeProperty("scale");
    applied.delete(piece);
    written.delete(piece);
}

// Where the curve puts a point of the flat layout: its vertical offset and the slope of the curve
// there. Pieces are moved and turned but keep their size, so heights never change.
function curveAt(x: number, y: number) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const u = clamp((x - cx) / cx, -1, 1);
    const scale = 1 - bend * (1 - u * u);
    return {
        dy: (y - cy) * (scale - 1),
        slope: Math.atan(((y - cy) * bend * 2 * u) / cx) * (180 / Math.PI),
    };
}

// Pieces parked off screen (the up-next card while hidden) are left flat.
function onScreen(centre: { x: number; y: number }) {
    return centre.x >= 0 && centre.x <= window.innerWidth && centre.y >= 0 && centre.y <= window.innerHeight;
}

function flatCentre(piece: Element) {
    const box = piece.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    // Rotation is about the centre, so only the vertical offset moved it.
    return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 - (applied.get(piece) ?? 0) };
}

function write(piece: HTMLElement, dy: number, slope: number | null) {
    const key = `${dy.toFixed(1)}|${slope?.toFixed(2)}`;
    if (written.get(piece) === key) return;
    written.set(piece, key);
    piece.style.translate = `0 ${dy.toFixed(1)}px`;
    if (slope !== null) piece.style.rotate = `${slope.toFixed(2)}deg`;
}

// Places every piece on the curve. Pieces keep moving (lyrics scroll, controls collapse), so this
// runs each frame while the curve is on and only writes styles that changed.
function tick() {
    frame = 0;
    if (!active() || !container) {
        stop();
        updateBackground();
        return;
    }
    const blocks = Array.from(container.querySelectorAll<HTMLElement>(BLOCKS));
    const words = Array.from(container.querySelectorAll<HTMLElement>(WORD));
    const rigid = Array.from(container.querySelectorAll<HTMLElement>(RIGID));
    // Read every position first, then write, so the frame lays out once.
    const blockCentres = blocks.map(flatCentre);
    const wordCentres = words.map(flatCentre);
    const rigidCentres = rigid.map(flatCentre);

    const blockDy = new Map<Element, number>();
    blocks.forEach((block, i) => {
        const centre = blockCentres[i];
        if (!centre) return;
        const { dy } = curveAt(centre.x, centre.y);
        blockDy.set(block, dy);
        applied.set(block, dy);
        write(block, dy, null);
    });
    words.forEach((word, i) => {
        const centre = wordCentres[i];
        if (!centre) return;
        const { dy, slope } = curveAt(centre.x, centre.y);
        const block = word.closest(BLOCKS);
        const inherited = block ? blockDy.get(block) ?? 0 : 0;
        applied.set(word, dy);
        write(word, dy - inherited, slope);
    });
    rigid.forEach((piece, i) => {
        const centre = rigidCentres[i];
        if (!centre) return;
        if (!onScreen(centre)) {
            if (applied.has(piece)) reset(piece);
            return;
        }
        const { dy, slope } = curveAt(centre.x, centre.y);
        applied.set(piece, dy);
        write(piece, dy, slope);
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

// The background is blurred, so bending it as an image looks clean. The middle is squeezed toward
// the centre like the overlay, then the canvas is stretched back so the squeeze leaves no gaps.
function updateBackground() {
    const canvas = container?.querySelector<HTMLCanvasElement>("#fsd-background");
    if (!canvas) return;
    if (!active() || !CFM.get("hudPerspectiveBackground")) {
        canvas.style.removeProperty("filter");
        canvas.style.removeProperty("transform");
        return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const id = `fsd-curve-${Math.round(bend * 1000)}-${width}x${height}`;
    if (!document.getElementById(id)) {
        document.getElementById("fsd-curve-filters")?.remove();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "fsd-curve-filters";
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
    canvas.style.transform = `scaleY(${(1 / (1 - bend)).toFixed(4)})`;
}

// Output pixel (x, y) takes the flat image at cy + (y - cy) / scale(x).
function displacementMap(width: number, height: number) {
    const cx = width / 2;
    const cy = height / 2;
    const scaleAt = (x: number) => 1 - bend * (1 - ((x - cx) / cx) ** 2);
    const maxShift = cy * (1 / scaleAt(cx) - 1);
    const range = Math.ceil(maxShift * 2 * 1.02) || 1;
    const mapWidth = Math.max(2, Math.round(width / 4));
    const mapHeight = Math.max(2, Math.round(height / 4));
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(mapWidth, mapHeight);
    for (let v = 0; v < mapHeight; v++) {
        for (let u = 0; u < mapWidth; u++) {
            const x = (u / (mapWidth - 1)) * width;
            const y = (v / (mapHeight - 1)) * height;
            const shift = (y - cy) * (1 / scaleAt(x) - 1);
            const i = (v * mapWidth + u) * 4;
            image.data[i] = 128;
            image.data[i + 1] = Math.round(128 + (shift / range) * 255);
            image.data[i + 2] = 128;
            image.data[i + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return { map: canvas.toDataURL(), scale: range };
}
