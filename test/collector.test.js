import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

test("a malformed BEA schedule fails collection without replacing the previous output", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-calendar-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(fileURLToPath(new URL("../src", import.meta.url)), path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.mkdirSync(path.join(root, "data"));
  const output = path.join(root, "data/macro-calendar.json");
  const previous = '[{"sentinel":"previous calendar must remain byte-exact"}]\n';
  fs.writeFileSync(output, previous);

  // Synthetic Fed/BLS responses satisfy their existing admission checks.
  // No network requests are made by this regression test.
  const fed = "<h2>2026 FOMC Meetings</h2>" +
    ["January", "March", "April", "June", "July", "September", "October", "December"]
      .map(month => `<div>${month}</div><div>1-2</div>`).join("") +
    "<h2>2025 FOMC Meetings</h2>";
  const bls = Array.from({ length: 100 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10).replaceAll("-", "");
    return `BEGIN:VEVENT\nSUMMARY:Consumer Price Index\nDTSTART:${date}T083000\nEND:VEVENT`;
  }).join("\n");
  const bea = fs.readFileSync(new URL("fixtures/bea-schedule.html", import.meta.url), "utf8")
    .replace("October 29", "Quick Links");
  const responses = {
    "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm": fed,
    "https://www.bls.gov/schedule/news_release/bls.ics": bls,
    "https://www.bea.gov/news/schedule": bea
  };
  const preload = path.join(root, "fetch-fixtures.mjs");
  fs.writeFileSync(preload, `const responses = ${JSON.stringify(responses)};
globalThis.fetch = async url => {
  if (!(url in responses)) throw new Error("Unexpected network target");
  return new Response(responses[url], {status: 200});
};\n`);
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, "src/collector.js"], {
    cwd: root, encoding: "utf8", timeout: 10000, windowsHide: true
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FED events : 8/, result.stderr);
  assert.match(result.stdout, /BLS events : 100/);
  assert.match(result.stderr, /Could not parse BEA date 'Quick Links'/);
  assert.equal(fs.readFileSync(output, "utf8"), previous);
  assert.equal(fs.existsSync(`${output}.tmp`), false);
});
