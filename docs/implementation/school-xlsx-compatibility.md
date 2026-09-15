# School XLSX reader compatibility

Baseline e1dbbc4b496326abb13f21aeae08e6eb2410e5be. Supplied file reproduced
ExcelJS 4.4.0 failure before row validation: qualified SpreadsheetML tags
(x:workbook etc.) are not recognized. After namespace correction, absolute
comment targets and a VML part named vmldrawing.vml fail reconciliation.

Keep the normal ExcelJS path. On load failure, use the already bounded ZIP to
make an in-memory compatibility copy. DOMParser resolves namespaces; replace
only qualified SpreadsheetML elements by equivalent default-namespace elements.
Preserve cell values, formulas, XML escaping, sheet relationship IDs and hyperlink
relationships. Remove comment/VML relationships from this read-only copy because
notes/shapes are not imported school data. Never overwrite the uploaded file.
Reject malformed XML and DTDs in this fallback; unknown load failures remain errors.
Existing byte/expanded-size/entry/row limits and field validation remain in force.

The original attachment parsed to 53 rows and every school field/source-row was
compared with an independent extraction from the original XML. No user file or
school list is committed. Synthetic tests reproduce namespaces and comment/VML
references, including escaped text and rejection of formulas/links/numeric cells.
Browser tests upload this format and complete preview/confirmation/result export
at 320/390/768/1280. No production school import or database migration is needed.

Recovery: revert the three reader changes to the previous normal load behavior;
there are no data changes to roll back.
