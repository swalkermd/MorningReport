# Morning Report - Daily AI News Briefing

## Overview

Morning Report is a web-based application that automatically generates and delivers a personalized daily audio news briefing. Each morning at 6:00 AM PST, the system scrapes news from trusted sources across curated topics (world news, US news, Redlands CA local, NBA, AI, EVs, autonomous driving, humanoid robots, eVTOL, gadgets, anti-aging, virtual medicine, travel), uses OpenAI GPT-4o to synthesize an intelligent ~1000 word report that avoids repeating previous content, converts it to natural-sounding speech via text-to-speech (split into multiple segments to handle OpenAI's 4096 character TTS limit), and presents it through a clean, audio-first web interface featuring a prominent play button and scrollable text report alongside a framed sunrise image with gradient background (burnt orange to sky blue).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React with TypeScript for the UI layer
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management
- Tailwind CSS with custom design system based on shadcn/ui components

**Design Philosophy:**
- Audio-first experience with no scrolling on the main viewport (h-screen constraint)
- Responsive dual-layout approach: separate optimized layouts for landscape and portrait orientations
- Landscape: 45% sunrise image left panel, 55% controls/report right panel
- Portrait: vertically stacked sections with defined height percentages
- Warm morning aesthetic using custom color palette with neutral base tones

**Component Structure:**
- `AudioPlayer`: Custom audio player with intro music fade-in/out, multi-segment playback, memoized dependencies
  - Uses `useMemo` for audioSegments array to prevent effect re-triggering
  - Stable audio references via `loadedAudioPathRef` prevent playback restarts during re-renders
  - Automatically advances through multiple audio segments seamlessly
  - Intro music fades in/out between segments
- `ReportDisplay`: Scrollable text report container with copy-to-clipboard functionality
- Extensive shadcn/ui component library for consistent UI primitives
- Path aliases configured (@/ for client/src, @shared for shared types, @assets for static assets)

### Backend Architecture

**Technology Stack:**
- Node.js with Express as the HTTP server
- TypeScript for type safety across the stack
- In-memory storage implementation (MemStorage class) with interface-based design for future database migration

**Core Services:**

1. **News Scraping Service** (`newsService.ts`):
   - Defines 13 curated news topics (world news, US news, local CA news, NBA, AI/ML, EVs, autonomous driving, humanoid robots, eVTOL, tech gadgets, anti-aging, telemedicine, travel)
   - Maintains list of trusted news sources (Reuters, AP, BBC, NYT, WSJ, etc.)
   - Simulated scraping function designed for replacement with real web scraping (Puppeteer/Cheerio) or news APIs

2. **OpenAI Integration** (`openai.ts`):
   - Report generation using GPT-4o with context from previous 5 reports to avoid repetition
   - Target ~1000 word length for comprehensive coverage
   - **Multi-segment audio generation**: Intelligently splits text into chunks <4096 characters (OpenAI TTS limit)
     - Splits at paragraph boundaries when possible
     - Falls back to sentence-level splitting for long paragraphs
     - Uses character-level hard split as final fallback to guarantee all segments stay under limit
     - Filters empty paragraphs/sentences
   - **Atomic file creation**: Writes to temporary files, renames on success, cleans up all files on error
   - Text-to-speech conversion using OpenAI's TTS API (nova voice, tts-1-hd model)
   - Natural, conversational tone optimized for audio delivery

3. **Report Generator** (`reportGenerator.ts`):
   - Orchestrates the full pipeline: scrape → analyze previous reports → generate text → convert to audio → save
   - Saves reports with metadata (date, content, audio path) to storage

4. **Scheduler** (`scheduler.ts`):
   - Cron-based scheduling for 6:00 AM PST daily report generation
   - Timezone-aware using America/Los_Angeles
   - Auto-generates initial report on startup if none exists for today

**API Endpoints:**
- `GET /api/reports/latest` - Retrieves most recent report with audio path
- `GET /api/reports/recent?limit=N` - Retrieves N most recent reports for context
- Static file serving for `/audio` directory containing generated MP3 files

### Data Storage Solutions

**Current Implementation:**
- In-memory storage using JavaScript Maps for users and reports
- Storage interface (IStorage) defines contract for future implementations
- No external database dependency in current architecture

**Schema Design** (defined in `shared/schema.ts` with Drizzle ORM):
- **users table**: id (UUID), username (unique), password
- **reports table**: id (UUID), date (timestamp), content (text), audioPath (text), audioPaths (text array), generatedAt (timestamp with default now)
  - `audioPath`: Single audio file path (backward compatibility)
  - `audioPaths`: Array of audio file paths for multi-segment reports
- Drizzle configuration present for PostgreSQL migration path via Neon serverless driver
- Zod schemas for runtime validation of insert operations

**Migration Strategy:**
- Drizzle Kit configured to support easy migration to PostgreSQL
- Schema already defined for database integration when needed
- Current MemStorage can be swapped with DatabaseStorage implementing same IStorage interface

### External Dependencies

**AI & Language Services:**
- OpenAI API for GPT-4o text generation and TTS audio synthesis
- Requires OPENAI_API_KEY environment variable

**News Data Sources:**
- Designed to integrate with news scraping (currently simulated)
- Target sources: Reuters, AP News, BBC, New York Times, WSJ, The Guardian, CNBC, Bloomberg, TechCrunch, Wired, Ars Technica, Nature, ScienceDaily, NBA.com, ESPN
- Future implementation could use NewsAPI, Google News API, or custom web scraping with Puppeteer

**Database (Future):**
- Neon Serverless PostgreSQL (configured but not yet active)
- Requires DATABASE_URL environment variable when activated
- Connection pooling via @neondatabase/serverless driver

**File Storage:**
- Local filesystem for audio file storage in `/audio-reports` directory
- Served as static files via Express
- Could be migrated to Google Cloud Storage (dependency already present: @google-cloud/storage)

**Session Management:**
- connect-pg-simple for PostgreSQL-based session storage (when database is activated)

**Development Tools:**
- Replit-specific plugins for development banner, error overlay, and cartographer (source mapping)
- Vite HMR for fast development feedback

**Production Considerations:**
- Audio files stored locally; consider cloud storage (GCS/S3) for scalability
- In-memory storage will lose data on restart; activate PostgreSQL for persistence
- Cron scheduler runs in-process; consider external scheduler (GitHub Actions, Cloud Scheduler) for reliability
- OpenAI API rate limits and costs should be monitored for daily generation