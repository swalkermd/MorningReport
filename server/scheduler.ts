import cron from "node-cron";
import { generateDailyReport } from "./reportGenerator";
import { storage } from "./storage";

export function startScheduler() {
  // Schedule daily report generation at 5:30 AM Pacific Time
  // Cron format: minute hour day month weekday
  // When using timezone option, specify time in LOCAL time zone (not UTC)
  // node-cron automatically handles PST/PDT transitions
  
  const cronExpression = "30 5 * * *"; // 5:30 AM Pacific Time
  
  cron.schedule(cronExpression, async () => {
    const now = new Date();
    const pstTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    console.log(`[${now.toISOString()}] [PST: ${pstTime.toLocaleString()}] Starting scheduled daily report generation...`);
    
    try {
      await generateDailyReport(true); // Always use fresh API calls for scheduled reports
      console.log(`[${now.toISOString()}] Daily report generated successfully`);
    } catch (error) {
      console.error(`[${now.toISOString()}] Error generating daily report:`, error);
    }
  }, {
    timezone: "America/Los_Angeles"
  });
  
  console.log("Report scheduler started - will generate reports daily at 5:30 AM PST");
  
  // Also generate a report on startup if there isn't one for today (for testing)
  setTimeout(async () => {
    console.log("Checking if we need to generate an initial report...");
    const latestReport = await storage.getLatestReport();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (!latestReport || new Date(latestReport.date) < today) {
      console.log("No report for today found. Generating initial report...");
      try {
        await generateDailyReport(true); // Always use fresh API calls for automatic reports
        console.log("Initial report generated successfully");
      } catch (error) {
        console.error("Error generating initial report:", error);
      }
    } else {
      console.log("Report for today already exists");
    }
  }, 2000);
}
