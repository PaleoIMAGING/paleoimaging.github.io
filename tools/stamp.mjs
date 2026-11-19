// Deterministic DTSTAMP for the generated calendar.
//
// Strategy (calendar-wide): one timestamp for every VEVENT, taken from the revision
// history of the meeting data, so identical inputs at the same source revision give
// byte-identical output. Precedence:
//   1. --stamp <epoch-seconds>        explicit override
//   2. SOURCE_DATE_EPOCH (seconds)    reproducible-builds convention
//   3. committer time of the latest commit touching _data/meetings or _data/meetings_config.yml
// There is deliberately NO wall-clock fallback: a shallow clone or a missing history is an
// error, because a silent Date.now() would make CI output non-reproducible.
import { execFileSync } from "node:child_process";

const DATA_PATHS = ["_data/meetings", "_data/meetings_config.yml"];

function parseEpoch(value, label) {
  if (!/^[1-9]\d{0,11}$/.test(String(value))) throw new Error(`${label} must be a positive integer (epoch seconds)`);
  return Number(value) * 1000;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** @returns {{ ms: number, source: string }} */
export function resolveStamp({ root, args = [], env = process.env, run = git } = {}) {
  const i = args.indexOf("--stamp");
  if (i > -1) return { ms: parseEpoch(args[i + 1], "--stamp"), source: "--stamp" };
  if (env.SOURCE_DATE_EPOCH) return { ms: parseEpoch(env.SOURCE_DATE_EPOCH, "SOURCE_DATE_EPOCH"), source: "SOURCE_DATE_EPOCH" };

  const hint = "Set SOURCE_DATE_EPOCH, pass --stamp <epoch-seconds>, or fetch full history (actions/checkout fetch-depth: 0).";
  let shallow;
  try {
    shallow = run(root, ["rev-parse", "--is-shallow-repository"]);
  } catch {
    throw new Error(`Cannot determine DTSTAMP: not a Git checkout. ${hint}`);
  }
  if (shallow === "true") throw new Error(`Cannot determine DTSTAMP: shallow Git history. ${hint}`);
  let out = "";
  try { out = run(root, ["log", "-1", "--format=%ct", "--", ...DATA_PATHS]); } catch { /* handled below */ }
  if (!/^\d+$/.test(out)) throw new Error(`Cannot determine DTSTAMP: no commit touches the meeting data. ${hint}`);
  return { ms: Number(out) * 1000, source: "git" };
}

/** True when meeting data has uncommitted changes (the stamp then predates them). */
export function dataIsDirty(root, run = git) {
  try { return run(root, ["status", "--porcelain", "--", ...DATA_PATHS]) !== ""; } catch { return false; }
}
