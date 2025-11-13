# Morning Report - Daily AI News Briefing

## Overview
Morning Report is a web application that provides a personalized daily audio news briefing. Each morning, it automatically scrapes news from trusted sources across various topics, synthesizes a ~1000 word report using OpenAI GPT-4o, converts it to natural-sounding speech, and presents it through a clean, audio-first web interface. The report includes a brief "On This Day in History" segment and avoids repeating previous content. The front end features a prominent play button, scrollable text, and a branded image, all within a gradient background.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React with TypeScript, Vite, Wouter for routing, TanStack Query for state management, and Tailwind CSS with shadcn/ui components. It prioritizes an audio-first, responsive design with distinct layouts for landscape and portrait orientations, featuring a warm morning aesthetic. Key components include:
-   **AudioPlayer:** Handles multi-segment audio playback with seamless transitions. Intro music plays only at start (with fade-in) and as outro after final segment (with fade-out). Segments transition automatically without intro music between them to ensure continuous playback. Supports play/pause, progress slider with cross-segment seeking, and 1.1x playback speed.
-   **ReportDisplay:** Scrollable text display of the news report content.

### Backend
The backend is built with Node.js and Express in TypeScript, using in-memory storage with an interface for future database migration.

**Core Services:**
-   **News Scraping Service:** Gathers news from 13 curated topics with tiered freshness windows (24h for breaking, 96h for tech/science). Uses a **3-phase intelligent coverage system**: Phase 1 (parallel scrape from Brave/NewsAPI/Currents/MediaStack), Phase 2 (sequential retry with simplified fallback queries for failed topics), Phase 3 (targeted Brave general search with 7-day window for topics with 0 coverage in last 5 reports, limited to 3/run for API quota protection). Achieves 92% topic coverage (12/13 topics) with robust error handling, freshness validation, and quality filtering. OpenAI GPT-4o analyzes results to select notable stories.
-   **OpenAI Integration:** Generates reports using GPT-4o with **multi-layered anti-hallucination safeguards** and **wire-service style factual reporting**:
    -   **Layer 1 - Preprocessing Filter:** `isGenericPortalArticle()` removes generic homepage/portal articles (e.g., "NBA News, Scores & Analysis | Sports Illustrated") before GPT sees them. Detects articles with 2+ generic keywords (news/scores/coverage/analysis), pipe separators, or portal URLs. Prevents GPT from attempting to fabricate details to fill content gaps.
    -   **Layer 2 - Strict Prompt Policy:** Explicit instructions to NEVER fabricate facts, only use information explicitly stated in source articles, and skip topics entirely if source data is insufficient. "A 500-word accurate report beats a 2000-word fabricated one."
    -   **Layer 3 - Flexible Word Count:** Target 1800-2000 words, flexible minimum 700 words. Accuracy always trumps length - shorter reports are accepted when sources are limited rather than forcing hallucinations.
    -   **Story Selection:** Prioritizes the MOST IMPORTANT/BREAKING story for each topic - major product launches (e.g., new LLM releases) over minor updates, breaking announcements over ongoing developments.
    -   **Reporting Style:** Wire-service factual reporting with NO source citations or attribution phrases. NO editorialization, analysis, or speculation - only facts (names, numbers, dates, events).
    -   Leverages context from previous 5 reports to prevent repetition and ensure balanced topic coverage. Handles sensitive content professionally. Splits text into chunks for multi-segment audio generation via OpenAI's TTS API (Onyx voice, tts-1-hd model, 1.0x speed).
-   **Report Generator:** Orchestrates the entire pipeline: scrape, filter portals, analyze previous reports, generate text with anti-hallucination safeguards, convert to audio, and save. Logs filtering actions for debugging (e.g., "Filtered from 13 to 11 topics after removing generic portals").
-   **Scheduler:** Uses cron to generate daily reports at 5:30 AM Pacific Time, with timezone awareness. It also auto-generates an initial report on startup if needed.

**API Endpoints:**
-   `GET /api/reports/latest`: Retrieves the most recent report.
-   `GET /api/reports/recent?limit=N`: Retrieves N most recent reports.
-   Static file serving for `/audio` directory.

### Data Storage
Implements a flexible storage architecture with environment-driven selection via `STORAGE_MODE` environment variable:

**Storage Modes:**
-   **PostgreSQL (DbStorage)** - Production default. Uses Neon Serverless PostgreSQL for persistent storage across deployments. Implements full CRUD operations via Drizzle ORM.
-   **File-based (FileStorage)** - Development fallback. Persists reports to `/data/reports.json` with automatic load/save. Not recommended for production (ephemeral storage).
-   **In-memory (MemStorage)** - Testing only. Volatile storage, cleared on restart.

**Schema:** Uses Drizzle ORM with PostgreSQL-compatible schema including `users` and `reports` tables (with `audioPath` and `audioPaths` fields for single/multi-segment audio).

**Storage Mode Validation:** The scheduler validates that audio storage mode (local filesystem paths vs. cloud URLs) matches the environment before generating reports, preventing production playback failures caused by dev/prod database sharing.

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

**Database:**
-   Neon Serverless PostgreSQL for persistent report storage in production. (Requires `DATABASE_URL`)
-   Accessed via Drizzle ORM through `DbStorage` class when `STORAGE_MODE=postgres`

**File Storage:**
-   Local filesystem for audio files in `/audio-reports`, served statically.
-   Google Cloud Storage is a potential future migration target.

**Session Management:**
-   `connect-pg-simple` for PostgreSQL-based session storage (when the database is active).

**Development Tools:**
-   Replit-specific plugins and Vite HMR.

**Production Configuration:**
-   Requires `NODE_ENV=production`, `STORAGE_MODE=postgres`, all API keys, and a `SESSION_SECRET`.
-   Persists reports to PostgreSQL database and audio files to Google Cloud Storage (cloud URLs).
-   Development-only endpoints are locked in production for security.
-   Storage mode validation prevents audio path mismatches between dev/prod environments.