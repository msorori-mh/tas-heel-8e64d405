import { createRoot } from "react-dom/client";
import { App } from "../../../apps/teacher-academy/src/App";
import "../../../apps/teacher-academy/src/styles.css";
createRoot(document.getElementById("root")!).render(<App portal="teacher" />);
