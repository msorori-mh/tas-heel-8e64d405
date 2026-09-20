// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { initializeConnectivity } from "@/hooks/use-connectivity";

test("airplane-mode startup pauses server queries while local reads still run, then resumes", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  initializeConnectivity();
  expect(onlineManager.isOnline()).toBe(false);
  const client = new QueryClient();
  client.mount();
  const remote = vi.fn(async () => "server");
  const pending = client.fetchQuery({ queryKey: ["remote"], queryFn: remote });
  expect(remote).not.toHaveBeenCalled();
  expect(client.getQueryState(["remote"])?.fetchStatus).toBe("paused");
  expect(
    await client.fetchQuery({
      queryKey: ["local"],
      networkMode: "always",
      queryFn: async () => "saved",
    }),
  ).toBe("saved");
  window.dispatchEvent(new Event("online"));
  expect(await pending).toBe("server");
  expect(remote).toHaveBeenCalledTimes(1);
  client.unmount();
  client.clear();
  vi.restoreAllMocks();
});
