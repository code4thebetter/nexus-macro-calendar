const url =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

try {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  console.log("FED HTTP STATUS :", response.status);

  const html = await response.text();

  console.log("FED RESPONSE SIZE :", html.length);
  console.log(
    "2026 CALENDAR FOUND :",
    html.includes("2026 FOMC Meetings")
  );

  if (!response.ok) {
    throw new Error(`Federal Reserve returned HTTP ${response.status}`);
  }

  if (!html.includes("2026 FOMC Meetings")) {
    throw new Error("Expected 2026 FOMC calendar was not found.");
  }

  console.log("FED CONNECTION TEST : PASS");
}
catch (error) {
  console.error("FED CONNECTION TEST : FAILED");
  console.error(error.message);
  process.exit(1);
}
