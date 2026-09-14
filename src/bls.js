import { pathToFileURL } from "node:url";

const BLS_ICS_URL =
  "https://www.bls.gov/schedule/news_release/bls.ics";

const NEXUS_RULES = [
  {
    pattern: /^Employment Situation/i,
    event: "Employment Situation",
    severity: "HIGH"
  },
  {
    pattern: /^Consumer Price Index/i,
    event: "Consumer Price Index",
    severity: "HIGH"
  },
  {
    pattern: /^Producer Price Index/i,
    event: "Producer Price Index",
    severity: "MEDIUM"
  },
  {
    pattern: /^Job Openings and Labor Turnover Survey/i,
    event: "Job Openings and Labor Turnover Survey",
    severity: "MEDIUM"
  },
  {
    pattern: /^U\.S\. Import and Export Price Indexes/i,
    event: "U.S. Import and Export Price Indexes",
    severity: "MEDIUM"
  }
];

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function getField(block, name) {
  const match = block.match(
    new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "mi")
  );

  return match
    ? match[1].trim()
    : null;
}

function parseDateTime(value) {
  if (!value) {
    return null;
  }

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/
  );

  if (!match) {
    return null;
  }

  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    timeET: `${match[4]}:${match[5]}`
  };
}

function slugify(text) {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function classify(summary) {
  for (const rule of NEXUS_RULES) {
    if (rule.pattern.test(summary)) {
      return {
        event: rule.event,
        severity: rule.severity
      };
    }
  }

  return null;
}

export async function collectBlsEvents() {
  const response = await fetch(BLS_ICS_URL, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `BLS returned HTTP ${response.status}`
    );
  }

  const raw = unfoldIcs(
    await response.text()
  );

  const blocks = [
    ...raw.matchAll(
      /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g
    )
  ].map(x => x[1]);

  if (blocks.length < 100) {
    throw new Error(
      `Unexpectedly low BLS event count: ${blocks.length}`
    );
  }

  const events = [];

  for (const block of blocks) {
    const summary = getField(
      block,
      "SUMMARY"
    );

    const start = getField(
      block,
      "DTSTART"
    );

    if (!summary || !start) {
      continue;
    }

    const classification =
      classify(summary);

    if (!classification) {
      continue;
    }

    const parsed =
      parseDateTime(start);

    if (!parsed) {
      throw new Error(
        `Could not parse BLS DTSTART '${start}' for '${summary}'`
      );
    }

    events.push({
      id:
        `BLS-${slugify(classification.event)}-${parsed.date}`,
      date: parsed.date,
      timeET: parsed.timeET,
      source: "BLS",
      event: classification.event,
      severity: classification.severity
    });
  }

  if (events.length === 0) {
    throw new Error(
      "No NEXUS-relevant BLS events parsed."
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
      `Duplicate BLS event IDs: ${duplicateIds.join(", ")}`
    );
  }

  events.sort((a, b) =>
    `${a.date} ${a.timeET}`.localeCompare(
      `${b.date} ${b.timeET}`
    )
  );

  return {
    rawCount: blocks.length,
    events
  };
}

async function runStandalone() {
  try {
    const result =
      await collectBlsEvents();

    const september2026 =
      result.events.filter(
        x =>
          x.date.startsWith(
            "2026-09-"
          )
      );

    console.log(
      "BLS PARSER : PASS"
    );
    console.log(
      "Raw BLS events      :",
      result.rawCount
    );
    console.log(
      "NEXUS macro events  :",
      result.events.length
    );
    console.log(
      "September 2026 NEXUS events:",
      september2026.length
    );
    console.log("");

    console.table(
      september2026
    );
  }
  catch (error) {
    console.error(
      "BLS PARSER : FAILED"
    );
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
