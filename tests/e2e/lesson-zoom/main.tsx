import React from "react";
import { createRoot } from "react-dom/client";
import { InlineHtmlResourceViewer } from "../../../src/components/lessons/InlineHtmlResourceViewer";
import "../../../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 12 }}>
    <InlineHtmlResourceViewer
      title="اختبار تكبير الدرس"
      resourceType={location.search.includes("static") ? "official" : "experiment"}
      htmlResourceType={location.search.includes("static") ? "STATIC" : "INTERACTIVE"}
      html={
        '<html dir="rtl"><body><h1>محتوى الدرس</h1><button id="counter" onclick="this.textContent=Number(this.textContent)+1">0</button><div style="height:1000px">نص طويل</div></body></html>'
      }
    />
  </main>,
);
