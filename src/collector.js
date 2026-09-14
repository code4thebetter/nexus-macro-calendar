import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectFedEvents } from "./fed.js";
import { collectBlsEvents } from "./bls.js";
import { collectBeaEvents } from "./bea.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../data/macro-calendar.json"
);

const REQUIRED_FIELDS = [
  "id",
  "date",
  "timeET",
  "source",
  "event",
  "severity"
];

const VALID_SOURCES = new Set([
  "FED",
  "BLS",
  "BEA"
]);

const VALID_SEVERITIES = new Set([
  "LOW",
  "MEDIUM",
  "HIGH"
]);

function validateEvent(event) {
  for (const field of REQUIRED_FIELDS) {
    if (
      typeof event[field] !== "string" ||
      event[field].trim() === ""
    ) {
      throw new Error(
        `Invalid or missing '${field}' in event: ${JSON.stringify(event)}`
      );
    }
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(event.date)
  ) {
    throw new Error(
      `Invalid date '${event.date}' for ${event.id}`
    );
  }

  if (
    !/^\d{2}:\d{2}$/.test(event.timeET)
  ) {
    throw new Error(
      `Invalid timeET '${event.timeET}' for ${event.id}`
    );
  }

  if (!VALID_SOURCES.has(event.source)) {
    throw new Error(
      `Invalid source '${event.source}' for ${event.id}`
    );
  }

  if (!VALID_SEVERITIES.has(event.severity)) {
    throw new Error(
      `Invalid severity '${event.severity}' for ${event.id}`
    );
  }
}

function validateCalendar(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(
      "Merged macro calendar is empty."
    );
  }

  for (const event of events) {
    validateEvent(event);
  }

  const duplicateIds = events
    .map(x => x.id)
    .filter(
      (id, index, all) =>
        all.indexOf(id) !== index
    );

  if (duplicateIds.length > 0) {
    throw new Error(
      `Duplicate merged event IDs: ${[
        ...new Set(duplicateIds)
      ].join(", ")}`
    );
  }

  const sources =
    new Set(events.map(x => x.source));

  for (const source of VALID_SOURCES) {
    if (!sources.has(source)) {
      throw new Error(
        `Required source missing from merged calendar: ${source}`
      );
    }
  }
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const left =
      `${a.date} ${a.timeET} ${a.source} ${a.event}`;

    const right =
      `${b.date} ${b.timeET} ${b.source} ${b.event}`;

    return left.localeCompare(right);
  });
}

async function main() {
  console.log(
    "NEXUS Macro Collector : START"
  );

  const fedEvents =
    await collectFedEvents();

  console.log(
    "FED events :",
    fedEvents.length
  );

  const blsResult =
    await collectBlsEvents();

  console.log(
    "BLS events :",
    blsResult.events.length,
    `(raw ${blsResult.rawCount})`
  );

  const beaEvents =
    await collectBeaEvents();

  console.log(
    "BEA events :",
    beaEvents.length
  );

  const merged = sortEvents([
    ...fedEvents,
    ...blsResult.events,
    ...beaEvents
  ]);

  validateCalendar(merged);

  const outputDir =
    path.dirname(OUTPUT_PATH);

  fs.mkdirSync(
    outputDir,
    { recursive: true }
  );

  const tempPath =
    `${OUTPUT_PATH}.tmp`;

  fs.writeFileSync(
    tempPath,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8"
  );

  // Re-parse temp file before replacing live output.
  const verify =
    JSON.parse(
      fs.readFileSync(
        tempPath,
        "utf8"
      )
    );

  validateCalendar(verify);

  fs.renameSync(
    tempPath,
    OUTPUT_PATH
  );

  console.log("");
  console.log(
    "Merged events :",
    merged.length
  );

  console.log(
    "Output        :",
    OUTPUT_PATH
  );

  console.log(
    "NEXUS Macro Collector : PASS"
  );
}

main().catch(error => {
  console.error("");
  console.error(
    "NEXUS Macro Collector : FAILED"
  );
  console.error(error.message);
  process.exit(1);
});
