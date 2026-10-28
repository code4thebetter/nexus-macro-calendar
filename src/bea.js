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

function parseDate(dateText, year) {
  const match = dateText.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})$/
  );

  if (!match) {
    return null;
  }

  const date = `${year}-${MONTHS[match[1]]}-${String(match[2]).padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date ? date : null;
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

  if (hour < 1 || hour > 12 || Number(minute) > 59) {
    return null;
  }

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

export async function collectBeaEvents(fetcher = fetch) {
  const response = await fetcher(BEA_URL, {
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
  return parseBeaEvents(html);
}

function cellsWithClass(row, className) {
  return [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
    .filter(([, attributes]) => {
      const classes = attributes.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
      return classes && classes[2].split(/\s+/).includes(className);
    })
    .map(([, , content]) => normalizeHtml(content));
}

export function parseBeaEvents(html) {
  // Date/time precede the title in BEA's table. Keep each release within
  // its own row so a following release or navigation cannot supply its date.
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)]
    .filter(([, attributes]) => /\bid\s*=\s*(["'])release-schedule-table\1/i.test(attributes));
  if (tables.length !== 1) {
    throw new Error("Expected one BEA release schedule table.");
  }
  const table = tables[0][2];
  const header = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
  const years = normalizeHtml(header?.[1] ?? "").join(" ").match(/\bYear\s+(20\d{2})\b/g);
  if (years?.length !== 1) {
    throw new Error("Missing or ambiguous BEA schedule year.");
  }
  const year = years[0].match(/20\d{2}/)[0];
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!body) {
    throw new Error("Missing BEA schedule body.");
  }

  const events = [];

  for (const [, row] of body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const titles = cellsWithClass(row, "release-title");
    const title = titles[0]?.join(" ");
    const classification =
      classify(title ?? normalizeHtml(row).join(" "));

    if (!classification) {
      continue;
    }

    const dates = cellsWithClass(row, "scheduled-date");
    if (titles.length !== 1 || dates.length !== 1) {
      throw new Error(`Missing or ambiguous BEA schedule cells for '${title ?? "release"}'`);
    }
    const [dateText, timeText] = dates[0];

    // BEA sometimes publishes a release before
    // assigning its exact date/time.
    if (/^To Be Announced$/i.test(dateText ?? "")) {
      continue;
    }

    if (!dateText || !timeText || dates[0].length !== 2) {
      throw new Error(`Missing or ambiguous BEA date/time for '${title}'`);
    }

    const date = parseDate(dateText, year);
    const timeET = parseTime(timeText);

    if (!date) {
      throw new Error(
        `Could not parse BEA date '${dateText}' for '${title}'`
      );
    }

    if (!timeET) {
      throw new Error(
        `Could not parse BEA time '${timeText}' for '${title}'`
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
