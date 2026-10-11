import test from "node:test";
import assert from "node:assert/strict";
import { validateConnection } from "../../scripts/independent/collect-inventory.mjs";
const ref = "yjpirilbpqxtmnayruht";
test("inventory pins a known project in direct or session pooler connections", () => {
  for (const url of [
    `postgresql://postgres:TEST_ONLY@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:TEST_ONLY@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
  ]) {
    assert.equal(validateConnection(url, ref), url);
  }
});
test("inventory rejects wrong projects, host lookalikes and connection overrides", () => {
  for (const url of [
    "postgres://postgres:TEST_ONLY@localhost/postgres",
    `postgres://postgres.${ref}:TEST_ONLY@pooler.supabase.com.evil.test/postgres`,
    `postgres://postgres:TEST_ONLY@db.${ref}.supabase.co/postgres?sslmode=disable`,
    "postgres://postgres:TEST_ONLY@db.zbdhxyuulyovihjgeqbn.supabase.co/postgres",
  ]) {
    assert.throws(() => validateConnection(url, ref));
  }
});
