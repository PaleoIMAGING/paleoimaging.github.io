import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tools = join(fileURLToPath(import.meta.url), "..", "..");
const fixtures = join(tools, "test", "fixtures");
const run = (...args) => spawnSync(process.execPath, [join(tools, "check-calendar.mjs"), ...args], { encoding: "utf8" });

test("a records directory with only YAML (no committed feed) yields a valid fresh calendar", () => {
  const dir = mkdtempSync(join(tmpdir(), "chk-"));
  try {
    const src = join(fixtures, "meetings");
    cpSync(src, dir, { recursive: true });
    assert.ok(readdirSync(dir).every((f) => /\.ya?ml$/.test(f)), "fixture is YAML only");
    const out = join(dir, "..", "chk-out-" + process.pid + ".ics");
    const r = run("--dir", dir, "--out", out);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /fresh calendar OK: \d+ record/);
    assert.ok(existsSync(out));
    rmSync(out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an invalid record blocks the check", () => {
  const dir = mkdtempSync(join(tmpdir(), "chk-"));
  try {
    cpSync(join(fixtures, "hostile", "hostile-record.yml"), join(dir, "hostile-record.yml"));
    const r = run("--dir", dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /invalid record/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an empty records directory is a valid (empty) calendar", () => {
  const dir = mkdtempSync(join(tmpdir(), "chk-"));
  try {
    assert.equal(run("--dir", dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
