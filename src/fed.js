import { pathToFileURL } from "node:url";

const FED_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

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

function parseMeetingDate(monthName, dateText) {
  const month = MONTHS[monthName];

  if (!month) {
    throw new Error(`Unknown FED month: ${monthName}`);
  }

  const numbers = [...dateText.matchAll(/\d{1,2}/g)]
    .map(x => Number(x[0]));

  if (numbers.length === 0) {
    throw new Error(
      `Could not parse FED meeting date: ${monthName} ${dateText}`
    );
  }

  // FOMC decision occurs on final day of meeting range.
  const day = numbers[numbers.length - 1];

  return `2026-${month}-${String(day).padStart(2, "0")}`;
}

export async function collectFedEvents() {
  const response = await fetch(FED_URL, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `FED returned HTTP ${response.status}`
    );
  }

  const html = await response.text();
  const lines = normalizeHtml(html);

  const start = lines.findIndex(
    x => /2026 FOMC Meetings/i.test(x)
  );

  const end = lines.findIndex(
    (x, i) =>
      i > start &&
      /2025 FOMC Meetings/i.test(x)
  );

  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      "Could not isolate 2026 FOMC Meetings section."
    );
  }

  const section = lines.slice(start, end);
  const events = [];

  for (let i = 0; i < section.length; i++) {
    const monthName = Object.keys(MONTHS)
      .find(month =>
        new RegExp(`^${month}\\b`, "i")
          .test(section[i])
      );

    if (!monthName) {
      continue;
    }

    let dateText = null;

    for (
      let j = i;
      j < Math.min(section.length, i + 6);
      j++
    ) {
      if (/\d{1,2}/.test(section[j])) {
        dateText = section[j];
        break;
      }
    }

    if (!dateText) {
      continue;
    }

    const date = parseMeetingDate(
      monthName,
      dateText
    );

    if (
      !events.some(x => x.date === date)
    ) {
      events.push({
        id: `FOMC-${date}`,
        date,
        timeET: "14:00",
        source: "FED",
        event: "FOMC Decision",
        severity: "HIGH"
      });
    }
  }

  events.sort((a, b) =>
    `${a.date} ${a.timeET}`.localeCompare(
      `${b.date} ${b.timeET}`
    )
  );

  if (events.length !== 8) {
    throw new Error(
      `Expected 8 FOMC meetings for 2026, found ${events.length}`
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
      `Duplicate FED event IDs: ${duplicateIds.join(", ")}`
    );
  }

  return events;
}

async function runStandalone() {
  try {
    const events = await collectFedEvents();

    console.log("FED PARSER : PASS");
    console.log(
      "2026 meetings :",
      events.length
    );
    console.log("");

    console.table(events);
  }
  catch (error) {
    console.error("FED PARSER : FAILED");
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
