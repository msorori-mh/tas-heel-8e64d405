import type JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { SchoolIntakeRow } from "./intake";

const list = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
type Xml = Record<string, any>;
const plain = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    Object.keys(value).every((k) => k === "#text" || k.startsWith("@_"))
  )
    return String((value as Xml)["#text"] ?? "");
  throw new Error("استخدم نصًا عاديًا في جميع الخلايا، دون صيغ أو روابط.");
};

/** Data-only fallback: ignore drawings/styles/comments, preserve cell types and IDs.
 * Uses the same XML parser in Node and browsers; never modifies the uploaded ZIP.
 */
export async function readCompatibleSchoolWorkbook(zip: JSZip): Promise<SchoolIntakeRow[]> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  async function xml(path: string): Promise<Xml> {
    const part = zip.file(path);
    if (!part) throw new Error("ملف Excel يفتقد أحد أجزاء بيانات المدارس.");
    const text = (await part.async("string")).replace(/^\uFEFF/, "");
    if (/<!DOCTYPE/i.test(text) || XMLValidator.validate(text) !== true)
      throw new Error("تعذّرت قراءة بنية XML في ملف Excel.");
    return parser.parse(text);
  }
  function target(value: string): string {
    const parts: string[] = value.startsWith("/") ? [] : ["xl"];
    for (const p of value.split("/")) {
      if (!p || p === ".") continue;
      if (p === "..") {
        if (!parts.length) throw new Error("مسار ملف Excel غير صالح.");
        parts.pop();
      } else parts.push(p);
    }
    return parts.join("/");
  }
  const workbook = (await xml("xl/workbook.xml")).workbook;
  const sheets = list<Xml>(workbook?.sheets?.sheet);
  const selected = sheets.find((s) => s["@_name"] === "المدارس") ?? sheets[0];
  if (!selected) throw new Error("الملف لا يحتوي على ورقة مدارس.");
  const relationships = list<Xml>(
    (await xml("xl/_rels/workbook.xml.rels")).Relationships?.Relationship,
  );
  const relation = relationships.find(
    (r) => r["@_Id"] === selected["@_id"] && r["@_Type"]?.endsWith("/worksheet"),
  );
  if (!relation || relation["@_TargetMode"] === "External")
    throw new Error("مرجع ورقة المدارس غير صالح.");
  const sheet = (await xml(target(relation["@_Target"]))).worksheet;
  if (!sheet) throw new Error("ورقة المدارس غير صالحة.");
  const stringsRelation = relationships.find((r) => r["@_Type"]?.endsWith("/sharedStrings"));
  const strings =
    stringsRelation && stringsRelation["@_TargetMode"] !== "External"
      ? list<Xml>((await xml(target(stringsRelation["@_Target"]))).sst?.si)
      : [];
  const links = list<Xml>(sheet.hyperlinks?.hyperlink);
  const address = (ref: string): [number, number] => {
    const m = /^([A-Z]+)([1-9][0-9]*)$/.exec(ref);
    if (!m) throw new Error("عنوان خلية غير صالح في ملف Excel.");
    return [Number(m[2]), [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)];
  };
  const ranges = links.map((link) => {
    const parts = String(link["@_ref"]).split(":");
    return [address(parts[0]), address(parts[1] ?? parts[0])];
  });
  const rows = new Map<number, string[]>();
  for (const row of list<Xml>(sheet.sheetData?.row)) {
    const number = Number(row["@_r"]);
    if (!Number.isInteger(number) || number < 1 || number > 5001 || rows.has(number))
      throw new Error("تحقق من صفوف ملف Excel واحذف الصفوف الفارغة الزائدة.");
    const values = ["", "", "", ""];
    const seen = new Set<number>();
    for (const cell of list<Xml>(row.c)) {
      const [r, c] = address(cell["@_r"]);
      if (r !== number || seen.has(c)) throw new Error("عنوان خلية مكرر أو غير صالح.");
      seen.add(c);
      const hasValue =
        (cell.v !== undefined && cell.v !== "") || cell.is !== undefined || cell.f !== undefined;
      if (c > 4) {
        if (number > 1 && hasValue)
          throw new Error(`الصف ${number}: توجد بيانات خارج أعمدة القالب الأربعة.`);
        continue;
      }
      if (
        cell.f !== undefined ||
        ranges.some(([[r1, c1], [r2, c2]]) => r >= r1 && r <= r2 && c >= c1 && c <= c2)
      )
        throw new Error(`الصف ${number}: استخدم نصًا عاديًا في جميع الخلايا، دون صيغ أو روابط.`);
      if (!hasValue) continue;
      let value: string;
      if (cell["@_t"] === "s") {
        const index = Number(cell.v);
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          !strings[index] ||
          strings[index].r !== undefined
        )
          throw new Error(`الصف ${number}: استخدم نصًا عاديًا في جميع الخلايا، دون صيغ أو روابط.`);
        value = plain(strings[index].t ?? "");
      } else if (cell["@_t"] === "str") value = plain(cell.v ?? "");
      else if (cell["@_t"] === "inlineStr" && cell.is?.r === undefined)
        value = plain(cell.is?.t ?? "");
      else throw new Error(`الصف ${number}: استخدم نصًا عاديًا في جميع الخلايا، دون صيغ أو روابط.`);
      values[c - 1] = value.trim();
    }
    rows.set(number, values);
  }
  const headers = ["المحافظة", "المديرية", "اسم المدرسة", "الحي أو القرية"];
  if (!headers.every((h, i) => rows.get(1)?.[i] === h))
    throw new Error("عناوين الأعمدة لا تطابق قالب المدارس.");
  const result: SchoolIntakeRow[] = [];
  for (const [source_row, [governorate, district, name, locality]] of [...rows].sort(
    ([a], [b]) => a - b,
  )) {
    if (source_row === 1 || ![governorate, district, name, locality].some(Boolean)) continue;
    result.push({ source_row, governorate, district, name, locality });
    if (result.length > 500) throw new Error("الحد الأقصى ٥٠٠ مدرسة في الملف الواحد.");
  }
  if (!result.length) throw new Error("أضف المدارس إلى القالب أولًا؛ الملف لا يحتوي على بيانات.");
  return result;
}
