// harfbuzzjs ships no typings; this covers the few calls the label shaper uses.
declare module "harfbuzzjs" {
  interface HbBuffer {
    addText(text: string): void;
    guessSegmentProperties(): void;
    json(): { g: number; ax: number; dx: number; dy: number }[];
    destroy(): void;
  }
  interface HbApi {
    createBlob(data: Uint8Array): unknown;
    createFace(blob: unknown, index: number): { upem: number };
    createFont(face: unknown): { glyphToPath(glyphId: number): string };
    createBuffer(): HbBuffer;
    shape(font: unknown, buffer: HbBuffer): void;
  }
  const ready: Promise<HbApi>;
  export default ready;
}
