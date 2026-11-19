// Compares a built site directory with a live site, file by file.
//   node compare-site.mjs <built dir> <base url> [--strict]
// Informational by default (exit 0); --strict fails on any difference or missing file.
// meetings/feed.ics is compared without DTSTAMP lines.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const [dirArg, baseArg] = process.argv.slice(2);
if (!dirArg || !baseArg) { console.error("usage: compare-site.mjs <built dir> <base url> [--strict]"); process.exit(2); }
const dir = resolve(dirArg);
const base = baseArg.replace(/\/$/, "");
const strict = process.argv.includes("--strict");

function* walk(d) {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}
const norm = (path, buf) => path === "meetings/feed.ics" ? Buffer.from(buf.toString("utf8").replace(/^DTSTAMP:.*$/gm, "DTSTAMP:-")) : buf;

const same = [], differ = [], missing = [];
for (const file of walk(dir)) {
  const rel = relative(dir, file).split(sep).join("/");
  let res;
  try { res = await fetch(`${base}/${rel}`, { redirect: "follow", signal: AbortSignal.timeout(20000) }); } catch (e) { missing.push(`${rel} (${e.message})`); continue; }
  if (!res.ok) { missing.push(`${rel} (HTTP ${res.status})`); continue; }
  const live = norm(rel, Buffer.from(await res.arrayBuffer()));
  (live.equals(norm(rel, readFileSync(file))) ? same : differ).push(rel);
}
console.log(`identical: ${same.length}, different: ${differ.length}, not live: ${missing.length}`);
differ.forEach((f) => console.log(`  different: ${f}`));
missing.forEach((f) => console.log(`  not live:  ${f}`));
process.exit(strict && (differ.length || missing.length) ? 1 : 0);
