import type JSZip from "jszip";

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

/** Read-only compatibility copy for ExcelJS. Never rewrites the uploaded file.
 * Some editors prefix SpreadsheetML elements and use comment/VML part names
 * ExcelJS cannot reconcile. Cell values, formulas and hyperlinks stay intact.
 */
export async function schoolWorkbookCompatibilityCopy(zip: JSZip): Promise<ArrayBuffer> {
  let changed = false;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.(xml|rels)$/.test(entry.name)) continue;
    // DOMParser in Chromium rejects a string BOM before the XML declaration.
    // ZIP readers return it as a character, unlike an XML byte-stream reader.
    const text = (await entry.async("string")).replace(/^\uFEFF/, "");
    if (/<!DOCTYPE/i.test(text)) throw new Error("Unsupported XML declaration");
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid workbook XML");
    let partChanged = false;
    // Comments and their shapes are irrelevant to the four imported columns.
    // Keep hyperlink relationships so the existing cell validator can reject them.
    for (const rel of Array.from(doc.getElementsByTagNameNS(REL_NS, "Relationship"))) {
      if (/\/(comments|vmlDrawing)$/.test(rel.getAttribute("Type") ?? "")) {
        rel.remove();
        partChanged = true;
      }
    }
    for (const node of Array.from(doc.getElementsByTagNameNS(SHEET_NS, "*"))) {
      if (!node.prefix) continue;
      const replacement = doc.createElementNS(SHEET_NS, node.localName);
      for (const attr of Array.from(node.attributes)) {
        if (attr.namespaceURI === XMLNS && attr.value === SHEET_NS) continue;
        replacement.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      }
      replacement.setAttributeNS(XMLNS, "xmlns", SHEET_NS);
      while (node.firstChild) replacement.appendChild(node.firstChild);
      node.parentNode!.replaceChild(replacement, node);
      partChanged = true;
    }
    if (partChanged) {
      zip.file(entry.name, new XMLSerializer().serializeToString(doc));
      changed = true;
    }
  }
  if (!changed) throw new Error("No supported workbook compatibility repair");
  return zip.generateAsync({ type: "arraybuffer" });
}
