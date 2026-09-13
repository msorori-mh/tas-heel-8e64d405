import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserNativePdfDelivery } from "@/components/lessons/BrowserNativePdfDelivery";
import { DataSaverSetting } from "@/components/offline/DataSaverSetting";
import { Button } from "@/components/ui/button";
import { getEntry, saveFile } from "@/lib/offline/pdf-cache";
import { sha256Hex } from "@/lib/offline/offline-pack-contract";
import { samplePdf } from "./sample-pdf";
import "../../../src/styles.css";
function Fixture() {
  const [show, setShow] = useState(true);
  return (
    <main dir="rtl" className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">إعدادات المحتوى وملف الدرس</h1>
      <DataSaverSetting />
      <Button variant="outline" onClick={() => setShow((old) => !old)}>
        {show ? "إغلاق القارئ" : "فتح النسخة المحفوظة"}
      </Button>
      {show && (
        <BrowserNativePdfDelivery resourceId="fixture-one" title="كتاب الرياضيات — نسخة محفوظة" />
      )}
    </main>
  );
}
async function start() {
  if (!(await getEntry("fixture-one"))) {
    const blob = new Blob([samplePdf], { type: "application/pdf" });
    await saveFile({
      resourceId: "fixture-one",
      version: "v1",
      blob,
      pinnedOffline: true,
      contentSha256: await sha256Hex(new Uint8Array(await blob.arrayBuffer())),
    });
  }
  createRoot(document.getElementById("root")!).render(<Fixture />);
}
void start();
