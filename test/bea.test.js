import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { collectBeaEvents, parseBeaEvents } from "../src/bea.js";

const fixture = fs.readFileSync(new URL("fixtures/bea-schedule.html", import.meta.url), "utf8");
const row = (title, date = "October 29", time = "8:30 AM") =>
  `<tr><td class="scheduled-date"><div>${date}</div><small>${time}</small></td>` +
  `<td class="release-title">${title}</td></tr>`;
const schedule = (rows, year = "2026") =>
  `<table id="release-schedule-table"><thead><tr><th>Year ${year}</th></tr></thead>` +
  `<tbody>${rows}</tbody></table>`;
const title = "Personal Income and Outlays, September 2026";

test("captured schedule binds dates to rows, including the final release before Quick Links", () => {
  const events = parseBeaEvents(fixture);
  assert.deepEqual(events.map(({ event, date, timeET, source }) => [event, date, timeET, source]), [
    ["GDP Advance Estimate", "2026-10-29", "08:30", "BEA"],
    ["Personal Income and Outlays", "2026-10-29", "08:30", "BEA"],
    ["GDP Second Estimate", "2026-11-25", "08:30", "BEA"],
    ["Personal Income and Outlays", "2026-11-25", "08:30", "BEA"],
    ["GDP Third Estimate", "2026-12-23", "08:30", "BEA"],
    ["Personal Income and Outlays", "2026-12-23", "08:30", "BEA"]
  ]);
  assert.equal(events.at(-1).id, "BEA-PERSONAL-INCOME-AND-OUTLAYS-2026-12-23");
});

test("release-like navigation outside the schedule cannot supply events or dates", () => {
  const navigation = `<nav>${title}<div>Quick Links</div><div>January 1</div><div>8:30 AM</div></nav>`;
  assert.deepEqual(parseBeaEvents(navigation + fixture + navigation), parseBeaEvents(fixture));
});

for (const date of ["Quick Links", "Not a date", "February 30", "April 31", "October 0", "October 32"]) {
  test(`rejects malformed date ${JSON.stringify(date)} without borrowing the following row`, () => {
    assert.throws(() => parseBeaEvents(schedule(row(title, date) + row("GDP (Advance Estimate)", "November 25"))), /Could not parse BEA date/);
  });
}

for (const time of ["not a time", "13:30 PM", "0:30 AM", "8:60 AM"]) {
  test(`rejects malformed time ${JSON.stringify(time)}`, () => {
    assert.throws(() => parseBeaEvents(schedule(row(title, "October 29", time))), /Could not parse BEA time/);
  });
}

test("requires the schedule table, year, body, and each relevant row's cells", () => {
  for (const html of [
    fixture.replace('id="release-schedule-table"', 'id="unrelated"'),
    fixture + fixture,
    fixture.replace("Year 2026", "Release year unknown"),
    fixture.replace("<tbody>", "<section>"),
    schedule(row(title).replace('class="scheduled-date"', 'class="unknown"')),
    schedule(row(title).replace('class="release-title"', 'class="unknown"')),
    schedule(row(title, "October 29", ""))
  ]) assert.throws(() => parseBeaEvents(html), /BEA/);
});

test("an explicitly unannounced date is skipped; an empty relevant calendar still fails", () => {
  const tba = row(title, "To Be Announced", "");
  assert.equal(parseBeaEvents(schedule(tba + row("GDP (Advance Estimate)"))).length, 1);
  assert.throws(() => parseBeaEvents(schedule(tba)), /No NEXUS-relevant BEA events/);
  assert.throws(() => parseBeaEvents(schedule(row("Unrelated release"))), /No NEXUS-relevant BEA events/);
});

test("duplicate event IDs still fail", () => {
  assert.throws(() => parseBeaEvents(schedule(row(title) + row(title))), /Duplicate BEA event IDs/);
});

test("year comes from the schedule header and noon/midnight retain their meaning", () => {
  const events = parseBeaEvents(schedule(row(title, "January 2", "12:00 AM") + row("GDP (Advance Estimate)", "January 3", "12:00 PM"), "2027"));
  assert.deepEqual(events.map(x => [x.date, x.timeET]), [["2027-01-02", "00:00"], ["2027-01-03", "12:00"]]);
});

test("collector uses the same row parser and rejects HTTP failures", async t => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, text: async () => fixture }));
  assert.deepEqual(await collectBeaEvents(), parseBeaEvents(fixture));
  globalThis.fetch.mock.mockImplementation(async () => ({ ok: false, status: 503 }));
  await assert.rejects(collectBeaEvents(), /BEA returned HTTP 503/);
});
