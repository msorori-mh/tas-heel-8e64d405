import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lessonComponentPublishErrorMessage } from "../../src/lib/content-factory/lesson-component-publishing-v2-errors";

describe("lessonComponentPublishErrorMessage", () => {
  it("keeps an immutable published lab untouched and gives a safe recovery action", () => {
    const result = lessonComponentPublishErrorMessage(
      new Error(
        "LCPV2_PUBLISH_FAILED: LCPV2_LAB_PUBLISHED_RESOURCE_IMMUTABLE_CONFLICT: CHEM-LAB-02",
      ),
    );
    assert.match(result.message, /مورد تجربة منشور/);
    assert.match(result.action, /لم يُعدّل النظام المورد المنشور/);
  });

  it("translates the production metadata contract failure without exposing it as the headline", () => {
    const result = lessonComponentPublishErrorMessage(
      new Error("LCPV2_PUBLISH_FAILED: unsupported lesson_resources.metadata key: publisher"),
    );
    assert.equal(result.message, "رفض الخادم بيانات النشر الداخلية للمكوّن.");
    assert.match(result.action, /الملف محفوظ/);
    assert.match(result.technicalDetail, /publisher/);
  });

  it("gives a safe retry instruction for unknown failures", () => {
    const result = lessonComponentPublishErrorMessage(new Error("UNEXPECTED_FAILURE"));
    assert.equal(result.message, "تعذّر إكمال نشر هذا المكوّن.");
    assert.match(result.action, /أعد المحاولة مرة واحدة/);
    assert.equal(result.technicalDetail, "UNEXPECTED_FAILURE");
  });
});
