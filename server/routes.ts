import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import express from "express";
import path from "path";
import { startScheduler } from "./scheduler";
import { clearNewsCache, scrapeAllNews } from "./newsService";
import { generateDailyReport } from "./reportGenerator";
import { promises as fs } from "fs";

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

  // Development-only endpoints
  // These endpoints are restricted to development mode to prevent abuse in production
  
  // Middleware to restrict to development mode
  const devOnly = (req: any, res: any, next: any) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ 
        error: "This endpoint is only available in development mode" 
      });
    }
    next();
  };

  // Test endpoint to create a sample report (development only)
  app.post("/api/reports/test", devOnly, async (req, res) => {
    try {
      const testReport = {
        id: crypto.randomUUID(),
        date: new Date(),
        content: `Here's your morning report for Friday, November 8th, 2025.

**World News**

The United Nations announced a new climate initiative at their headquarters in New York this week, with 47 countries committing to reduce carbon emissions by 40% by 2030.

**US News**

The Federal Reserve held interest rates steady at 5.25% during their November meeting, citing stable inflation data at 2.4% for October.

**Technology**

Apple unveiled the new MacBook Pro featuring the M4 chip, which delivers 30% faster performance than the previous generation. The device launches next month starting at $1,999.

**NBA**

The Los Angeles Lakers defeated the Boston Celtics 118-114 last night, with LeBron James scoring 32 points and 11 assists at Crypto.com Arena.

That's it for the morning report. Have a great day!`,
        audioPath: '/audio/report-1762620802075.mp3',
        audioPaths: ['/audio/report-1762620802075.mp3'],
        generatedAt: new Date()
      };
      
      await storage.createReport(testReport);
      res.json({ success: true, report: testReport });
    } catch (error) {
      console.error("Error creating test report:", error);
      res.status(500).json({ error: "Failed to create test report" });
    }
  });
  
  // Clear news cache
  app.post("/api/cache/clear", devOnly, async (req, res) => {
    try {
      await clearNewsCache();
      res.json({ success: true, message: "Cache cleared successfully" });
    } catch (error) {
      console.error("Error clearing cache:", error);
      res.status(500).json({ error: "Failed to clear cache" });
    }
  });
  
  // Get cache status
  app.get("/api/cache/status", devOnly, async (req, res) => {
    try {
      const cacheDir = path.join(process.cwd(), "cache");
      const dateStr = new Date().toISOString().split('T')[0];
      const cacheFile = path.join(cacheDir, `news-${dateStr}.json`);
      
      try {
        const stats = await fs.stat(cacheFile);
        const data = await fs.readFile(cacheFile, 'utf-8');
        const cached = JSON.parse(data);
        
        res.json({
          exists: true,
          file: cacheFile,
          size: stats.size,
          topics: cached.length,
          created: stats.mtime,
        });
      } catch {
        res.json({ exists: false, file: cacheFile });
      }
    } catch (error) {
      console.error("Error checking cache status:", error);
      res.status(500).json({ error: "Failed to check cache status" });
    }
  });
  
  // Force regenerate report with fresh news data
  app.post("/api/reports/regenerate", devOnly, async (req, res) => {
    try {
      const forceRefresh = req.query.forceRefresh === 'true';
      
      console.log(`[API] Regenerating report (forceRefresh: ${forceRefresh})...`);
      
      // Clear existing report for today if regenerating
      const today = new Date();
      today.setHours(6, 0, 0, 0);
      
      if (forceRefresh) {
        await clearNewsCache();
      }
      
      await generateDailyReport();
      
      res.json({ 
        success: true, 
        message: "Report regenerated successfully",
        forceRefresh 
      });
    } catch (error) {
      console.error("Error regenerating report:", error);
      res.status(500).json({ error: "Failed to regenerate report" });
    }
  });

  // Start the cron scheduler for daily report generation
  startScheduler();

  const httpServer = createServer(app);

  return httpServer;
}
