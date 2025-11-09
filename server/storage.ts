import { type User, type InsertUser, type Report, type InsertReport } from "@shared/schema";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createReport(report: InsertReport): Promise<Report>;
  getLatestReport(): Promise<Report | undefined>;
  getRecentReports(limit: number): Promise<Report[]>;
  getReportById(id: string): Promise<Report | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private reports: Map<string, Report>;

  constructor() {
    this.users = new Map();
    this.reports = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const id = randomUUID();
    const report: Report = {
      date: insertReport.date,
      content: insertReport.content,
      audioPath: insertReport.audioPath ?? null,
      audioPaths: insertReport.audioPaths ?? null,
      id,
      generatedAt: new Date(),
    };
    this.reports.set(id, report);
    return report;
  }

  async getLatestReport(): Promise<Report | undefined> {
    const reports = Array.from(this.reports.values());
    if (reports.length === 0) return undefined;
    
    return reports.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];
  }

  async getRecentReports(limit: number): Promise<Report[]> {
    const reports = Array.from(this.reports.values());
    return reports
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  async getReportById(id: string): Promise<Report | undefined> {
    return this.reports.get(id);
  }
}

/**
 * File-based persistent storage implementation
 * Saves reports to disk for production reliability
 */
export class FileStorage implements IStorage {
  private users: Map<string, User>;
  private reports: Map<string, Report>;
  private reportsFilePath: string;
  private isInitialized: boolean = false;

  constructor(dataDir: string = path.join(process.cwd(), "data")) {
    this.users = new Map();
    this.reports = new Map();
    this.reportsFilePath = path.join(dataDir, "reports.json");
  }

  private async ensureDataDir(): Promise<void> {
    const dataDir = path.dirname(this.reportsFilePath);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      console.error("Error creating data directory:", error);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.ensureDataDir();
    
    try {
      const data = await fs.readFile(this.reportsFilePath, "utf-8");
      const reports: Report[] = JSON.parse(data);
      
      for (const report of reports) {
        this.reports.set(report.id, report);
      }
      
      console.log(`[FileStorage] Loaded ${reports.length} reports from disk`);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log("[FileStorage] No existing reports file found, starting fresh");
      } else {
        console.error("[FileStorage] Error loading reports:", error);
      }
    }
    
    this.isInitialized = true;
  }

  private async saveReports(): Promise<void> {
    try {
      const reports = Array.from(this.reports.values());
      await fs.writeFile(
        this.reportsFilePath,
        JSON.stringify(reports, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("[FileStorage] Error saving reports:", error);
      throw error;
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    await this.initialize();
    
    const id = randomUUID();
    const report: Report = {
      date: insertReport.date,
      content: insertReport.content,
      audioPath: insertReport.audioPath ?? null,
      audioPaths: insertReport.audioPaths ?? null,
      id,
      generatedAt: new Date(),
    };
    
    this.reports.set(id, report);
    await this.saveReports();
    
    return report;
  }

  async getLatestReport(): Promise<Report | undefined> {
    await this.initialize();
    
    const reports = Array.from(this.reports.values());
    if (reports.length === 0) return undefined;
    
    return reports.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];
  }

  async getRecentReports(limit: number): Promise<Report[]> {
    await this.initialize();
    
    const reports = Array.from(this.reports.values());
    return reports
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  async getReportById(id: string): Promise<Report | undefined> {
    await this.initialize();
    return this.reports.get(id);
  }
}

// Use FileStorage in production for persistence
export const storage = new FileStorage();
