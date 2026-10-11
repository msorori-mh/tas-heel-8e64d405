import React from "react";
import { createRoot } from "react-dom/client";
import { AcademyOfflineLibrary } from "../../../apps/teacher-academy/src/offline/AcademyOfflineLibrary";
import * as store from "../../../apps/teacher-academy/src/offline/store";
import "../../../apps/teacher-academy/src/styles.css";
(window as Window & { offlineStore: typeof store }).offlineStore = store;
if (!store.activeOwner()) store.setOwner("teacher-a");
createRoot(document.getElementById("root")!).render(
  <main className="workspace-content academy-offline-workspace">
    <AcademyOfflineLibrary owner="teacher-a" />
  </main>,
);
