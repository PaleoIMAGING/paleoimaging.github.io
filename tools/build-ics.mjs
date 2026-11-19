// Generates the subscribable iCalendar feed from _data/meetings/*.yml.
//   node build-ics.mjs --out ../meetings/feed.ics   write the feed
//   --dir <records dir>   use another records directory
//   --stamp <epoch-s>     DTSTAMP override (else SOURCE_DATE_EPOCH, else Git history; see stamp.mjs)
// meetings/feed.ics is NOT tracked in Git (it is a generated deployment artifact).
// The feed is built by assets/js/meetings-ics.js: CRLF, folded lines and
// embedded VTIMEZONE blocks, which Jekyll's Liquid cannot produce.
import { writeFileSync } from "node:fs";
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
// A build must have a real, deterministic stamp (see stamp.mjs).
let stamp;
try {
  const s = resolveStamp({ root: siteRoot, args: process.argv.slice(2) });
  stamp = s.ms;
  if (s.source === "git" && dataIsDirty(siteRoot)) console.warn("warning: meeting data has uncommitted changes; DTSTAMP reflects the last commit.");
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const text = ics.buildCalendar(results.map((r) => r.record), config, { stamp, origin });
writeFileSync(feedPath, text, { encoding: "utf8" });
console.log(`wrote ${feedPath} (${results.length} record(s))`);
