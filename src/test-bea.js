const url = "https://www.bea.gov/news/schedule";

try {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "NEXUS-Macro-Calendar/1.0"
    }
  });

  const html = await response.text();

  console.log("BEA HTTP STATUS    :", response.status);
  console.log("BEA RESPONSE SIZE  :", html.length);
  console.log(
    "GDP FOUND          :",
    html.includes("GDP")
  );
  console.log(
    "PERSONAL OUTLAYS   :",
    html.includes("Personal Income and Outlays")
  );

  if (!response.ok) {
    throw new Error(`BEA returned HTTP ${response.status}`);
  }

  if (
    !html.includes("GDP") ||
    !html.includes("Personal Income and Outlays")
  ) {
    throw new Error("Expected BEA releases were not found.");
  }

  console.log("BEA CONNECTION TEST : PASS");
}
catch (error) {
  console.error("BEA CONNECTION TEST : FAILED");
  console.error(error.message);
  process.exit(1);
}
