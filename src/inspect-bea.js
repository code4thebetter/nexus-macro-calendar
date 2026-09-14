const url = "https://www.bea.gov/news/schedule";

const response = await fetch(url, {
  headers: {
    "User-Agent": "NEXUS-Macro-Calendar/1.0"
  }
});

if (!response.ok) {
  console.error("BEA INSPECT : FAILED");
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

const interesting = text.filter((line, i) => {
  const context = text.slice(
    Math.max(0, i - 3),
    Math.min(text.length, i + 4)
  ).join(" ");

  return (
    /GDP|Personal Income and Outlays/i.test(line) &&
    /2026|September|October|November|December|Sep|Oct|Nov|Dec/i.test(context)
  );
});

console.log("BEA STRUCTURE INSPECT : PASS");
console.log("Matching lines:", interesting.length);
console.log("");

console.log(
  interesting.slice(0, 30).join("\n")
);
