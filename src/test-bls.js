const urls = [
  "https://www.bls.gov/schedule/2026/09_sched_list.htm",
  "https://www.bls.gov/schedule/news_release/bls.ics"
];

for (const url of urls) {
  console.log("");
  console.log("Testing:", url);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "NEXUS-Macro-Calendar/1.0"
      }
    });

    const body = await response.text();

    console.log("HTTP STATUS   :", response.status);
    console.log("RESPONSE SIZE:", body.length);
    console.log(
      "CONTENT CHECK :",
      body.includes("Bureau of Labor Statistics") ||
      body.includes("BEGIN:VCALENDAR")
    );

    if (response.ok) {
      console.log("BLS CONNECTION: PASS");
    } else {
      console.log("BLS CONNECTION: BLOCKED");
    }
  }
  catch (error) {
    console.log("BLS CONNECTION: FAILED");
    console.log("ERROR:", error.message);
  }
}
