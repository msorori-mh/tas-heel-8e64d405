import { assetMagicMatches } from "../content-factory/golden-lesson-assets.ts";

/** Self-contained raster stimulus. Travels with the revision and its offline pack. */
export interface QuestionImage {
  src: string;
  alt: string;
}

export const QUESTION_IMAGE_MAX_BYTES = 512 * 1024;
export const QUESTION_IMAGE_MAX_SRC_LENGTH = 4 * Math.ceil(QUESTION_IMAGE_MAX_BYTES / 3) + 32;

export function parseQuestionImage(value: unknown): QuestionImage | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("بنية صورة السؤال غير صالحة.");
  const image = value as Record<string, unknown>;
  if (Object.keys(image).some((key) => key !== "src" && key !== "alt"))
    throw new Error("حقول صورة السؤال غير معتمدة.");
  if (typeof image.alt !== "string" || !image.alt.trim() || image.alt.length > 500)
    throw new Error("اكتب وصفًا لصورة السؤال لا يتجاوز 500 حرف.");
  if (typeof image.src !== "string" || image.src.length > QUESTION_IMAGE_MAX_SRC_LENGTH)
    throw new Error("صورة السؤال تتجاوز 512 كيلوبايت.");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.src);
  if (!match || match[2].length % 4 !== 0)
    throw new Error("صورة السؤال يجب أن تكون PNG أو JPEG أو WebP مضمنة، دون روابط خارجية.");
  let decoded: string;
  try {
    decoded = atob(match[2]);
  } catch {
    throw new Error("ترميز صورة السؤال غير صالح.");
  }
  if (decoded.length > QUESTION_IMAGE_MAX_BYTES || btoa(decoded) !== match[2])
    throw new Error("حجم أو ترميز صورة السؤال غير صالح.");
  const prefix = Uint8Array.from(decoded.slice(0, 16), (character) => character.charCodeAt(0));
  if (!assetMagicMatches(match[1], prefix)) throw new Error("محتوى الصورة لا يطابق صيغتها.");
  return { src: image.src, alt: image.alt.trim() };
}

export function questionImageFromBytes(
  bytes: Uint8Array,
  extension: string,
  alt: string,
): QuestionImage {
  if (bytes.byteLength > QUESTION_IMAGE_MAX_BYTES)
    throw new Error("صورة السؤال تتجاوز 512 كيلوبايت؛ قلّل حجمها ثم أعد الاستيراد.");
  const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return parseQuestionImage({ src: `data:${mime};base64,${btoa(binary)}`, alt })!;
}
