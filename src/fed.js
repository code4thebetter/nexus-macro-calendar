const FED_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

const MONTHS = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12
};

function fail(message) {
  console.error("FED PARSER : FAILED");
  console.error(message);
  process.exit(1);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);
}

try {
  const response = await fetch(FED_URL, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  if (!response.ok) {
    fail(`Federal Reserve returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const lines = stripHtml(html);

  const start = lines.findIndex(
    x => x.includes("2026 FOMC Meetings")
  );

  if (start === -1) {
    fail("2026 FOMC section not found.");
  }

  const end = lines.findIndex(
    (x, i) =>
      i > start &&
      x.includes("2025 FOMC Meetings")
  );

  if (end === -1) {
    fail("Could not determine end of 2026 FOMC section.");
  }

  const section = lines.slice(start + 1, end);

  const meetings = [];

  for (let i = 0; i < section.length; i++) {
    const monthName = section[i];

    if (!(monthName in MONTHS)) {
      continue;
    }

    let dateText = null;

    for (
      let j = i + 1;
      j < Math.min(i + 5, section.length);
      j++
    ) {
      if (/^\d{1,2}(?:-\d{1,2})?\*?$/.test(section[j])) {
        dateText = section[j];
        break;
      }
    }

    if (!dateText) {
      continue;
    }

    const clean = dateText.replace("*", "");
    const parts = clean.split("-");

    const decisionDay =
      Number(parts.length === 2 ? parts[1] : parts[0]);

    if (
      !Number.isInteger(decisionDay) ||
      decisionDay < 1 ||
      decisionDay > 31
    ) {
      fail(`Invalid FOMC date parsed for ${monthName}: ${dateText}`);
    }

    const month = MONTHS[monthName];

    const date =
      `2026-${String(month).padStart(2, "0")}-${String(decisionDay).padStart(2, "0")}`;

    meetings.push({
      id: `FOMC-${date}`,
      date,
      timeET: "14:00",
      source: "FED",
      event: "FOMC Decision",
      severity: "HIGH"
    });
  }

  if (meetings.length !== 8) {
    fail(
      `Expected 8 scheduled 2026 FOMC meetings, parsed ${meetings.length}.`
    );
  }

  const uniqueDates = new Set(meetings.map(x => x.date));

  if (uniqueDates.size !== meetings.length) {
    fail("Duplicate FOMC meeting dates detected.");
  }

  console.log("FED PARSER : PASS");
  console.log("2026 meetings :", meetings.length);
  console.log("");

  console.table(meetings);
}
catch (error) {
  fail(error.message);
}
