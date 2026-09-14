import { collectFedEvents } from "./fed.js";

try {
  const events = await collectFedEvents();

  console.log("FED IMPORT TEST : PASS");
  console.log("Imported events :", events.length);
  console.log("First event     :", events[0].id);
  console.log("Last event      :", events[events.length - 1].id);
}
catch (error) {
  console.error("FED IMPORT TEST : FAILED");
  console.error(error.message);
  process.exit(1);
}
