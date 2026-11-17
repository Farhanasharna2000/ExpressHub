const MAX_EDGE = 1600;
const TARGET_BYTES = 1_500_000;

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be prepared"))), type, quality);
  });
}

// Re-drawing the photo on a canvas downsizes it and drops EXIF data such as GPS location.
export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The image could not be prepared");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob.size <= TARGET_BYTES) return blob;
  }
  throw new Error("This photo is too large. Take it again closer up.");
}

export function signatureToBlob(canvas: HTMLCanvasElement) {
  return toBlob(canvas, "image/png");
}

// Keyboard fallback: the typed name is drawn as the signature image.
export async function typedSignature(name: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The signature could not be prepared");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111827";
  context.font = "italic 44px 'Segoe Script', 'Brush Script MT', cursive";
  context.textBaseline = "middle";
  context.fillText(name.slice(0, 40), 24, canvas.height / 2, canvas.width - 48);
  context.font = "14px sans-serif";
  context.fillStyle = "#6b7280";
  context.fillText("Typed by courier on the recipient's behalf", 24, canvas.height - 18);
  return toBlob(canvas, "image/png");
}
