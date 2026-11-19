// Generates the subscribable iCalendar feed from _data/meetings/*.yml.
//   node build-ics.mjs --out ../meetings/feed.ics   write the feed
//   node build-ics.mjs --check                      fail if the committed feed is stale
//   --dir <records dir>   use another records directory
//   --stamp <epoch-s>     DTSTAMP override (else SOURCE_DATE_EPOCH, else Git history; see stamp.mjs)
// The feed is built by assets/js/meetings-ics.js: CRLF, folded lines and
// embedded VTIMEZONE blocks, which Jekyll's Liquid cannot produce.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ics, loadConfig, recordsDir, siteRoot, validateDir } from "./lib.mjs";
import { dataIsDirty, resolveStamp } from "./stamp.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const feedPath = resolve(arg("--out") || join(siteRoot, "meetings", "feed.ics"));
const config = loadConfig();

const results = validateDir(resolve(arg("--dir") || recordsDir()), config);
const invalid = results.filter((r) => r.errors.length);
if (invalid.length) {
  invalid.forEach((r) => console.error(`invalid record ${r.file}: ${r.errors.join("; ")}`));
  process.exit(1);
}

const origin = config.ui.site_url;
const checking = process.argv.includes("--check");
// --check ignores DTSTAMP (see below), so it needs no history; a build must have a real stamp.
let stamp = 0;
if (!checking) {
  try {
    const s = resolveStamp({ root: siteRoot, args: process.argv.slice(2) });
    stamp = s.ms;
    if (s.source === "git" && dataIsDirty(siteRoot)) console.warn("warning: meeting data has uncommitted changes; DTSTAMP reflects the last commit.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
const text = ics.buildCalendar(results.map((r) => r.record), config, { stamp, origin });

// Transitional: the committed feed may have been produced by the Worker with another stamp,
// so staleness still ignores DTSTAMP.
const normalise = (s) => s.replace(/^DTSTAMP:.*$/gm, "DTSTAMP:-");

if (checking) {
  let current = "";
  try { current = readFileSync(feedPath, "utf8"); } catch { /* missing counts as stale */ }
  if (normalise(current) !== normalise(text)) {
    console.error(`${feedPath} is out of date. Run: npm run build:ics`);
    process.exit(1);
  }
  console.log("feed.ics is up to date");
} else {
  writeFileSync(feedPath, text, { encoding: "utf8" });
  console.log(`wrote ${feedPath} (${results.length} record(s))`);
}
