import assert from "node:assert/strict";
import test from "node:test";
import { commandRequiresApproval } from "./security.js";

test("high risk commands require approval", () => {
  assert.equal(commandRequiresApproval("chat", "high"), true);
});

test("shell and file actions require approval regardless of risk label", () => {
  assert.equal(commandRequiresApproval("shell", "low"), true);
  assert.equal(commandRequiresApproval("file_action", "low"), true);
});

test("low risk chat does not require approval", () => {
  assert.equal(commandRequiresApproval("chat", "low"), false);
});
