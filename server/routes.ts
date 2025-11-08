import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import express from "express";
import path from "path";
import { startScheduler } from "./scheduler";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve audio files
  app.use("/audio", express.static(path.join(process.cwd(), "audio-reports")));

  // Get latest report
  app.get("/api/reports/latest", async (req, res) => {
    try {
      const report = await storage.getLatestReport();
      
      if (!report) {
        return res.status(404).json({ 
          error: "No report available yet. Check back at 6:00 AM PST for today's briefing." 
        });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error fetching latest report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // Get recent reports
  app.get("/api/reports/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const reports = await storage.getRecentReports(limit);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching recent reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // Start the cron scheduler for daily report generation
  startScheduler();

  const httpServer = createServer(app);

  return httpServer;
}
