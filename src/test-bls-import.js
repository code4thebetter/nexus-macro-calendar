import { collectBlsEvents } from "./bls.js";

try {
  const result = await collectBlsEvents();

  console.log("BLS IMPORT TEST : PASS");
  console.log("Raw events      :", result.rawCount);
  console.log("Imported events :", result.events.length);
  console.log("First event     :", result.events[0].id);
  console.log(
    "Last event      :",
    result.events[result.events.length - 1].id
  );
}
catch (error) {
  console.error("BLS IMPORT TEST : FAILED");
  console.error(error.message);
  process.exit(1);
}
