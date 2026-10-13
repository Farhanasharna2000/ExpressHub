/** Decode and resize a selected image before saving a small, square JPEG avatar. */
export async function prepareProfilePhoto(file: File): Promise<string> {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const validMime = [
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/png",
    "image/x-png",
    "image/webp",
  ].includes(type);
  const validExt = /\.(jpe?g|png|webp)$/i.test(name);

  if (!validMime && !validExt) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 5 MB.");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be opened. Choose another photo."));
      image.src = url;
      if ("decode" in image) {
        image.decode().then(() => resolve()).catch(() => {
          // If decode rejects, onload or dimension check will handle
        });
      }
    });

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("This image could not be opened. Choose another photo.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 320;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Photo processing is unavailable. Please try another browser.");
    }

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 320, 320);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      320,
      320,
    );

    let quality = 0.85;
    let photo = canvas.toDataURL("image/jpeg", quality);
    while (photo.length > 280000 && quality > 0.4) {
      quality -= 0.15;
      photo = canvas.toDataURL("image/jpeg", quality);
    }

    if (photo.length > 280000) {
      throw new Error("Choose a smaller photo.");
    }
    return photo;
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error("This image could not be opened. Choose another photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}