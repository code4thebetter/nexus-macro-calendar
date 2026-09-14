const url = "https://www.bea.gov/news/schedule";

const response = await fetch(url, {
  headers: {
    "User-Agent": "NEXUS-Macro-Calendar/1.0"
  }
});

if (!response.ok) {
  console.error("BEA CONTEXT INSPECT : FAILED");
  console.error("HTTP", response.status);
  process.exit(1);
}

const html = await response.text();

const text = html
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

console.log("BEA CONTEXT INSPECT : PASS");
console.log("");

for (let i = 0; i < text.length; i++) {
  if (
    /GDP \(|Personal Income and Outlays/i.test(text[i])
  ) {
    console.log("========================================");

    const start = Math.max(0, i - 5);
    const end = Math.min(text.length, i + 6);

    for (let j = start; j < end; j++) {
      const marker = j === i ? ">>" : "  ";
      console.log(
        `${marker} [${j}] ${text[j]}`
      );
    }

    console.log("");
  }
}
