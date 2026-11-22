import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import hbReady from "harfbuzzjs";

// pdf-lib cannot shape Bangla: it skips conjunct and mark positioning, so letters such as
// "প্র" or "ট্ট" come out garbled. HarfBuzz (WebAssembly) shapes the text, and each glyph is
// then drawn as a vector outline, so the PDF needs no embedded font and prints sharp at any size.

export type BengaliWeight = "regular" | "bold";

interface ShapedGlyph { path: string; advance: number; dx: number; dy: number }
export interface ShapedRun { glyphs: ShapedGlyph[]; width: (size: number) => number; scale: (size: number) => number }

interface HbFont {
  font: { glyphToPath(id: number): string };
  face: { upem: number };
  paths: Map<number, string>;
}

const FONT_FILES: Record<BengaliWeight, string> = { regular: "NotoSansBengali-Regular.ttf", bold: "NotoSansBengali-Bold.ttf" };
const MAX_CACHED_RUNS = 500;

type Hb = Awaited<typeof hbReady>;
let ready: Promise<{ hb: Hb; fonts: Record<BengaliWeight, HbFont> }> | null = null;
const shapedRuns = new Map<string, ShapedRun>();
let loaded: { hb: Hb; fonts: Record<BengaliWeight, HbFont> } | null = null;

// hb draws in y-up font units; pdf-lib's SVG paths are y-down, so y is negated once here.
function flipY(svgPath: string) {
  return svgPath.replace(/(-?[\d.]+(?:e[-+]?\d+)?),(-?[\d.]+(?:e[-+]?\d+)?)/gi, (_, x: string, y: string) => `${x},${-Number(y)}`);
}

async function loadFont(hb: Hb, weight: BengaliWeight): Promise<HbFont> {
  const bytes = await readFile(path.join(process.cwd(), "assets", "fonts", FONT_FILES[weight]));
  const face = hb.createFace(hb.createBlob(bytes), 0);
  return { font: hb.createFont(face), face, paths: new Map() };
}

// Loads HarfBuzz and both fonts once per server instance. Call before shaping.
export function prepareBengaliShaping() {
  ready ??= (async () => {
    const hb = await hbReady;
    const [regular, bold] = await Promise.all([loadFont(hb, "regular"), loadFont(hb, "bold")]);
    loaded = { hb, fonts: { regular, bold } };
    return loaded;
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready.then(() => undefined);
}

// Synchronous once prepareBengaliShaping() has resolved, so text can be measured while wrapping.
export function shapeBengali(text: string, weight: BengaliWeight): ShapedRun {
  if (!loaded) throw new Error("prepareBengaliShaping() must finish before shaping text");
  const key = `${weight}:${text}`;
  const cached = shapedRuns.get(key);
  if (cached) return cached;
  const { hb, fonts } = loaded;
  const hbFont = fonts[weight];
  const buffer = hb.createBuffer();
  let glyphs: ShapedGlyph[];
  try {
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(hbFont.font, buffer);
    glyphs = buffer.json().map((glyph: { g: number; ax: number; dx: number; dy: number }) => {
      let outline = hbFont.paths.get(glyph.g);
      if (outline === undefined) {
        outline = flipY(hbFont.font.glyphToPath(glyph.g));
        hbFont.paths.set(glyph.g, outline);
      }
      return { path: outline, advance: glyph.ax, dx: glyph.dx, dy: glyph.dy };
    });
  } finally {
    buffer.destroy();
  }
  const upem = hbFont.face.upem;
  const total = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0);
  const run: ShapedRun = { glyphs, scale: (size) => size / upem, width: (size) => (total * size) / upem };
  if (shapedRuns.size >= MAX_CACHED_RUNS) shapedRuns.clear();
  shapedRuns.set(key, run);
  return run;
}
