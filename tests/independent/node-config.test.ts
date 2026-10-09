import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_SUPABASE_PROJECT_ID,
  PUBLIC_SUPABASE_URL,
} from "../../src/integrations/supabase/public-config";
import { getIndependentConnectivity } from "../../src/lib/network/independent-connectivity";
import { independentResponse } from "../../src/lib/network/independent-response";

test("plain Node imports keep staging disabled when Vite env is absent", () => {
  assert.equal(import.meta.env, undefined);
  assert.equal(PUBLIC_SUPABASE_PROJECT_ID, "zbdhxyuulyovihjgeqbn");
  assert.equal(PUBLIC_SUPABASE_URL, "https://zbdhxyuulyovihjgeqbn.supabase.co");
  assert.equal(getIndependentConnectivity(), undefined);
  const response = new Response("TEST_ONLY", { status: 401 });
  assert.equal(independentResponse(response), response);
  assert.equal(response.headers.has("X-Tamkeen-Environment"), false);
});
