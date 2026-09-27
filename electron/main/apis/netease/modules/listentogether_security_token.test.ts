import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseSecurityToken } from "./listentogether_token_parser";

test("解析易盾房间校验 token", () => {
  assert.equal(parseSecurityToken('null([200,1790478355139,"abcDEF123"])'), "abcDEF123");
  assert.equal(parseSecurityToken('cb( [200, 1790478355139, "abc-DEF_123"] )'), "abc-DEF_123");
  assert.throws(() => parseSecurityToken('null([403,1790478355139,""])'));
});
