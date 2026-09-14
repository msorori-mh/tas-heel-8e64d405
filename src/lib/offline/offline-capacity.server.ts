/** Bound expensive work per server instance. This is not a distributed rate limit. */
export function createOfflineCapacityLimit(maximum: number) {
  let active = 0;
  return async (work: () => Promise<Response>): Promise<Response> => {
    if (active >= maximum) {
      return new Response(JSON.stringify({ error: "offline_capacity_busy" }), {
        status: 503,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "retry-after": "3",
        },
      });
    }
    active += 1;
    try {
      return await work();
    } finally {
      active -= 1;
    }
  };
}

export const withOfflineManifestCapacity = createOfflineCapacityLimit(2);
export const withOfflineArtifactCapacity = createOfflineCapacityLimit(8);
