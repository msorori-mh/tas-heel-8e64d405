# School XLSX reader compatibility

Baseline 3b27ae5532f90017843cb195b314625c0638664c. The uploaded editor workbook
uses qualified SpreadsheetML tags and absolute comment/VML references that
ExcelJS cannot reconcile. The previous metadata-normalization fallback did not
resolve the reported production failure. A BOM alone was not proven causal.

Keep normal ExcelJS loading. On load failure, read school cell data directly
from the already bounded ZIP with fast-xml-parser. Resolve the selected sheet
through workbook relationship IDs and support plain shared, inline and string
cells. Ignore styles, drawings and comments because these are not school data.
Preserve source rows and text; never modify the upload. Reject DTDs, malformed
XML, external sheet references, formulas, hyperlinks, rich text, non-text values,
duplicate addresses, excess populated columns and excessive rows. Existing ZIP
limits and downstream field/duplicate validation remain in force.

Verification includes the original attachment against an independent extraction
of every field in its 53 rows. No original school data is committed. The browser
fixture preserves the editor ZIP structure but substitutes synthetic field values;
a unit assertion checks every sanitized row to prevent fixture corruption.
Browser verification exercises import preview and confirmation controls at
320/390/768/1280 widths, including this 53-row fixture at 320px.
No production school import or database migration is performed by this change.

Recovery: revert the reader changes. No data rollback is needed.
