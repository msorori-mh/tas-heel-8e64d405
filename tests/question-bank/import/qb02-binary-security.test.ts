import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { runOperationalQuestionBankImportDryRun } from "../../../src/lib/question-bank/import/dry-run.ts";
import { scanOoxmlRelationships } from "../../../src/lib/question-bank/import/workbook-parser.ts";
import {
  buildMinimalValidXlsx,
  buildOoxmlExternalRelXlsx,
  buildZipWithPathTraversal,
  buildZipWithExcessiveEntries,
  buildZipWithDuplicateEntry,
  buildTruncatedZipBytes,
  buildMalformedCentralDirectoryZip,
  buildZipWithDeclaredSizeOverflow,
  buildEncryptedZip,
  buildZipWithCompressionRatioOverflow,
  buildZipWithTotalSizeOverflow,
  buildZipWithAbsolutePath,
  buildZipWithControlCharEntry,
  buildZipWithNormalizedDuplicates,
  buildInvalidLocalHeaderOffsetZip,
  buildInvalidLocalHeaderSignatureZip,
  buildInvalidLocalFilenameLengthZip,
  buildInvalidLocalExtraLengthZip,
  buildCompressedDataOutOfBoundsZip,
  buildLocalCentralNameMismatchZip,
  buildLocalCentralFlagMismatchZip,
  buildOverlappingEntriesZip,
  buildCdExactEndMismatchZip,
  buildEocdCountMismatchZip,
  buildEocdOffsetMismatchZip,
  buildOoxmlNestedRelsXlsx,
  buildOoxmlDtdXxeXlsx,
  buildOoxmlOversizedRelsXlsx,
  buildOoxmlMalformedXmlXlsx,
  buildOoxmlMultipleRelsWithExternalXlsx,
  buildMissingPartsXlsx,
  buildExtensionContentMismatchXlsx,
  buildCorruptedWorkbookZip,
  buildFormulaInjectionWorkbook,
  buildMissingColumnsWorkbook,
  buildInvalidSchemaWorkbook,
} from "../../fixtures/question-bank/import/binary-fixtures.ts";

const VALID_AUTH = {
  authenticated: true,
  actorId: "actor-123",
  authorized: true,
  capability: "question_bank.import",
  scope: "tenant:default",
  context: { actorId: "actor-123" },
};

const DEFAULT_CATALOG = {
  subjects: new Set(["MATH-G10", "PHYS-G10"]),
  lessons: new Set(["MATH-L1"]),
};

type BinaryTestCase = {
  name: string;
  builderName: string;
  builder: () => Promise<Uint8Array> | Uint8Array;
  expectedStage: string;
  expectedCode: string;
};

const ZIP_MATRIX: BinaryTestCase[] = [
  { name: "valid minimal XLSX", builderName: "buildMinimalValidXlsx", builder: buildMinimalValidXlsx, expectedStage: "DRY_RUN_COMPLETED", expectedCode: "OK" },
  { name: "official normalized XLSX", builderName: "buildMinimalValidXlsx", builder: buildMinimalValidXlsx, expectedStage: "DRY_RUN_COMPLETED", expectedCode: "OK" },
  { name: "duplicate raw name", builderName: "buildZipWithDuplicateEntry", builder: buildZipWithDuplicateEntry, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_DUPLICATE_ENTRY" },
  { name: "duplicate normalized name", builderName: "buildZipWithNormalizedDuplicates", builder: buildZipWithNormalizedDuplicates, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_DUPLICATE_ENTRY" },
  { name: "malformed central directory", builderName: "buildMalformedCentralDirectoryZip", builder: buildMalformedCentralDirectoryZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "missing EOCD", builderName: "buildTruncatedZipBytes", builder: buildTruncatedZipBytes, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MISSING_EOCD" },
  { name: "excessive entries", builderName: "buildZipWithExcessiveEntries", builder: buildZipWithExcessiveEntries, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_ENTRY_LIMIT" },
  { name: "single-entry size overflow", builderName: "buildZipWithDeclaredSizeOverflow", builder: buildZipWithDeclaredSizeOverflow, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_DECLARED_SIZE_LIMIT" },
  { name: "total size overflow", builderName: "buildZipWithTotalSizeOverflow", builder: buildZipWithTotalSizeOverflow, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_TOTAL_SIZE_LIMIT" },
  { name: "ratio overflow", builderName: "buildZipWithCompressionRatioOverflow", builder: buildZipWithCompressionRatioOverflow, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_BOMB_SUSPECTED" },
  { name: "encrypted entry", builderName: "buildEncryptedZip", builder: buildEncryptedZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "WORKBOOK_ENCRYPTED" },
  { name: "absolute path", builderName: "buildZipWithAbsolutePath", builder: buildZipWithAbsolutePath, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_ABSOLUTE_PATH" },
  { name: "path traversal ../", builderName: "buildZipWithPathTraversal", builder: () => buildZipWithPathTraversal("../secret.txt"), expectedStage: "PREFLIGHT_ZIP", expectedCode: "PATH_TRAVERSAL" },
  { name: "path traversal ..\\", builderName: "buildZipWithPathTraversal", builder: () => buildZipWithPathTraversal("..\\secret.txt"), expectedStage: "PREFLIGHT_ZIP", expectedCode: "PATH_TRAVERSAL" },
  { name: "mixed slash traversal", builderName: "buildZipWithPathTraversal", builder: () => buildZipWithPathTraversal("../dir\\file.txt"), expectedStage: "PREFLIGHT_ZIP", expectedCode: "PATH_TRAVERSAL" },
  { name: "encoded traversal", builderName: "buildZipWithPathTraversal", builder: () => buildZipWithPathTraversal("%2e%2e/file.txt"), expectedStage: "PREFLIGHT_ZIP", expectedCode: "PATH_TRAVERSAL" },
  { name: "double encoded traversal", builderName: "buildZipWithPathTraversal", builder: () => buildZipWithPathTraversal("%252e%252e/file.txt"), expectedStage: "PREFLIGHT_ZIP", expectedCode: "PATH_TRAVERSAL" },
  { name: "NUL/control name", builderName: "buildZipWithControlCharEntry", builder: buildZipWithControlCharEntry, expectedStage: "PREFLIGHT_ZIP", expectedCode: "MALFORMED_UNICODE" },
  { name: "invalid local-header offset", builderName: "buildInvalidLocalHeaderOffsetZip", builder: buildInvalidLocalHeaderOffsetZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "invalid local-header signature", builderName: "buildInvalidLocalHeaderSignatureZip", builder: buildInvalidLocalHeaderSignatureZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "invalid local filename length", builderName: "buildInvalidLocalFilenameLengthZip", builder: buildInvalidLocalFilenameLengthZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "invalid local extra length", builderName: "buildInvalidLocalExtraLengthZip", builder: buildInvalidLocalExtraLengthZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "compressed-data out-of-bounds", builderName: "buildCompressedDataOutOfBoundsZip", builder: buildCompressedDataOutOfBoundsZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "local/central name mismatch", builderName: "buildLocalCentralNameMismatchZip", builder: buildLocalCentralNameMismatchZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "local/central flag mismatch", builderName: "buildLocalCentralFlagMismatchZip", builder: buildLocalCentralFlagMismatchZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "overlapping entries", builderName: "buildOverlappingEntriesZip", builder: buildOverlappingEntriesZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "central-directory exact-end mismatch", builderName: "buildCdExactEndMismatchZip", builder: buildCdExactEndMismatchZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "EOCD declared count mismatch", builderName: "buildEocdCountMismatchZip", builder: buildEocdCountMismatchZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
  { name: "EOCD offset/size mismatch", builderName: "buildEocdOffsetMismatchZip", builder: buildEocdOffsetMismatchZip, expectedStage: "PREFLIGHT_ZIP", expectedCode: "ZIP_MALFORMED_CENTRAL_DIRECTORY" },
];

const OOXML_MATRIX: BinaryTestCase[] = [
  { name: "root .rels", builderName: "buildOoxmlNestedRelsXlsx", builder: () => buildOoxmlNestedRelsXlsx("_rels/.rels", "http://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "workbook .rels", builderName: "buildOoxmlNestedRelsXlsx", builder: () => buildOoxmlNestedRelsXlsx("xl/_rels/workbook.xml.rels", "http://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "worksheet .rels", builderName: "buildOoxmlNestedRelsXlsx", builder: () => buildOoxmlNestedRelsXlsx("xl/worksheets/_rels/sheet1.xml.rels", "http://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "drawing .rels", builderName: "buildOoxmlNestedRelsXlsx", builder: () => buildOoxmlNestedRelsXlsx("xl/drawings/_rels/drawing1.xml.rels", "http://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "comments .rels", builderName: "buildOoxmlNestedRelsXlsx", builder: () => buildOoxmlNestedRelsXlsx("xl/comments/_rels/comment1.xml.rels", "http://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "unknown nested .rels", builderName: "buildOoxmlNestedRelsXlsx", builder: () => buildOoxmlNestedRelsXlsx("xl/foo/_rels/bar.xml.rels", "http://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "TargetMode double quote", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("http://evil.com", "External", '"'), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "TargetMode single quote", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("http://evil.com", "External", "'"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "whitespace around External", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("http://evil.com", "  External  "), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "mixed case External", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("http://evil.com", "ExTeRnAl"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "HTTP scheme target", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("http://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "HTTPS scheme target", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("https://evil.com"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "file URI target", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("file:///C:/boot.ini"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "UNC path target", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("\\\\server\\share"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "drive-letter target", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("C:\\boot.ini"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "path traversal target ../", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("../xl/workbook.xml"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "path traversal target ..\\", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("..\\xl\\workbook.xml"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "encoded traversal target", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("%2e%2e/xl/workbook.xml"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "double-encoded traversal target", builderName: "buildOoxmlExternalRelXlsx", builder: () => buildOoxmlExternalRelXlsx("%252e%252e/xl/workbook.xml"), expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "malformed XML .rels", builderName: "buildOoxmlMalformedXmlXlsx", builder: buildOoxmlMalformedXmlXlsx, expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "oversized .rels entry", builderName: "buildOoxmlOversizedRelsXlsx", builder: buildOoxmlOversizedRelsXlsx, expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "DTD in .rels", builderName: "buildOoxmlDtdXxeXlsx", builder: buildOoxmlDtdXxeXlsx, expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "ENTITY in .rels", builderName: "buildOoxmlDtdXxeXlsx", builder: buildOoxmlDtdXxeXlsx, expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
  { name: "multiple relationships with External after benign", builderName: "buildOoxmlMultipleRelsWithExternalXlsx", builder: buildOoxmlMultipleRelsWithExternalXlsx, expectedStage: "PREFLIGHT_OOXML", expectedCode: "EXTERNAL_LINK" },
];

const WORKBOOK_MATRIX: BinaryTestCase[] = [
  { name: "official normalized workbook", builderName: "buildMinimalValidXlsx", builder: buildMinimalValidXlsx, expectedStage: "DRY_RUN_COMPLETED", expectedCode: "OK" },
  { name: "missing required OOXML parts", builderName: "buildMissingPartsXlsx", builder: buildMissingPartsXlsx, expectedStage: "WORKBOOK_PARSE", expectedCode: "INVALID_CONTRACT" },
  { name: "extension/content mismatch", builderName: "buildExtensionContentMismatchXlsx", builder: buildExtensionContentMismatchXlsx, expectedStage: "PREFLIGHT_RAW", expectedCode: "FILE_TYPE_UNSUPPORTED" },
  { name: "corrupted workbook", builderName: "buildCorruptedWorkbookZip", builder: buildCorruptedWorkbookZip, expectedStage: "WORKBOOK_PARSE", expectedCode: "WORKBOOK_ENCRYPTED" },
  { name: "XLSX formula injection", builderName: "buildFormulaInjectionWorkbook", builder: buildFormulaInjectionWorkbook, expectedStage: "PREFLIGHT_OOXML", expectedCode: "FORMULA_INJECTION" },
  { name: "missing required columns", builderName: "buildMissingColumnsWorkbook", builder: buildMissingColumnsWorkbook, expectedStage: "ADAPTER_DETECT", expectedCode: "INVALID_CONTRACT" },
  { name: "invalid schema", builderName: "buildInvalidSchemaWorkbook", builder: buildInvalidSchemaWorkbook, expectedStage: "ADAPTER_DETECT", expectedCode: "INVALID_CONTRACT" },
];

const ALL_BINARY_CASES = [
  ...ZIP_MATRIX.map((c) => ({ ...c, category: "ZIP" })),
  ...OOXML_MATRIX.map((c) => ({ ...c, category: "OOXML" })),
  ...WORKBOOK_MATRIX.map((c) => ({ ...c, category: "Workbook" })),
];

for (const tc of ALL_BINARY_CASES) {
  test(`Binary Security Test [${tc.category}]: ${tc.name}`, async () => {
    const bytes = await tc.builder();

    const result = await runOperationalQuestionBankImportDryRun({
      fileName: "test.xlsx",
      bytes,
      catalog: DEFAULT_CATALOG,
      authorized: VALID_AUTH,
    });

    const isSuccess = tc.expectedCode === "OK";
    if (isSuccess) {
      assert.equal(result.summary.file_blocking, false, `${tc.name} should succeed without file blocking`);
    } else {
      assert.equal(result.summary.file_blocking, true, `${tc.name} must result in file_blocking`);
      const hasCode = result.issues.some((i) => i.code === tc.expectedCode);
      assert.ok(
        hasCode,
        `${tc.name}: expected code ${tc.expectedCode}; got ${result.issues.map((i) => i.code).join(",")}`,
      );
    }
  });
}

test("Binary Matrix counts verification", () => {
  assert.equal(ZIP_MATRIX.length, 29, "ZIP matrix count must be 29");
  assert.equal(OOXML_MATRIX.length, 24, "OOXML matrix count must be 24");
  assert.equal(WORKBOOK_MATRIX.length, 7, "Workbook matrix count must be 7");
  assert.equal(ALL_BINARY_CASES.length, 60, "Total binary test cases must be 60");
  console.log(`Binary Matrix Summary: ZIP=${ZIP_MATRIX.length}, OOXML=${OOXML_MATRIX.length}, Workbook=${WORKBOOK_MATRIX.length}, TotalCases=${ALL_BINARY_CASES.length}`);
});

// Section 7 — OOXML Unknown Structure Fail-Closed Tests
test("OOXML Fail-Closed 1: valid empty Relationships container", async () => {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.hasExternalLinks, false);
  assert.equal(scan.invalidStructure, false);
});

test("OOXML Fail-Closed 2: unknown root element", async () => {
  const zip = new JSZip();
  zip.file("_rels/.rels", `<?xml version="1.0"?><UnknownRoot><Child/></UnknownRoot>`);
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.invalidStructure, true);
  assert.ok(scan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID"));
});

test("OOXML Fail-Closed 3: malformed nested structure", async () => {
  const zip = new JSZip();
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships>invalid scalar text</Relationships>`);
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.invalidStructure, true);
  assert.ok(scan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID"));
});

test("OOXML Fail-Closed 4: Relationship outside container", async () => {
  const zip = new JSZip();
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationship Target="foo" Id="r1"/>`);
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.invalidStructure, true);
  assert.ok(scan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID"));
});

test("OOXML Fail-Closed 5: mixed valid/unknown nodes", async () => {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships><Relationship Id="r1" Target="a"/><UnknownNode/></Relationships>`,
  );
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.invalidStructure, true);
  assert.ok(scan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID"));
});

test("OOXML Fail-Closed 6: missing Target", async () => {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships><Relationship Id="r1"/></Relationships>`,
  );
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.invalidStructure, true);
  assert.ok(scan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID"));
});

test("OOXML Fail-Closed 7: missing Id when required", async () => {
  const zip = new JSZip();
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships><Relationship Target="a"/></Relationships>`,
  );
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.invalidStructure, true);
  assert.ok(scan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID"));
});

test("OOXML Fail-Closed 8: unexpected scalar/object shapes", async () => {
  const zip = new JSZip();
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships foo="bar">123</Relationships>`);
  const scan = await scanOoxmlRelationships(zip);
  assert.equal(scan.invalidStructure, true);
  assert.ok(scan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID"));
});
