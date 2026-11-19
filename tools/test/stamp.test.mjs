import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataIsDirty, resolveStamp } from "../stamp.mjs";
import { siteRoot } from "../lib.mjs";

const sh = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "stamp-"));
  sh(dir, "init", "-q", "-b", "main");
  sh(dir, "config", "user.email", "t@example.org"); sh(dir, "config", "user.name", "T");
  mkdirSync(join(dir, "_data", "meetings"), { recursive: true });
  const commit = (file, body, when) => {
    writeFileSync(join(dir, file), body);
    sh(dir, "add", "-A");
    execFileSync("git", ["commit", "-q", "-m", file], { cwd: dir, env: { ...process.env, GIT_COMMITTER_DATE: when, GIT_AUTHOR_DATE: when, GIT_CONFIG_GLOBAL: "/dev/null" } });
  };
  return { dir, commit };
}

test("explicit --stamp and SOURCE_DATE_EPOCH win, in that order", () => {
  assert.deepEqual(resolveStamp({ root: "/nonexistent", args: ["--stamp", "100"], env: { SOURCE_DATE_EPOCH: "200" } }), { ms: 100000, source: "--stamp" });
  assert.deepEqual(resolveStamp({ root: "/nonexistent", env: { SOURCE_DATE_EPOCH: "200" } }), { ms: 200000, source: "SOURCE_DATE_EPOCH" });
});

test("malformed or zero epochs are rejected (0 would silently mean wall clock)", () => {
  for (const bad of ["0", "-5", "abc", "1.5", ""]) {
    if (bad === "") continue;
    assert.throws(() => resolveStamp({ root: ".", args: ["--stamp", bad], env: {} }), /epoch seconds/);
  }
  assert.throws(() => resolveStamp({ root: ".", env: { SOURCE_DATE_EPOCH: "0" } }), /epoch seconds/);
});

test("stamp is the latest commit touching meeting data, not later unrelated commits", () => {
  const { dir, commit } = makeRepo();
  try {
    commit("_data/meetings/a.yml", "id: a\n", "2026-01-01T00:00:00Z");
    commit("_data/meetings/b.yml", "id: b\n", "2026-02-01T00:00:00Z");
    commit("README.md", "unrelated\n", "2026-03-01T00:00:00Z");
    const r = resolveStamp({ root: dir, env: {} });
    assert.equal(r.source, "git");
    assert.equal(r.ms, Date.parse("2026-02-01T00:00:00Z"));
    assert.deepEqual(resolveStamp({ root: dir, env: {} }), r, "repeatable");
    assert.equal(dataIsDirty(dir), false);
    writeFileSync(join(dir, "_data", "meetings", "c.yml"), "id: c\n");
    assert.equal(dataIsDirty(dir), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a shallow clone is an explicit error, never a wall-clock fallback", () => {
  const { dir, commit } = makeRepo();
  const clone = mkdtempSync(join(tmpdir(), "stamp-shallow-"));
  try {
    commit("_data/meetings/a.yml", "id: a\n", "2026-01-01T00:00:00Z");
    commit("_data/meetings/b.yml", "id: b\n", "2026-02-01T00:00:00Z");
    sh(clone, "clone", "-q", "--depth", "1", "file://" + dir, "c");
    assert.throws(() => resolveStamp({ root: join(clone, "c"), env: {} }), /shallow/);
    assert.equal(resolveStamp({ root: join(clone, "c"), env: { SOURCE_DATE_EPOCH: "1769904000" } }).source, "SOURCE_DATE_EPOCH");
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(clone, { recursive: true, force: true }); }
});

test("not a Git checkout, or no commit touching the data, is an error", () => {
  const plain = mkdtempSync(join(tmpdir(), "stamp-plain-"));
  const { dir, commit } = makeRepo();
  try {
    assert.throws(() => resolveStamp({ root: plain, env: {} }), /not a Git checkout/);
    commit("README.md", "x\n", "2026-01-01T00:00:00Z");
    assert.throws(() => resolveStamp({ root: dir, env: {} }), /no commit touches/);
  } finally { rmSync(plain, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); }
});

test("build-ics output is byte-identical for identical inputs and carries the resolved stamp", () => {
  const run = (out, extra = {}) => execFileSync("node", [join(siteRoot, "tools", "build-ics.mjs"), "--out", out], { env: { ...process.env, SOURCE_DATE_EPOCH: "1760000000", ...extra } });
  const d = mkdtempSync(join(tmpdir(), "ics-"));
  try {
    run(join(d, "1.ics")); run(join(d, "2.ics"));
    const a = readFileSync(join(d, "1.ics")); const b = readFileSync(join(d, "2.ics"));
    assert.ok(a.equals(b));
    const stamps = new Set(a.toString().match(/^DTSTAMP:.*$/gm));
    assert.deepEqual([...stamps], ["DTSTAMP:20251009T085320Z"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("build-ics refuses to build without any stamp source when history is unusable", () => {
  const d = mkdtempSync(join(tmpdir(), "ics-"));
  try {
    const env = { ...process.env }; delete env.SOURCE_DATE_EPOCH;
    assert.throws(() => execFileSync("node", [join(siteRoot, "tools", "build-ics.mjs"), "--out", join(d, "x.ics"), "--stamp", "0"], { env, stdio: "pipe" }), /epoch seconds|Command failed/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
