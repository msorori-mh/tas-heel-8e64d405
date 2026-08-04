import JSZip from "jszip";
import { CONTRACT_HEADERS } from "../../../../src/lib/question-bank/import/adapters/detect.ts";
import { OFFICIAL_FLAT_V0 } from "../../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";

/** Programmatic binary fixture builder for deterministic XLSX and ZIP security tests. */

export async function buildMinimalValidXlsx(
  headers: string[] = [...CONTRACT_HEADERS[OFFICIAL_FLAT_V0]],
  dataRows: string[][] = [["Q1", "Compute 1+1", "SINGLE_CHOICE", "AUTO_SINGLE", "1", "2", "", "", "", "", "1", "", "", "", "1", "FALSE", "MATH-G10", "", "", "", ""]],
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );

  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
  );

  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  );

  const allRows = [headers, ...dataRows];
  const sheetXmlData = allRows
    .map((r, rIdx) => {
      const cols = r
        .map(
          (c, cIdx) =>
            `<c r="${String.fromCharCode(65 + cIdx)}${rIdx + 1}" t="inlineStr"><is><t>${c}</t></is></c>`,
        )
        .join("");
      return `<row r="${rIdx + 1}">${cols}</row>`;
    })
    .join("");

  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetXmlData}</sheetData>
</worksheet>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

export async function buildOoxmlExternalRelXlsx(targetUri: string, targetMode = "External", quoteChar = '"'): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target=${quoteChar}${targetUri}${quoteChar} TargetMode=${quoteChar}${targetMode}${quoteChar}/>
</Relationships>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

export async function buildZipWithPathTraversal(entryName: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(entryName, "traversal payload");
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildZipWithExcessiveEntries(count = 201): Promise<Uint8Array> {
  const zip = new JSZip();
  for (let i = 0; i < count; i++) {
    zip.file(`entry_${i}.txt`, `content ${i}`);
  }
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildZipWithDuplicateEntry(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("file1.txt", "hello world");
  const bytes = await zip.generateAsync({ type: "uint8array" });

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return bytes;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);

  const cdEntryBytes = bytes.subarray(cdOffset, cdOffset + cdSize);

  const result = new Uint8Array(bytes.length + cdSize);
  result.set(bytes.subarray(0, eocd), 0);
  result.set(cdEntryBytes, eocd);
  result.set(bytes.subarray(eocd), eocd + cdSize);

  const newEocd = eocd + cdSize;
  const resultView = new DataView(result.buffer, result.byteOffset, result.byteLength);
  resultView.setUint16(newEocd + 8, 2, true);
  resultView.setUint16(newEocd + 10, 2, true);
  resultView.setUint32(newEocd + 12, cdSize * 2, true);

  return result;
}

export async function buildTruncatedZipBytes(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  return baseBytes.subarray(0, baseBytes.length - 30);
}

export async function buildMalformedCentralDirectoryZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      copy[i + 16] = 0xff;
      copy[i + 17] = 0xff;
      copy[i + 18] = 0xff;
      copy[i + 19] = 0x7f;
      break;
    }
  }
  return copy;
}

export async function buildZipWithDeclaredSizeOverflow(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  view.setUint32(cdOffset + 24, 15_000_000, true);
  return copy;
}

export async function buildEncryptedZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  view.setUint16(cdOffset + 8, 1, true);
  return copy;
}

export async function buildZipWithCompressionRatioOverflow(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  view.setUint32(cdOffset + 20, 100, true); // compSize = 100
  view.setUint32(cdOffset + 24, 2_500_000, true); // uncompSize = 2.5MB (ratio 25000:1)
  return copy;
}

export async function buildZipWithAbsolutePath(pathString = "/etc/passwd"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(pathString, "absolute path content");
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildZipWithControlCharEntry(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("file\0null.txt", "control char content");
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildZipWithNormalizedDuplicates(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("folder/file.txt", "content A");
  zip.file("folder//file.txt", "content B");
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildInvalidLocalHeaderOffsetZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  view.setUint32(cdOffset + 42, copy.length + 1000, true); // invalid localHeaderOffset
  return copy;
}

export async function buildInvalidLocalHeaderSignatureZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);
  copy[0] = 0x50;
  copy[1] = 0x4b;
  copy[2] = 0x99; // Corrupt local signature at start
  copy[3] = 0x99;
  return copy;
}

export async function buildInvalidLocalFilenameLengthZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  view.setUint16(26, 60000, true); // invalid local name length
  return copy;
}

export async function buildInvalidLocalExtraLengthZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  view.setUint16(28, 60000, true); // invalid local extra length
  return copy;
}

export async function buildCompressedDataOutOfBoundsZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  view.setUint32(cdOffset + 20, copy.length + 5000, true); // compSize out of bounds
  return copy;
}

export async function buildLocalCentralNameMismatchZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  const nameLen = view.getUint16(cdOffset + 28, true);
  // Mutate central name byte
  copy[cdOffset + 46] = copy[cdOffset + 46] === 0x58 ? 0x59 : 0x58;
  return copy;
}

export async function buildLocalCentralFlagMismatchZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  view.setUint16(cdOffset + 8, 1, true); // central flag encrypted
  view.setUint16(6, 0, true); // local flag unencrypted
  return copy;
}

export async function buildOverlappingEntriesZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("file1.txt", "AAA");
  zip.file("file2.txt", "BBB");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  const cdOffset = view.getUint32(eocd + 16, true);
  // Make entry 2 local offset point to entry 1
  view.setUint32(cdOffset + 46 + 9 + 42, 0, true);
  return copy;
}

export async function buildCdExactEndMismatchZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length + 10);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 32; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return baseBytes;

  // Move EOCD down by 10 bytes without changing cdOffset/cdSize
  const eocdBytes = copy.subarray(eocd, eocd + 22);
  copy.set(eocdBytes, eocd + 10);
  return copy;
}

export async function buildEocdCountMismatchZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  view.setUint16(eocd + 10, 99, true); // declared 99 entries
  return copy;
}

export async function buildEocdOffsetMismatchZip(): Promise<Uint8Array> {
  const baseBytes = await buildMinimalValidXlsx();
  const copy = new Uint8Array(baseBytes.length);
  copy.set(baseBytes);

  let eocd = -1;
  for (let i = copy.length - 22; i >= 0; i--) {
    if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x05 && copy[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return copy;

  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  view.setUint32(eocd + 16, eocd + 100, true); // cdOffset beyond EOCD
  return copy;
}

export async function buildOoxmlNestedRelsXlsx(
  relPath: string,
  targetUri: string,
  targetMode = "External",
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
  );

  zip.file(
    relPath,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheet" Target="${targetUri}" TargetMode="${targetMode}"/>
</Relationships>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

export async function buildOoxmlDtdXxeXlsx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="&xxe;"/>
</Relationships>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildOoxmlOversizedRelsXlsx(): Promise<Uint8Array> {
  const zip = new JSZip();
  const dummyComment = "<!-- " + "A".repeat(600_000) + " -->";
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
${dummyComment}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildOoxmlMalformedXmlXlsx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships><Relationship Id="r1"`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildOoxmlMultipleRelsWithExternalXlsx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="http://attacker.com" TargetMode="External"/>
</Relationships>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildMissingPartsXlsx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("dummy.txt", "missing required ooxml files");
  return zip.generateAsync({ type: "uint8array" });
}

export function buildExtensionContentMismatchXlsx(): Uint8Array {
  return new TextEncoder().encode("NOT A ZIP FILE - Plain Text Content");
}

export async function buildCorruptedWorkbookZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", "corrupted text content");
  return zip.generateAsync({ type: "uint8array" });
}

export async function buildFormulaInjectionWorkbook(): Promise<Uint8Array> {
  return buildMinimalValidXlsx(
    [...CONTRACT_HEADERS[OFFICIAL_FLAT_V0]],
    [["Q1", "=SUM(1,2)", "SINGLE_CHOICE", "AUTO_SINGLE", "1", "2", "", "", "", "", "1", "", "", "", "1", "FALSE", "MATH-G10", "", "", "", ""]],
  );
}

export async function buildMissingColumnsWorkbook(): Promise<Uint8Array> {
  return buildMinimalValidXlsx(["question_code"], [["Q1"]]);
}

export async function buildInvalidSchemaWorkbook(): Promise<Uint8Array> {
  return buildMinimalValidXlsx(["col_a", "col_b"], [["1", "2"]]);
}
