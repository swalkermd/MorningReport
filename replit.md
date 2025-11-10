# Morning Report - Daily AI News Briefing

## Overview
Morning Report is a web application that provides a personalized daily audio news briefing. Each morning, it automatically scrapes news from trusted sources across various topics, synthesizes a ~1000 word report using OpenAI GPT-4o, converts it to natural-sounding speech, and presents it through a clean, audio-first web interface. The report includes a brief "On This Day in History" segment and avoids repeating previous content. The front end features a prominent play button, scrollable text, and a branded image, all within a gradient background.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React with TypeScript, Vite, Wouter for routing, TanStack Query for state management, and Tailwind CSS with shadcn/ui components. It prioritizes an audio-first, responsive design with distinct layouts for landscape and portrait orientations, featuring a warm morning aesthetic. Key components include a custom `AudioPlayer` for multi-segment playback with intro music fade-in/out, and a `ReportDisplay` for the scrollable text report.

### Backend
The backend is built with Node.js and Express in TypeScript, using in-memory storage with an interface for future database migration.

**Core Services:**
-   **News Scraping Service:** Gathers news from 13 curated topics with tiered freshness windows (24h for breaking, 96h for tech/science). It uses a multi-source intelligent three-tier fallback (Brave Search, NewsAPI, CurrentsAPI) with robust error handling, freshness validation, and quality filtering. OpenAI GPT-4o analyzes results to select notable stories.
-   **OpenAI Integration:** Generates reports using GPT-4o, leveraging context from the previous 5 reports to prevent repetition and ensure balanced topic coverage across a 5-report cycle. It aims for 1500-2000 words per report, handles sensitive content professionally, and splits text into chunks for multi-segment audio generation via OpenAI's TTS API (nova voice, tts-1-hd model, 1.1x speed).
-   **Report Generator:** Orchestrates the entire pipeline: scrape, analyze previous reports, generate text, convert to audio, and save.
-   **Scheduler:** Uses cron to generate daily reports at 5:30 AM Pacific Time, with timezone awareness. It also auto-generates an initial report on startup if needed.

**API Endpoints:**
-   `GET /api/reports/latest`: Retrieves the most recent report.
-   `GET /api/reports/recent?limit=N`: Retrieves N most recent reports.
-   Static file serving for `/audio` directory.

### Data Storage
Currently uses in-memory storage for users and reports, implementing an `IStorage` interface for future migration. Schema is defined using Drizzle ORM for PostgreSQL compatibility, including `users` and `reports` tables (with `audioPath` and `audioPaths` fields).

## External Dependencies

**AI & Language Services:**
-   **OpenAI API:** For GPT-4o text generation and TTS audio synthesis. (Requires `OPENAI_API_KEY`)

**News Data Sources:**
-   **Parallel sampling strategy with 4-source intelligent merging:**
    -   **Primary:** Brave Search API, NewsAPI.
    -   **Backup:** CurrentsAPI, MediaStack API (sampled within rate limits).
    -   Merges results with deduplication, sorts by recency, and limits to top 4 articles per topic.
    -   Includes rate limiting, budget management, and usage tracking for each service.
-   Requires `BRAVE_SEARCH_API_KEY`, `NEWSAPI_KEY`, `CURRENTS_API_KEY`, and `MEDIASTACK_API_KEY`.

**News Caching System:**
-   Stores date-based JSON files in `/cache/` for development efficiency and backup.
-   **Automatic scheduled reports (5:30 AM PST) ALWAYS use fresh API calls** (`forceRefresh=true`), never cached data.
-   Cache is automatically saved after successful fresh scrapes for reference.
-   Manual regeneration via API endpoint supports optional `forceRefresh` parameter (defaults to using cache).
-   Validates cache for minimum topic coverage (at least 5 topics) before using.

**Database (Future):**
-   Neon Serverless PostgreSQL is configured for a future migration path. (Requires `DATABASE_URL`)

**File Storage:**
-   Local filesystem for audio files in `/audio-reports`, served statically.
-   Google Cloud Storage is a potential future migration target.

**Session Management:**
-   `connect-pg-simple` for PostgreSQL-based session storage (when the database is active).

**Development Tools:**
-   Replit-specific plugins and Vite HMR.

**Production Configuration:**
-   Requires `NODE_ENV=production` and all API keys and a `SESSION_SECRET`.
-   Persists reports to `/data/reports.json` and audio files to `/audio-reports/` with 30-day retention.
-   Development-only endpoints are locked in production for security.