import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { prepareNativeShell } from "./lib/offline/native-shell-startup";

void prepareNativeShell()
  .catch(() => false)
  .then((reloading) => {
    if (reloading) return;
    startTransition(() => {
      hydrateRoot(
        document,
        <StrictMode>
          <StartClient />
        </StrictMode>,
      );
    });
  });
