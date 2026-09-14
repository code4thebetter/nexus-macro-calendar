import { pathToFileURL } from "node:url";

const BEA_URL =
  "https://www.bea.gov/news/schedule";

const MONTHS = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12"
};

function normalizeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function parseDate(dateText) {
  const match = dateText.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})$/
  );

  if (!match) {
    return null;
  }

  return `2026-${MONTHS[match[1]]}-${String(match[2]).padStart(2, "0")}`;
}

function parseTime(timeText) {
  const match = timeText.match(
    /^(\d{1,2}):(\d{2})\s+(AM|PM)$/i
  );

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = match[3].toUpperCase();

  if (suffix === "PM" && hour !== 12) {
    hour += 12;
  }

  if (suffix === "AM" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function classify(title) {
  if (/Personal Income and Outlays/i.test(title)) {
    return {
      event: "Personal Income and Outlays",
      severity: "HIGH"
    };
  }

  if (/GDP \(Advance Estimate\)/i.test(title)) {
    return {
      event: "GDP Advance Estimate",
      severity: "HIGH"
    };
  }

  if (/GDP \(Second Estimate\)/i.test(title)) {
    return {
      event: "GDP Second Estimate",
      severity: "MEDIUM"
    };
  }

  if (/GDP \(Third Estimate\)/i.test(title)) {
    return {
      event: "GDP Third Estimate",
      severity: "MEDIUM"
    };
  }

  return null;
}

function slugify(text) {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function collectBeaEvents() {
  const response = await fetch(BEA_URL, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `BEA returned HTTP ${response.status}`
    );
  }

  const html = await response.text();
  const lines = normalizeHtml(html);

  const events = [];

  for (let i = 0; i < lines.length; i++) {
    const classification =
      classify(lines[i]);

    if (!classification) {
      continue;
    }

    const dateText = lines[i + 1];
    const timeText = lines[i + 2];

    if (!dateText || !timeText) {
      throw new Error(
        `Missing date/time after '${lines[i]}'`
      );
    }

    // BEA sometimes publishes a release before
    // assigning its exact date/time.
    if (/To Be Announced/i.test(dateText)) {
      continue;
    }

    const date = parseDate(dateText);
    const timeET = parseTime(timeText);

    if (!date) {
      throw new Error(
        `Could not parse BEA date '${dateText}' for '${lines[i]}'`
      );
    }

    if (!timeET) {
      throw new Error(
        `Could not parse BEA time '${timeText}' for '${lines[i]}'`
      );
    }

    events.push({
      id:
        `BEA-${slugify(classification.event)}-${date}`,
      date,
      timeET,
      source: "BEA",
      event: classification.event,
      severity: classification.severity
    });
  }

  if (events.length === 0) {
    throw new Error(
      "No NEXUS-relevant BEA events parsed."
    );
  }

  const duplicateIds = events
    .map(x => x.id)
    .filter(
      (id, index, all) =>
        all.indexOf(id) !== index
    );

  if (duplicateIds.length > 0) {
    throw new Error(
      `Duplicate BEA event IDs: ${duplicateIds.join(", ")}`
    );
  }

  events.sort((a, b) =>
    `${a.date} ${a.timeET}`.localeCompare(
      `${b.date} ${b.timeET}`
    )
  );

  return events;
}

async function runStandalone() {
  try {
    const events =
      await collectBeaEvents();

    console.log("BEA PARSER : PASS");
    console.log(
      "NEXUS BEA events :",
      events.length
    );
    console.log("");

    console.table(events);
  }
  catch (error) {
    console.error("BEA PARSER : FAILED");
    console.error(error.message);
    process.exit(1);
  }
}

const isStandalone =
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(process.argv[1]).href;

if (isStandalone) {
  await runStandalone();
}
