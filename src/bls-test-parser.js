const BLS_ICS =
  "https://www.bls.gov/schedule/news_release/bls.ics";

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseEvents(text) {
  const unfolded = unfoldIcs(text);

  const blocks = unfolded.match(
    /BEGIN:VEVENT[\s\S]*?END:VEVENT/g
  ) ?? [];

  return blocks.map(block => {
    const get = name => {
      const m = block.match(
        new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "m")
      );
      return m ? m[1].trim() : null;
    };

    return {
      dtstart: get("DTSTART"),
      summary: get("SUMMARY"),
      description: get("DESCRIPTION")
    };
  });
}

try {
  const response = await fetch(BLS_ICS, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const ics = await response.text();
  const events = parseEvents(ics);

  console.log("BLS ICS PARSER : PASS");
  console.log("Total events   :", events.length);
  console.log("");

  const sep2026 = events.filter(e =>
    e.dtstart?.startsWith("202609")
  );

  console.log("September 2026 events:", sep2026.length);
  console.log("");

  console.table(
    sep2026.map(e => ({
      dtstart: e.dtstart,
      summary: e.summary
    }))
  );
}
catch (error) {
  console.error("BLS ICS PARSER : FAILED");
  console.error(error.message);
  process.exit(1);
}
