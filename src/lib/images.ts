import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

async function resize(file: File, maxSize: number, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", quality));
  if (blob) return blob;
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), "image/jpeg", quality));
}

/**
 * Resizes on the device (saves mobile data) and uploads a full image + a
 * small thumbnail. Returns their download URLs.
 */
export async function uploadProductImage(branchId: string, file: File): Promise<{ imageUrl: string; thumbUrl: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const id = crypto.randomUUID();
  const [full, thumb] = await Promise.all([resize(file, 1200), resize(file, 400, 0.78)]);
  const ext = full.type === "image/webp" ? "webp" : "jpg";
  const fullRef = ref(storage, `products/${branchId}/${id}.${ext}`);
  const thumbRef = ref(storage, `products/${branchId}/${id}_thumb.${ext}`);
  await Promise.all([
    uploadBytes(fullRef, full, { contentType: full.type, cacheControl: "public,max-age=31536000" }),
    uploadBytes(thumbRef, thumb, { contentType: thumb.type, cacheControl: "public,max-age=31536000" }),
  ]);
  const [imageUrl, thumbUrl] = await Promise.all([getDownloadURL(fullRef), getDownloadURL(thumbRef)]);
  return { imageUrl, thumbUrl };
}
