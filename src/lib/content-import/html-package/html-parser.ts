import * as htmlparser2 from "htmlparser2";
import { computeSha256Base64 } from "./content-hash.ts";
import type { HtmlScanResult, HtmlScriptInfo, SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";
import { isUrlSafe, decodeHtmlEntities, stripControlCharacters } from "./url-normalizer.ts";
import { scanJavaScriptContent } from "./js-scanner.ts";
import { scanCssContent } from "./css-scanner.ts";

const FORBIDDEN_TAGS = new Set([
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "portal",
  "form",
  "base",
]);

const SVG_ACTIVE_TAGS = new Set([
  "script",
  "foreignobject",
  "set",
  "animate",
  "animatetransform",
  "animatemotion",
]);

const MATHML_ACTIVE_TAGS = new Set([
  "maction",
  "annotation-xml",
]);

/**
 * Structural HTML Parser using htmlparser2.
 * Replaces regex-only security checks with structural DOM/tokenizer AST analysis.
 */
export async function parseHtmlContent(
  htmlContent: string,
  filePath = "index.html"
): Promise<HtmlScanResult> {
  const findings: SecurityFinding[] = [];
  const inlineScripts: HtmlScriptInfo[] = [];
  const scriptHashes: string[] = [];
  const referencedAssets = new Set<string>();
  let title: string | undefined;

  let currentTag: string | null = null;
  let inTitle = false;
  let inScript = false;
  let inStyle = false;
  let scriptBuffer = "";
  let styleBuffer = "";
  let inSvg = false;
  let inMath = false;

  const parser = new htmlparser2.Parser(
    {
      onopentag(name: string, attribs: Record<string, string>) {
        const tagName = name.toLowerCase();
        currentTag = tagName;

        if (tagName === "svg") inSvg = true;
        if (tagName === "math") inMath = true;

        if (tagName === "title") {
          inTitle = true;
        } else if (tagName === "script") {
          inScript = true;
          scriptBuffer = "";
        } else if (tagName === "style") {
          inStyle = true;
          styleBuffer = "";
        }

        // 1. Check forbidden structural tags
        if (FORBIDDEN_TAGS.has(tagName)) {
          let code: (typeof ValidationCodes)[keyof typeof ValidationCodes] = ValidationCodes.FORBIDDEN_IFRAME_ELEMENT;
          let msg = `تم رفض عنصر <${tagName}> المحظور أمنياً.`;

          if (tagName === "iframe" || tagName === "frame" || tagName === "frameset") {
            code = ValidationCodes.FORBIDDEN_IFRAME_ELEMENT;
            msg = "ممنوع تضمين عنصر <iframe> أو إطارات داخل ملفات HTML المستوردة.";
          } else if (tagName === "form") {
            code = ValidationCodes.FORBIDDEN_FORM_SUBMISSION;
            msg = "ممنوع تضمين نماذج <form> داخل ملفات HTML المستوردة.";
          } else if (tagName === "base") {
            code = ValidationCodes.FORBIDDEN_BASE_ELEMENT;
            msg = "ممنوع تضمين عنصر <base> لتعديل المسار الأساسي.";
          } else if (tagName === "object" || tagName === "embed" || tagName === "applet") {
            code = ValidationCodes.FORBIDDEN_OBJECT_EMBED_ELEMENT;
            msg = `ممنوع تضمين العناصر التنفيذية الخارجية <${tagName}>.`;
          }

          findings.push({
            code,
            severity: "error",
            file: filePath,
            snippet: `<${name}>`,
            message: msg,
          });
        }

        // Check meta refresh
        if (tagName === "meta") {
          const httpEquiv = (attribs["http-equiv"] || attribs["HTTP-EQUIV"] || "").toLowerCase();
          if (httpEquiv === "refresh") {
            findings.push({
              code: ValidationCodes.FORBIDDEN_META_REFRESH,
              severity: "error",
              file: filePath,
              snippet: `<meta http-equiv="refresh">`,
              message: "ممنوع استخدام <meta http-equiv=\"refresh\"> لإعادة التوجيه التلقائي.",
            });
          }
        }

        // Check input / button form behaviors
        if (tagName === "input") {
          findings.push({
            code: ValidationCodes.FORBIDDEN_FORM_SUBMISSION,
            severity: "error",
            file: filePath,
            snippet: `<input>`,
            message: "ممنوع استخدام عناصر الإدخال التفاعلية <input> في المحتوى التفاعلي المستورد.",
          });
        } else if (tagName === "button") {
          const typeAttr = (attribs["type"] || "").toLowerCase();
          if (typeAttr === "submit" || typeAttr === "reset" || attribs["formaction"]) {
            findings.push({
              code: ValidationCodes.FORBIDDEN_FORM_SUBMISSION,
              severity: "error",
              file: filePath,
              snippet: `<button type="${typeAttr}">`,
              message: "ممنوع استخدام أزرار إرسال النماذج Submit/Reset.",
            });
          }
        }

        // SVG active content checks
        if (inSvg && SVG_ACTIVE_TAGS.has(tagName)) {
          findings.push({
            code: ValidationCodes.FORBIDDEN_SVG_ACTIVE_CONTENT,
            severity: "error",
            file: filePath,
            snippet: `<svg><${tagName}>`,
            message: `ممنوع تضمين عنصر حركي نشط <${tagName}> داخل SVG.`,
          });
        }

        // MathML active content checks
        if (inMath && MATHML_ACTIVE_TAGS.has(tagName)) {
          findings.push({
            code: ValidationCodes.FORBIDDEN_MATHML_ACTIVE_CONTENT,
            severity: "error",
            file: filePath,
            snippet: `<math><${tagName}>`,
            message: `ممنوع تضمين عناصر رابطة أو تفاعلية <${tagName}> داخل MathML.`,
          });
        }

        // 2. Check all attributes
        for (const [rawAttrName, rawAttrVal] of Object.entries(attribs)) {
          const cleanAttrName = stripControlCharacters(decodeHtmlEntities(rawAttrName)).toLowerCase();

          // Reject any event handler attribute starting with "on"
          if (cleanAttrName.startsWith("on")) {
            findings.push({
              code: ValidationCodes.INLINE_EVENT_HANDLER_DETECTED,
              severity: "error",
              file: filePath,
              snippet: `${rawAttrName}="${rawAttrVal.slice(0, 40)}"`,
              message: `تم رفض سمة الحدث الضمني المضمن (Inline event handler): ${rawAttrName}`,
            });
          }

          // Reject srcdoc
          if (cleanAttrName === "srcdoc") {
            findings.push({
              code: ValidationCodes.FORBIDDEN_SRCDOC_ATTRIBUTE,
              severity: "error",
              file: filePath,
              snippet: `srcdoc="${rawAttrVal.slice(0, 40)}"`,
              message: "ممنوع استخدام سمة srcdoc الضمنية.",
            });
          }

          // Reject formaction / action
          if (cleanAttrName === "formaction" || cleanAttrName === "action") {
            findings.push({
              code: ValidationCodes.FORBIDDEN_FORM_SUBMISSION,
              severity: "error",
              file: filePath,
              snippet: `${cleanAttrName}="${rawAttrVal.slice(0, 40)}"`,
              message: `ممنوع استخدام السمة ${cleanAttrName} لإرسال البيانات.`,
            });
          }

          // Validate URL attributes: href, src, srcset, poster, data, codebase
          if (["href", "src", "srcset", "poster", "data", "codebase"].includes(cleanAttrName)) {
            // Special check for script src
            if (tagName === "script" && cleanAttrName === "src") {
              const urlCheck = isUrlSafe(rawAttrVal);
              if (!urlCheck.safe) {
                findings.push({
                  code: ValidationCodes.JAVASCRIPT_URL_DETECTED,
                  severity: "error",
                  file: filePath,
                  snippet: `src="${rawAttrVal}"`,
                  message: `تم رفض مصدر السكربت المحظور (${urlCheck.reason}): ${rawAttrVal}`,
                });
              } else {
                referencedAssets.add(urlCheck.normalized);
                inlineScripts.push({ type: "external", src: urlCheck.normalized });
              }
            } else {
              // General asset / href check
              if (cleanAttrName === "srcset") {
                const candidates = rawAttrVal.split(",");
                for (const cand of candidates) {
                  const parts = cand.trim().split(/\s+/);
                  if (parts[0]) {
                    const urlCheck = isUrlSafe(parts[0], { allowDataImage: true });
                    if (!urlCheck.safe) {
                      findings.push({
                        code: ValidationCodes.REMOTE_NETWORK_URL_DETECTED,
                        severity: "error",
                        file: filePath,
                        snippet: `srcset="${cand.trim()}"`,
                        message: `تم رفض رابط محظور في srcset: ${parts[0]}`,
                      });
                    } else if (urlCheck.normalized && !urlCheck.normalized.startsWith("data:")) {
                      referencedAssets.add(urlCheck.normalized);
                    }
                  }
                }
              } else {
                const urlCheck = isUrlSafe(rawAttrVal, { allowDataImage: true });
                if (!urlCheck.safe) {
                  const isJsUrl = rawAttrVal.toLowerCase().includes("javascript:");
                  findings.push({
                    code: isJsUrl ? ValidationCodes.JAVASCRIPT_URL_DETECTED : ValidationCodes.REMOTE_NETWORK_URL_DETECTED,
                    severity: "error",
                    file: filePath,
                    snippet: `${rawAttrName}="${rawAttrVal}"`,
                    message: `تم رفض رابط محظور (${urlCheck.reason}): ${rawAttrVal}`,
                  });
                } else if (urlCheck.normalized && !urlCheck.normalized.startsWith("data:")) {
                  referencedAssets.add(urlCheck.normalized);
                }
              }
            }
          }

          // Check style attribute
          if (cleanAttrName === "style") {
            const cssFindings = scanCssContent(rawAttrVal, filePath);
            findings.push(...cssFindings);
          }
        }
      },

      ontext(text: string) {
        if (inTitle && !title) {
          title = text.trim();
        } else if (inScript) {
          scriptBuffer += text;
        } else if (inStyle) {
          styleBuffer += text;
        }
      },

      onclosetag(name: string) {
        const tagName = name.toLowerCase();
        if (tagName === "title") inTitle = false;
        if (tagName === "svg") inSvg = false;
        if (tagName === "math") inMath = false;

        if (tagName === "script") {
          inScript = false;
          // Process inline script text
          const body = scriptBuffer;
          if (body.trim()) {
            // Scan inline JS for forbidden APIs
            const jsFindings = scanJavaScriptContent(body, filePath);
            findings.push(...jsFindings);
          }
        }

        if (tagName === "style") {
          inStyle = false;
          const cssFindings = scanCssContent(styleBuffer, filePath);
          findings.push(...cssFindings);
        }

        currentTag = null;
      },
    },
    { decodeEntities: true, lowerCaseAttributeNames: false, lowerCaseTags: true }
  );

  parser.write(htmlContent);
  parser.end();

  // Async calculations for script SHA-256 Base64 hashes
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    const attributes = match[1];
    const scriptBody = match[2];
    const srcMatch = attributes.match(/\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);

    if (!srcMatch && scriptBody) {
      const sha256Base64 = await computeSha256Base64(scriptBody);
      inlineScripts.push({
        type: "inline",
        content: scriptBody,
        sha256: sha256Base64,
      });
      scriptHashes.push(sha256Base64);
    }
  }

  return {
    title,
    inlineScripts,
    scriptHashes,
    referencedAssets: Array.from(referencedAssets),
    findings,
  };
}
