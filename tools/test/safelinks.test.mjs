import test from "node:test";
import assert from "node:assert/strict";
import { config, validator, loadConfig } from "./helpers-safelinks.mjs";

const base = () => ({
  schema_version: 2, id: "ok", title: "A meeting", wgs: ["wg1"], type: "workshop", format: "online",
  start: "2026-11-10T14:00", end: "2026-11-10T15:00", timezone: "Europe/Warsaw", access: "public",
  url: "https://example.zoom.us/j/123456789", organizers: [{ name: "A. Person" }]
});
const SAFE = "https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fmaine.zoom.us%2Fj%2F1&data=05%7Cprivate%40example.org";
const sub = (rec) => validator.validate(rec, config, { filenameId: "ok", submission: true });
const pub = (rec) => validator.validate(rec, config, { filenameId: "ok" });

test("legitimate Zoom, Teams and Meet links pass in submission mode", () => {
  for (const url of ["https://unibe-ch.zoom.us/j/65951713501", "https://teams.microsoft.com/l/meetup-join/19%3ameeting", "https://meet.google.com/abc-defg-hij", "https://outlook.office.com/owa/calendar"]) {
    assert.deepEqual(sub({ ...base(), url }), [], url);
  }
});

test("a Safe Links address is refused for new submissions with a clear message", () => {
  const e = sub({ ...base(), url: SAFE });
  assert.equal(e.length, 1);
  assert.match(e[0], /^url: must be the original meeting link/);
  assert.ok(!e[0].includes("private%40"), "the rejected URL is never echoed");
});

test("all regional hosts and the .us family are detected by hostname", () => {
  for (const host of ["nam02.safelinks.protection.outlook.com", "eur03.safelinks.protection.outlook.com", "SAFELINKS.PROTECTION.OUTLOOK.COM", "usg01.safelinks.protection.office365.us"]) {
    assert.equal(sub({ ...base(), url: "https://" + host + "/?url=x" }).length, 1, host);
  }
});

test("only the hostname counts: look-alike text elsewhere in a URL is not a false positive", () => {
  for (const url of ["https://zoom.us/j/1?next=safelinks.protection.outlook.com", "https://zoom.us/safelinks.protection.outlook.com", "https://notsafelinks.protection.outlook.com.example.org/x", "https://example.org/#safelinks.protection.outlook.com"]) {
    assert.deepEqual(sub({ ...base(), url }), [], url);
  }
});

test("registration and extra link fields are checked too", () => {
  const reg = sub({ ...base(), access: "registration", url: undefined, registration_url: SAFE });
  assert.ok(reg.some((x) => x.startsWith("registration_url: must be the original")));
  const links = sub({ ...base(), links: [{ label: "Agenda", url: SAFE }] });
  assert.ok(links.some((x) => x.startsWith("links[0].url: must be the original")));
});

test("published records are NOT invalidated (no submission mode)", () => {
  assert.deepEqual(pub({ ...base(), url: SAFE }), []);
  assert.deepEqual(validator.validate({ ...base(), url: SAFE }, config, { filenameId: "ok" }), []);
});

test("isWrappedUrl never throws and makes no request", () => {
  for (const v of ["", "not a url", null, undefined, 5, "https://"]) assert.equal(validator.isWrappedUrl(v), false);
});
