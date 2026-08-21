const RASTER_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index < 0 ? "" : path.slice(index).toLowerCase();
}

function leaf(path: string): string {
  return path.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
}

function resolvePath(base: string, relative: string): string {
  const clean = relative.split(/[?#]/, 1)[0] ?? "";
  const stack = base.split("/").filter(Boolean);
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

async function replaceAsync(
  source: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += source.slice(cursor, index) + await replacer(match);
    cursor = index + match[0].length;
  }
  return output + source.slice(cursor);
}

export interface ConvertedHtml5Activity {
  htmlFile: File;
  assets: File[];
}

/**
 * Normalizes a common self-contained HTML5 ZIP into one reviewed HTML body plus raster assets.
 * CSS and JavaScript files are inlined; network URLs and unsupported binary files remain blocked
 * by the regular HTML/security validator.
 */
export async function convertHtml5ActivityZip(file: File): Promise<ConvertedHtml5Activity> {
  if (!/\.zip$/i.test(file.name)) throw new Error("ملف النشاط يجب أن يكون HTML أو ZIP.");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path]?.dir && !path.startsWith("__MACOSX/"));
  const indexPath = paths.find((path) => /(^|\/)index\.html?$/i.test(path));
  if (!indexPath) throw new Error("حزمة النشاط لا تحتوي index.html.");
  const base = indexPath.includes("/") ? indexPath.slice(0, indexPath.lastIndexOf("/")) : "";
  let html = await zip.files[indexPath]!.async("string");

  html = await replaceAsync(
    html,
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    async (match) => {
      const href = match[1] ?? "";
      if (/^(?:https?:|\/\/)/i.test(href)) return match[0];
      const entry = zip.files[resolvePath(base, href)];
      if (!entry) throw new Error(`ملف CSS مفقود داخل ZIP: ${href}`);
      return `<style>${await entry.async("string")}</style>`;
    },
  );
  html = await replaceAsync(
    html,
    /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    async (match) => {
      const src = match[1] ?? "";
      if (/^(?:https?:|\/\/)/i.test(src)) return match[0];
      const entry = zip.files[resolvePath(base, src)];
      if (!entry) throw new Error(`ملف JavaScript مفقود داخل ZIP: ${src}`);
      const script = await entry.async("string");
      if (/\b(?:import|export)\s/m.test(script)) {
        throw new Error("JavaScript Modules غير مدعومة في ZIP؛ اجمعها في ملف script عادي.");
      }
      return `<script>${script}</script>`;
    },
  );

  const assets: File[] = [];
  const usedLeaves = new Set<string>();
  for (const path of paths) {
    const mime = RASTER_MIME[extension(path)];
    if (!mime) continue;
    const assetLeaf = leaf(path);
    if (!assetLeaf || usedLeaves.has(assetLeaf)) {
      throw new Error(`أسماء صور مكررة أو غير صالحة داخل ZIP: ${assetLeaf || path}`);
    }
    usedLeaves.add(assetLeaf);
    const relativeCandidates = [path, path.slice(base.length + (base ? 1 : 0))].filter(Boolean);
    for (const candidate of relativeCandidates) html = html.split(candidate).join(assetLeaf);
    const bytes = await zip.files[path]!.async("uint8array");
    const assetBuffer = new ArrayBuffer(bytes.byteLength);\n    new Uint8Array(assetBuffer).set(bytes);\n    assets.push(new File([assetBuffer], assetLeaf, { type: mime }));
  }

  return {
    htmlFile: new File([html], "lab-activity.html", { type: "text/html" }),
    assets,
  };
}
