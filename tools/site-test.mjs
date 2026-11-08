// Checks a BUILT site (the _site directory produced by Jekyll).
//   node site-test.mjs <_site dir> --empty     the published configuration: no records
//   node site-test.mjs <_site dir> --samples   built with the test fixtures copied in
//   node site-test.mjs <_site dir> --published the real repository data: every record is on the page and in the feed
// (--empty must be run against a build that has no records; the workflow builds a temporary copy for it.)
// Runs the real page scripts in jsdom at a fixed clock (2026-10-08 12:00 UTC).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ICAL from "ical.js";
import { JSDOM, VirtualConsole } from "jsdom";
import { siteRoot, readRecords, recordsDir } from "./lib.mjs";

const dir = resolve(process.argv[2] || "");
const mode = process.argv.includes("--samples") ? "samples" : process.argv.includes("--hostile") ? "hostile" : process.argv.includes("--published") ? "published" : "empty";
const read = (p) => readFileSync(join(dir, p), "utf8");
const FIXED = Date.UTC(2026, 9, 8, 12);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// Homepage uses the shared layout: site navigation links to the calendar, and the PAGES affiliation stays.
const home = read("index.html");
ok(/class="site-header"/.test(home) && /href="\/meetings\/"/.test(home), "homepage must carry the site navigation with a Meetings link");
ok(/PAGES_logo\.svg/.test(home), "homepage must keep the PAGES logo");
ok(!/<meta name="robots"/.test(home), "homepage must stay indexable");

// Feed: valid iCalendar with CRLF endings.
const feed = readFileSync(join(dir, "meetings", "feed.ics"), "utf8");
ok(feed.startsWith("BEGIN:VCALENDAR\r\n") && !/(^|[^\r])\n/.test(feed), "feed is not CRLF");
const comp = new ICAL.Component(ICAL.parse(feed));
const nEvents = comp.getAllSubcomponents("vevent").length;

const html = read("meetings/index.html");
ok(/<meta name="robots" content="noindex/.test(html), "calendar page should be noindex until launch");
ok(/Skip to content/.test(html), "layout missing");

// Join Us: one header button to the internal /join/ page; no subscription action or instructions in the header or
// footer; /join/ carries the mailto button, the visible copyable fallback address and the Mailman management link.
{
  const JOIN = "paleoimaging.pages-join@lists.unibe.ch";
  const MANAGE = "https://listserv.unibe.ch/mailman/listinfo/paleoimaging.pages";
  const header = (src) => (src.match(/<header class="site-header"[\s\S]*?<\/header>/) || [""])[0];
  const footer = (src) => (src.match(/<footer class="site-footer"[\s\S]*?<\/footer>/) || [""])[0];
  for (const [name, src] of [["home", home], ["meetings", html]]) {
    const hd = header(src), ft = footer(src);
    const btns = [...hd.matchAll(/<a\b[^>]*class="btn"[^>]*>/g)];
    ok(btns.length === 1 && /href="\/join\/"/.test(btns[0][0]) && /class="btn"[^>]*>\s*Join Us<\/a>/.test(hd), `${name}: header must have exactly one Join Us button pointing to /join/`);
    ok(!/mailto:|listserv\.unibe\.ch|spam folder|no subject/.test(hd), `${name}: header must carry no subscription link or instructions`);
    ok(/PAGES/.test(ft) && /github\.com\/PaleoIMAGING/.test(ft), `${name}: footer must keep its institutional and GitHub links`);
    ok(!/mailto:|listserv\.unibe\.ch|mailing list|Join Us|join-note/i.test(ft), `${name}: footer must have no subscription action or instructions`);
    for (const p of ["/about/", "/core-group/", "/working-groups/", "/meetings/", "/where-we-are/", "/news/", "/search/"]) ok(hd.includes(`href="${p}"`), `${name}: navigation link ${p} missing`);
  }
  const jp = read("join/index.html");
  ok(/<h1>Join the PaleoIMAGING Community<\/h1>/.test(jp) && /Skip to content/.test(jp), "/join/ must be built with the site layout");
  ok(!/<meta name="robots"/.test(jp), "/join/ must stay indexable");
  const mailtos = [...jp.matchAll(/href="(mailto:[^"]*)"/g)].map((m) => m[1]);
  ok(mailtos.length === 1 && mailtos[0] === `mailto:${JOIN}`, `/join/ must have exactly one mailto, exactly mailto:${JOIN} (no subject or body); got ${mailtos}`);
  ok(/<a class="btn join-btn" href="mailto:[^"]*">Subscribe by email<\/a>/.test(jp), "/join/ needs the Subscribe by email button");
  ok(/If nothing happens when you click/.test(jp) && /send a blank message to/.test(jp), "/join/ fallback section missing");
  ok(new RegExp(`<code class="join-address" id="join-address">${JOIN.replace(/\./g, "\.")}</code>`).test(jp), "/join/ must show the address as selectable text");
  ok(/check your spam folder/.test(jp) && /may receive an email asking you to confirm/.test(jp), "/join/ confirmation wording missing");
  ok(!/always|immediately subscribed|automatically subscribed/i.test(jp), "/join/ must not overclaim about confirmation or instant subscription");
  ok(jp.includes(`<a href="${MANAGE}">Manage or unsubscribe from the mailing list</a>`), "/join/ must link to the Mailman management page");
  ok(!/<a class="btn[^"]*"[^>]*listserv/.test(jp), "the University of Bern page must not be a primary action");
  // Copy button: works without JavaScript (hidden until the script reveals it), keyboard-operable, announces the result.
  ok(/<button type="button" class="btn btn--ghost" id="copy-address" data-target="join-address" hidden>Copy address<\/button>/.test(jp), "copy button must be a real button, hidden until JavaScript runs");
  ok(/id="copy-status"[^>]*role="status"[^>]*aria-live="polite"/.test(jp), "copy feedback must be announced (role=status, aria-live)");
  ok(/src="\/assets\/js\/join\.js"/.test(jp), "/join/ must load join.js");
  const js = readFileSync(join(dir, "assets/js/join.js"), "utf8");
  ok(/navigator\.clipboard/.test(js) && /execCommand\("copy"\)/.test(js) && /btn\.hidden = false/.test(js) && /Could not copy automatically/.test(js), "join.js must copy with a fallback and report failure");
  // Behaviour in jsdom: button appears, copy reports success; a failing clipboard falls back to a visible message.
  for (const mode of ["ok", "fail"]) {
    const dom = new JSDOM(jp.replace(/<script src="[^"]*"><\/script>/g, ""), { runScripts: "outside-only", url: "https://example.org/join/" });
    const w = dom.window;
    if (mode === "ok") Object.defineProperty(w.navigator, "clipboard", { value: { writeText: (t) => { w.__copied = t; return Promise.resolve(); } } });
    Object.defineProperty(w, "isSecureContext", { value: mode === "ok" });
    w.document.execCommand = () => false;
    w.eval(js);
    const b = w.document.getElementById("copy-address");
    ok(!b.hidden, "copy button must appear when JavaScript runs");
    b.click();
    await new Promise((r) => setTimeout(r, 20));
    const msg = w.document.getElementById("copy-status").textContent;
    if (mode === "ok") ok(w.__copied === JOIN && /copied/.test(msg), "copy must put the exact address on the clipboard and say so");
    else ok(/Could not copy automatically/.test(msg), "failed copy must tell the user how to copy manually");
  }
}

// jsdom ignores CSS, so guard the rule that makes the `hidden` attribute win over display:grid/flex.
ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(read("assets/css/site.css")), "CSS must keep [hidden] effective");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));

function load(url, dom_html) {
  const noExternal = dom_html.replace(/<script src="[^"]*"><\/script>/g, "");
  const dom = new JSDOM(noExternal, { url, runScripts: "outside-only", virtualConsole: vc, pretendToBeVisual: true });
  const w = dom.window;
  w.eval(`Date.now = () => ${FIXED};`);
  w.Element.prototype.scrollIntoView = function () {};
  for (const f of ["meetings-core.js", "meetings-ics.js", "meetings-render.js", "meetings-page.js"]) w.eval(readFileSync(join(siteRoot, "assets/js", f), "utf8"));
  return w;
}
const titles = (w) => [...w.document.querySelectorAll("#meeting-list .card h2")].map((h) => h.textContent);

if (mode === "hostile") {
  // Unvalidated hostile data injected straight into the build: the page must neutralise it by itself.
  const m = html.match(/<script type="application\/json" id="meetings-data">([\s\S]*?)<\/script>/);
  ok(m, "embedded data block missing");
  ok(!m[1].includes("<"), "unescaped < in embedded JSON");
  ok(!html.includes("</script><script>window.__pwned"), "script breakout reached the HTML");
  const data = JSON.parse(m[1]);
  ok(data.meetings.some((x) => x.title.startsWith("</script>")), "hostile record round-trips as data");
  const w = load("https://paleoimaging.github.io/meetings/", html);
  w.document.querySelector('[data-view="all"]').click();
  ok(titles(w).some((t) => t.startsWith("</script>")), "hostile title is shown as inert text");
  ok(w.document.querySelectorAll("#meeting-list script, #meeting-list img, #meeting-list b").length === 0, "markup was created from data");
  ok(w.__pwned === undefined, "script from data ran");
  const links = [...w.document.querySelectorAll("#meeting-list a")].map((a) => a.href);
  ok(links.every((h) => h.startsWith("https://")), "non-https link rendered");
} else if (mode === "published") {
  // Works for any number of records, including none: every record in _data/meetings must be
  // in the embedded page data and in the committed feed, and nothing else may be in either.
  const recs = readRecords(recordsDir());
  ok(recs.every((r) => !r.parseError), "a record failed to parse");
  const m = html.match(/<script type="application\/json" id="meetings-data">([\s\S]*?)<\/script>/);
  ok(m && !m[1].includes("<"), "embedded data block missing or unescaped");
  const pageIds = JSON.parse(m[1]).meetings.map((x) => x.id).sort();
  ok(JSON.stringify(pageIds) === JSON.stringify(recs.map((r) => r.id).sort()), "page data differs from the records: " + pageIds.join(","));
  const unfolded = feed.replace(/\r\n[ \t]/g, "");
  const uids = [...unfolded.matchAll(/^UID:(.*)\r$/gm)].map((x) => x[1]);
  const forRecord = (u, id) => u.startsWith(id + "@") || u.startsWith(id + "-");
  for (const r of recs) ok(uids.some((u) => forRecord(u, r.id)), "record missing from feed: " + r.id);
  ok(uids.every((u) => recs.some((r) => forRecord(u, r.id))), "feed contains an event with no record");
  ok(!/\[SAMPLE\]|Sample data/.test(html + feed), "sample data leaked into the published site");
  const w = load("https://paleoimaging.github.io/meetings/", html);
  w.document.querySelector('[data-view="all"]')?.click();
  ok(recs.length === 0 || titles(w).length > 0, "records exist but no cards were rendered");
  console.log("records checked: " + recs.length);
} else if (mode === "empty") {
  ok(nEvents === 0, "published feed must contain no events");
  ok(!/\[SAMPLE\]|Sample data/.test(html + feed), "sample data leaked into the published site");
  const w = load("https://paleoimaging.github.io/meetings/", html);
  ok(!w.document.getElementById("empty-state").hidden, "empty-state message not shown");
  ok(/No meetings are scheduled yet/.test(w.document.getElementById("empty-state").textContent), "empty-state text");
  ok(w.document.getElementById("filters").hidden, "filters should stay hidden when empty");
  ok(titles(w).length === 0, "no cards expected");
} else {
  ok(nEvents === 9, "expected 9 events in the sample feed, got " + nEvents);
  const w = load("https://paleoimaging.github.io/meetings/", html);
  const up = titles(w);
  ok(up.length === 12 && /WG2 interlab comparison call/.test(up[0]), "upcoming list unexpected: " + up.length);
  ok(/Sample data/.test(html), "sample banner missing");
  w.document.querySelector('[data-view="past"]').click();
  ok(titles(w).length === 4, "past list unexpected");
  w.document.querySelector('[data-view="upcoming"]').click();
  const sel = w.document.getElementById("f-wg");
  sel.value = "wg2";
  sel.dispatchEvent(new w.Event("change"));
  ok(titles(w).length === 4, "WG2 filter unexpected");
  sel.value = "sc";
  sel.dispatchEvent(new w.Event("change"));
  ok(titles(w).length === 1 && /SC Steering Committee call/.test(titles(w)[0]), "SC filter unexpected: " + titles(w).join("; "));
  // Hostile query string must not create elements.
  const evil = load("https://paleoimaging.github.io/meetings/?q=%3Cimg%20src%3Dx%3E&wg=%3Cb%3E", html);
  ok(evil.document.querySelectorAll("#meeting-list img, #meeting-list b").length === 0, "query-string injection");
  // Deep link to a past event reveals it.
  const deep = load("https://paleoimaging.github.io/meetings/#sample-past-community-workshop", html);
  ok(!!deep.document.getElementById("sample-past-community-workshop"), "deep link target missing");
  // Embedded JSON cannot break out of its script element.
  const m = html.match(/<script type="application\/json" id="meetings-data">([\s\S]*?)<\/script>/);
  ok(m && !m[1].includes("<"), "unescaped < in embedded JSON");
  JSON.parse(m[1]);
}
ok(errors.length === 0, "page script errors: " + errors.slice(0, 2).join(" | "));
console.log(`site checks (${mode}): ${checks} passed`);
