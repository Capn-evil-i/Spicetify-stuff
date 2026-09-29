import CFM from "./config";

// Perspective HUD: simulates the TV overlay on a screen curved inwards around a vertical axis, like
// a curved monitor or a HUD lens. Nothing is stretched sideways and nothing turns. Every point
// keeps its horizontal position and is pulled toward the screen's horizontal midline, more the
// closer it is to the middle of the screen, so rows of text, the progress bar and the artwork bend
// in one smooth arc: rows below the midline arch up toward the middle, rows above it dip down.
//
// A point (x, y) is drawn at (x, cy + (y - cy) h(x)) with h(x) = 1 - k (1 + cos(pi u)) / 2, where
// u is -1 at the HUD's left margin, 0 at the screen centre and 1 at its right margin. h is 1 at
// the margins, so the HUD's outer edges and their gaps to the screen edge are unchanged, 1 - k in
// the middle, and flat at both ends and in the middle, so the arc has no sharp point anywhere.
//
// Text is not resampled (that loses anti-aliasing). Every word is sheared and scaled vertically to
// its slice of the arc: its upright strokes stay upright and its baseline follows the curve. Text
// blocks are sheared as a whole first, so their clipping boxes follow the curve with their words.
// Buttons and icons move with the curve. The artwork and progress bar bend through a small SVG
// displacement filter for what their move leaves over, and the blurred background bends the same
// way.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// At 100% strength the middle of the screen is drawn MAX_BEND closer to the midline.
const MAX_BEND = 0.2;

const LYRIC_LINES = "#fad-lyrics-plus-container .lyrics-lyricsContainer-LyricsLine";
// Text blocks bend as a whole and their words bend inside them. Lyric lines are placed by
// lyrics-plus's own transform, so they only move; the others are sheared.
const BLOCKS = [
    "#fsd-ctx-details",
    "#fsd-title > span",
    "#fsd-artist > span",
    "#fsd-album > span",
    "#fsd_up_next_text",
    LYRIC_LINES,
].join(", ");
const LINE = "fsd-curve-line";
const WORD = "fsd-curve-word";
// Small pieces that move with the curve as a whole. The perspective slider itself is left flat:
// bending it would move the track under the pointer while it is being dragged.
const PIECES = [
    "#fsd-ctx-icon",
    "#fsd-title > svg",
    "#fsd-artist > svg",
    "#fsd-album > svg",
    ".fsd-controls button",
    ".extra-controls button",
    "#fsd-elapsed",
    "#fsd-duration",
    "#fsd_next_tit_art",
    "#fsd-volume-container > *",
    "#fsd-overview-card > *",
].join(", ");
// Images and shapes too wide to move as a whole: they move, then a filter bends what is left.
const BENT = ["#fsd-art", "#fsd-progress-bar", "#fsd_next_art"].join(", ");
// The HUD's side margins are read from these, which only move when the layout does.
const LEFT_EDGE = "#fsd-ctx-icon, #fsd-art";
const DEFS = "fsd-curve-defs";

// A sheared box: its top-left corner is lifted by `lift` screen px and each px to the right is
// lifted `shear` px more.
type Shear = { shear: number; lift: number };
// A box on the flat layout, in screen px, and the scale its ancestors draw it at.
type Flat = { left: number; top: number; width: number; height: number; scale: number };
// A piece moved as a whole: vertical offset and vertical scale about its transform origin.
type Move = { dy: number; tall: number };

let bend = 0;
let margins = { left: 0, right: 0 };
let container: HTMLElement | null = null;
let frame = 0;
let filterCount = 0;
let textObserver: MutationObserver | null = null;
const sheared = new WeakMap<Element, Shear>();
const moved = new WeakMap<Element, Move>();
const written = new WeakMap<Element, string>();
const filters = new WeakMap<Element, { key: string; id: string }>();

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
        // Song changes replace the text and lyric lines; split the new words as they arrive.
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
    for (const element of container.querySelectorAll<HTMLElement>(`${BLOCKS}, ${WORD}, ${PIECES}, ${BENT}`)) reset(element);
    document.querySelectorAll(`#${DEFS} filter:not(.fsd-background-curve)`).forEach((filter) => filter.remove());
    joinWords();
}

function reset(element: HTMLElement) {
    for (const property of ["transform", "translate", "scale"]) element.style.removeProperty(property);
    if (filters.has(element)) {
        element.style.removeProperty("filter");
        document.getElementById(filters.get(element)!.id)?.remove();
    }
    sheared.delete(element);
    moved.delete(element);
    written.delete(element);
    filters.delete(element);
}

// How deep into the curve x is: 0 at the HUD's margins and beyond, rising smoothly to 1 at the
// centre, and its slope.
function depthAt(x: number) {
    const cx = window.innerWidth / 2;
    const half = x < cx ? cx - margins.left : margins.right - cx;
    if (half <= 0) return { depth: 0, slope: 0 };
    const u = (x - cx) / half;
    if (Math.abs(u) >= 1) return { depth: 0, slope: 0 };
    return { depth: (1 + Math.cos(Math.PI * u)) / 2, slope: -(Math.PI * Math.sin(Math.PI * u)) / (2 * half) };
}

// h(x): how far the screen at x is drawn from the midline, relative to flat.
function heightAt(x: number) {
    return 1 - bend * depthAt(x).depth;
}

// dh/dx.
function heightSlopeAt(x: number) {
    return -bend * depthAt(x).slope;
}

const midline = () => window.innerHeight / 2;
const curveY = (x: number, y: number) => midline() + (y - midline()) * heightAt(x);

function onScreen(box: Flat) {
    return box.left + box.width > 0 && box.left < window.innerWidth && box.top + box.height > 0 && box.top < window.innerHeight;
}

// A sheared box's flat layout: it never moves sideways, and its top-left corner was lifted by its
// own last lift plus whatever its block's shear and lift did at that point.
function shearedFlat(element: HTMLElement, parent: Shear | null, parentLeft: number): Flat | null {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || !element.offsetWidth) return null;
    const last = sheared.get(element) ?? { shear: 0, lift: 0 };
    const scale = box.width / element.offsetWidth;
    const shear = last.shear + (parent?.shear ?? 0);
    const parentLift = parent ? parent.lift + parent.shear * (box.left - parentLeft) : 0;
    const top = box.top - Math.min(0, shear * box.width) - last.lift - parentLift;
    return { left: box.left, top, width: box.width, height: element.offsetHeight * scale, scale };
}

// A piece's flat layout: undoes its last vertical move and scale about its transform origin.
function movedFlat(element: HTMLElement): (Flat & { origin: number }) | null {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const last = moved.get(element) ?? { dy: 0, tall: 1 };
    const scale = element.offsetWidth ? box.width / element.offsetWidth : 1;
    const originY = (parseFloat(getComputedStyle(element).transformOrigin.split(" ")[1]) || 0) * scale;
    const top = box.top - last.dy - originY * (1 - last.tall);
    return { left: box.left, top, width: box.width, height: box.height / last.tall, scale, origin: originY };
}

// Shears a block so its centre lands on the curve and its slope follows the curve there. Lyric
// lines only move: their own transform places them.
function placeBlock(block: HTMLElement, flat: Flat, isLine: boolean): Shear {
    const cx = flat.left + flat.width / 2;
    const cy = flat.top + flat.height / 2;
    const shear = isLine ? 0 : (cy - midline()) * heightSlopeAt(cx);
    const lift = curveY(cx, cy) - shear * (flat.width / 2) - flat.height / 2 - flat.top;
    sheared.set(block, { shear, lift });
    const key = `${shear.toFixed(4)}|${lift.toFixed(1)}`;
    if (written.get(block) !== key) {
        written.set(block, key);
        if (isLine) block.style.translate = `0 ${lift.toFixed(1)}px`;
        else block.style.transform = `matrix(1, ${shear.toFixed(4)}, 0, 1, 0, ${(lift / flat.scale).toFixed(2)})`;
    }
    return { shear, lift };
}

// Shears and scales a word vertically to its slice of the curve, on top of what its block already
// does to it.
function placeWord(word: HTMLElement, flat: Flat, parent: Shear | null, parentLeft: number) {
    const cx = flat.left + flat.width / 2;
    const cy = flat.top + flat.height / 2;
    const totalShear = (cy - midline()) * heightSlopeAt(cx);
    const tall = heightAt(cx);
    const targetTop = curveY(cx, cy) - totalShear * (flat.width / 2) - tall * (flat.height / 2);
    const shear = totalShear - (parent?.shear ?? 0);
    const parentLift = parent ? parent.lift + parent.shear * (flat.left - parentLeft) : 0;
    const lift = targetTop - flat.top - parentLift;
    sheared.set(word, { shear, lift });
    const key = `${shear.toFixed(4)}|${tall.toFixed(3)}|${lift.toFixed(1)}`;
    if (written.get(word) !== key) {
        written.set(word, key);
        word.style.transform = `matrix(1, ${shear.toFixed(4)}, 0, ${tall.toFixed(3)}, 0, ${(lift / flat.scale).toFixed(2)})`;
    }
}

// Moves a piece so its centre lands on the curve, scaled to the curve's height there.
function placePiece(piece: HTMLElement, flat: Flat & { origin: number }): Move {
    const cx = flat.left + flat.width / 2;
    const cy = flat.top + flat.height / 2;
    const tall = heightAt(cx);
    const origin = flat.top + flat.origin;
    const dy = curveY(cx, cy) - origin - tall * (cy - origin);
    const move = { dy, tall };
    moved.set(piece, move);
    const key = `${dy.toFixed(1)}|${tall.toFixed(3)}`;
    if (written.get(piece) !== key) {
        written.set(piece, key);
        piece.style.translate = `0 ${dy.toFixed(1)}px`;
        piece.style.scale = `1 ${tall.toFixed(3)}`;
    }
    return move;
}

// The HUD's side margin: the gap left of the context icon or artwork, or right of the lyrics,
// whichever is smaller, used on both sides so the curve stays centred on the screen.
function updateMargins(elements: HTMLElement[], flats: (Flat | null)[]) {
    const width = window.innerWidth;
    let margin = Infinity;
    elements.forEach((element, i) => {
        const flat = flats[i];
        if (!flat || !onScreen(flat)) return;
        if (element.matches(LEFT_EDGE)) margin = Math.min(margin, flat.left);
        else if (element.matches(LYRIC_LINES)) margin = Math.min(margin, width - flat.left - flat.width);
    });
    margin = Number.isFinite(margin) ? clamp(margin, 0, width / 4) : 0;
    margins = { left: margin, right: width - margin };
}

// Lays every piece out on the curve. Pieces keep moving (lyrics scroll, controls collapse), so
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
    const bent = Array.from(container.querySelectorAll<HTMLElement>(BENT));

    // Read every position first, then write, so the frame lays out once.
    const blockFlats = blocks.map((block) => shearedFlat(block, null, 0));
    const blockIndex = new Map(blocks.map((block, i) => [block as Element, i]));
    const wordBlocks = words.map((word) => word.closest<HTMLElement>(BLOCKS));
    const wordFlats = words.map((word, i) => {
        const block = wordBlocks[i];
        const flat = block ? blockFlats[blockIndex.get(block) ?? -1] : null;
        // Words of blocks off screen (lyrics far from the current line) wait until they scroll in.
        if (block && (!flat || !onScreen(flat))) return null;
        return shearedFlat(word, (block && sheared.get(block)) || null, flat?.left ?? 0);
    });
    const pieceFlats = pieces.map((piece) => movedFlat(piece));
    const bentFlats = bent.map((element) => movedFlat(element));
    const previousMargins = margins.left;
    updateMargins([...pieces, ...bent, ...blocks], [...pieceFlats, ...bentFlats, ...blockFlats]);
    if (Math.round(previousMargins) !== Math.round(margins.left)) updateBackground();

    const blockNow = new Map<Element, Shear>();
    blocks.forEach((block, i) => {
        const flat = blockFlats[i];
        if (flat && onScreen(flat)) blockNow.set(block, placeBlock(block, flat, block.matches(LYRIC_LINES)));
    });
    words.forEach((word, i) => {
        const flat = wordFlats[i];
        const block = wordBlocks[i];
        if (!flat) return;
        const blockFlat = block ? blockFlats[blockIndex.get(block) ?? -1] : null;
        placeWord(word, flat, (block && blockNow.get(block)) || null, blockFlat?.left ?? 0);
    });
    pieces.forEach((piece, i) => {
        const flat = pieceFlats[i];
        if (!flat) return;
        if (!onScreen(flat)) {
            if (moved.has(piece)) reset(piece);
            return;
        }
        placePiece(piece, flat);
    });
    bent.forEach((element, i) => {
        const flat = bentFlats[i];
        if (!flat) return;
        if (!onScreen(flat)) {
            if (moved.has(element)) reset(element);
            return;
        }
        bendRest(element, flat, placePiece(element, flat));
    });
    frame = requestAnimationFrame(tick);
}

function defs() {
    let svg = document.getElementById(DEFS) as SVGSVGElement | null;
    if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = DEFS;
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.style.position = "absolute";
        document.body.appendChild(svg);
    }
    return svg;
}

// A filter that only moves pixels vertically: the output at (x, y) shows the input at
// (x, y + shift(x, y)), over the region [x, x + width] x [y, y + height] of the element's own px.
function verticalShiftFilter(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    shift: (x: number, y: number) => number,
    className = "",
) {
    const mapWidth = Math.max(2, Math.round(width / 4));
    const mapHeight = Math.max(2, Math.round(height / 4));
    const shifts = new Float32Array(mapWidth * mapHeight);
    let most = 0;
    for (let j = 0; j < mapHeight; j++) {
        for (let i = 0; i < mapWidth; i++) {
            const value = shift(x + ((i + 0.5) / mapWidth) * width, y + ((j + 0.5) / mapHeight) * height);
            shifts[j * mapWidth + i] = value;
            most = Math.max(most, Math.abs(value));
        }
    }
    const range = Math.ceil(most * 2 * 1.02) || 1;
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(mapWidth, mapHeight);
    shifts.forEach((value, p) => {
        image.data[p * 4] = 128;
        image.data[p * 4 + 1] = Math.round(128 + (value / range) * 255);
        image.data[p * 4 + 2] = 128;
        image.data[p * 4 + 3] = 255;
    });
    context.putImageData(image, 0, 0);
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.id = id;
    if (className) filter.setAttribute("class", className);
    for (const [name, value] of Object.entries({ x, y, width, height })) filter.setAttribute(name, String(value));
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.innerHTML =
        `<feImage href="${canvas.toDataURL()}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="map" scale="${range}" xChannelSelector="R" yChannelSelector="G"/>`;
    return filter;
}

// The element has been moved so its centre sits on the curve; this bends the rest of it. The
// pixel drawn at the element's own point q shows the flat point whose curved position lands there.
function bendRest(element: HTMLElement, flat: Flat & { origin: number }, move: Move) {
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const key = [flat.left, flat.top, width, height, move.dy, margins.left].map(Math.round).join(",") + `|${bend}`;
    if (filters.get(element)?.key === key) return;
    const originY = flat.top + flat.origin;
    const shift = (qx: number, qy: number) => {
        const x = flat.left + qx * flat.scale;
        const drawnY = originY + move.tall * (flat.top + qy * flat.scale - originY) + move.dy;
        const flatY = midline() + (drawnY - midline()) / heightAt(x);
        return (flatY - flat.top) / flat.scale - qy;
    };
    // Room around the element for its shadow and for what the curve lifts past its edges.
    const corners = [shift(0, 0), shift(width, 0), shift(0, height), shift(width, height)];
    const room = 24 + Math.ceil(Math.max(...corners.map(Math.abs)));
    const id = `fsd-bend-${++filterCount}`;
    const previous = filters.get(element);
    defs().appendChild(verticalShiftFilter(id, -room, -room, width + 2 * room, height + 2 * room, shift));
    element.style.filter = `url(#${id})`;
    if (previous) document.getElementById(previous.id)?.remove();
    filters.set(element, { key, id });
}

// Wraps each run of text in one inline line element holding one box per word. The line keeps the
// block's own layout (line clamping counts it as a single child); the words can be transformed.
// Lyric lines hold a single text child, which React replaces whole when it changes, so splitting
// them is safe; the observer splits the new text again.
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

// The background is blurred, so bending it as an image looks clean. Its rows are pulled toward
// the midline like the HUD's, scaled so the flattest column keeps its full height and no pixel is
// taken from outside the image.
function updateBackground() {
    const canvas = container?.querySelector<HTMLCanvasElement>("#fsd-background");
    if (!canvas) return;
    if (!active() || !CFM.get("hudPerspectiveBackground")) {
        canvas.style.removeProperty("filter");
        document.querySelectorAll(`#${DEFS} .fsd-background-curve`).forEach((filter) => filter.remove());
        return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // The filter works in the canvas's own px; the animated background is drawn scaled up.
    const box = canvas.getBoundingClientRect();
    if (!width || !height || !box.width || !box.height) return;
    const scaleX = box.width / width;
    const scaleY = box.height / height;
    const place = [bend * 1000, margins.left, box.left, box.top, box.width, box.height].map(Math.round).join("-");
    const id = `fsd-background-curve-${place}-${width}x${height}`;
    if (!document.getElementById(id)) {
        document.querySelectorAll(`#${DEFS} .fsd-background-curve`).forEach((filter) => filter.remove());
        const lowest = 1 - bend;
        const shift = (x: number, y: number) => {
            const drawnY = box.top + y * scaleY;
            const flatY = midline() + ((drawnY - midline()) * lowest) / heightAt(box.left + x * scaleX);
            return (flatY - box.top) / scaleY - y;
        };
        defs().appendChild(verticalShiftFilter(id, 0, 0, width, height, shift, "fsd-background-curve"));
    }
    canvas.style.filter = `url(#${id})`;
}
