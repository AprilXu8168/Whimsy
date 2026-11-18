console.log("[1/2] Scanning statements and refreshing spending_log.csv.");
await import("./categorize-spends.js");

console.log("[2/2] Starting the dashboard with the refreshed statements.");
await import("./dashboard.js");
