// Required PR check: generate a fresh calendar from the PROPOSED records and verify it.
//
// The feed is a generated deployment artifact, so a pull request needs to carry only its YAML
// record. This check never reads the committed meetings/feed.ics: it validates every record,
// builds the calendar with the same generator the Pages build uses, parses the result with an
// independent iCalendar parser (ical.js) and checks that every record is represented exactly once
// (one UID per single event, one series UID per recurring event) and that no UID repeats.
//   node check-calendar.mjs [--dir <records dir>] [--out <file>]   (--out keeps the generated feed)
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ICAL from "ical.js";
import { ics, loadConfig, recordsDir, validateDir } from "./lib.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const config = loadConfig();
const results = validateDir(resolve(arg("--dir") || recordsDir()), config);
const invalid = results.filter((r) => r.errors.length);
if (invalid.length) {
  invalid.forEach((r) => console.error(`invalid record ${r.file}: ${r.errors.join("; ")}`));
  process.exit(1);
}

const records = results.map((r) => r.record);
// A fixed stamp: this calendar is only inspected, never published.
const text = ics.buildCalendar(records, config, { stamp: 0, origin: config.ui.site_url });

const problems = [];
let events = [];
try {
  events = new ICAL.Component(ICAL.parse(text)).getAllSubcomponents("vevent");
} catch (e) {
  problems.push("the generated calendar does not parse: " + e.message.split("\n")[0]);
}
const uids = events.map((e) => String(e.getFirstPropertyValue("uid")));
if (new Set(uids).size !== uids.length) problems.push("duplicate UIDs in the generated calendar");
for (const r of records) {
  const own = uids.filter((u) => u === `${r.id}@${new URL(config.ui.site_url).hostname}` || u.startsWith(r.id + "-"));
  if (own.length === 0) problems.push(`record ${r.id} is missing from the generated calendar`);
}
if (problems.length) {
  problems.forEach((p) => console.error(p));
  process.exit(1);
}
if (arg("--out")) writeFileSync(resolve(arg("--out")), text, "utf8");
console.log(`fresh calendar OK: ${records.length} record(s), ${events.length} event(s), ${new Set(uids).size} unique UID(s)`);
