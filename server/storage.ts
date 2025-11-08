import { type User, type InsertUser, type Report, type InsertReport } from "@shared/schema";
import { randomUUID } from "crypto";

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

export const storage = new MemStorage();
