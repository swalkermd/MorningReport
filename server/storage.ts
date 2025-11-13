import { type User, type InsertUser, type Report, type InsertReport, users, reports } from "@shared/schema";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

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
    
    // Sort by actual generation timestamp, not scheduled date
    return reports.sort(
      (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
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
    
    // Sort by actual generation timestamp, not scheduled date
    return reports.sort(
      (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
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

/**
 * PostgreSQL database storage implementation using Drizzle ORM
 * Provides persistent storage across deployments
 */
export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const result = await db.insert(reports).values(insertReport).returning();
    return result[0];
  }

  async getLatestReport(): Promise<Report | undefined> {
    const result = await db
      .select()
      .from(reports)
      .orderBy(desc(reports.generatedAt))
      .limit(1);
    return result[0];
  }

  async getRecentReports(limit: number): Promise<Report[]> {
    return await db
      .select()
      .from(reports)
      .orderBy(desc(reports.date))
      .limit(limit);
  }

  async getReportById(id: string): Promise<Report | undefined> {
    const result = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return result[0];
  }
}

/**
 * Environment-driven storage selector
 * - postgres: Use PostgreSQL (production, persistent across deployments)
 * - file: Use file-based storage (development, legacy)
 * - memory: Use in-memory storage (testing, ephemeral)
 */
function createStorage(): IStorage {
  const storageMode = process.env.STORAGE_MODE || "file";
  
  switch (storageMode) {
    case "postgres":
      console.log("[Storage] Using PostgreSQL (DbStorage)");
      return new DbStorage();
    case "file":
      console.log("[Storage] Using file-based storage (FileStorage)");
      return new FileStorage();
    case "memory":
      console.log("[Storage] Using in-memory storage (MemStorage)");
      return new MemStorage();
    default:
      console.warn(`[Storage] Unknown STORAGE_MODE: ${storageMode}, defaulting to file`);
      return new FileStorage();
  }
}

export const storage = createStorage();
