const BLS_ICS =
  "https://www.bls.gov/schedule/news_release/bls.ics";

const IMPORTANT_EVENTS = new Map([
  ["Employment Situation", "HIGH"],
  ["Consumer Price Index", "HIGH"],
  ["Producer Price Index", "MEDIUM"],
  ["Job Openings and Labor Turnover Survey", "MEDIUM"],
  ["U.S. Import and Export Price Indexes", "MEDIUM"]
]);

function fail(message) {
  console.error("BLS PARSER : FAILED");
  console.error(message);
  process.exit(1);
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseRawEvents(text) {
  const unfolded = unfoldIcs(text);

  const blocks =
    unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

  return blocks.map(block => {
    const get = name => {
      const match = block.match(
        new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "m")
      );

      return match ? match[1].trim() : null;
    };

    return {
      dtstart: get("DTSTART"),
      summary: get("SUMMARY")
    };
  });
}

function normalizeDateTime(raw) {
  const match = raw?.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/
  );

  if (!match) {
    throw new Error(`Invalid DTSTART: ${raw}`);
  }

  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    timeET: `${match[4]}:${match[5]}`
  };
}

function slugify(text) {
  return text
    .toUpperCase()
    .replace(/U\.S\./g, "US")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

try {
  const response = await fetch(BLS_ICS, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  if (!response.ok) {
    fail(`BLS returned HTTP ${response.status}`);
  }

  const ics = await response.text();
  const rawEvents = parseRawEvents(ics);

  if (rawEvents.length < 100) {
    fail(
      `Unexpectedly small BLS calendar: ${rawEvents.length} events`
    );
  }

  const important = [];

  for (const event of rawEvents) {
    const severity = IMPORTANT_EVENTS.get(event.summary);

    if (!severity) {
      continue;
    }

    const { date, timeET } =
      normalizeDateTime(event.dtstart);

    important.push({
      id: `BLS-${slugify(event.summary)}-${date}`,
      date,
      timeET,
      source: "BLS",
      event: event.summary,
      severity
    });
  }

  if (important.length === 0) {
    fail("No important BLS events were parsed.");
  }

  const duplicateIds = important
    .map(x => x.id)
    .filter((id, index, all) =>
      all.indexOf(id) !== index
    );

  if (duplicateIds.length > 0) {
    fail(
      `Duplicate event IDs detected: ${duplicateIds.join(", ")}`
    );
  }

  important.sort((a, b) =>
    `${a.date} ${a.timeET}`.localeCompare(
      `${b.date} ${b.timeET}`
    )
  );

  console.log("BLS PARSER : PASS");
  console.log("Raw BLS events      :", rawEvents.length);
  console.log("NEXUS macro events  :", important.length);
  console.log("");

  const september2026 = important.filter(
    x => x.date.startsWith("2026-09")
  );

  console.log(
    "September 2026 NEXUS events:",
    september2026.length
  );

  console.table(september2026);
}
catch (error) {
  fail(error.message);
}
