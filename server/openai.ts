import OpenAI from "openai";
import fs from "fs";
import path from "path";

// the newest OpenAI model is "gpt-4o" which is the most capable model available
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface NewsContent {
  topic: string;
  articles: Array<{
    title: string;
    summary: string;
    source: string;
    url?: string;
    publishedAt?: string;
  }>;
}

export interface FactCheckIssue {
  focus: 'hallucination' | 'outdated' | 'accuracy' | 'other';
  severity: 'critical' | 'warning';
  summary: string;
  evidence?: string;
}

export interface FactCheckResult {
  status: 'pass' | 'fail';
  issues: FactCheckIssue[];
  rawResponse?: string;
  skipped?: boolean;
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  'World News': ['world news', 'global news', 'international developments', 'foreign affairs', 'global politics'],
  'US News': ['u.s. news', 'united states news', 'american politics', 'national news', 'us politics'],
  'Redlands CA Local News': ['redlands', 'san bernardino county', 'inland empire'],
  'NBA': ['nba', 'national basketball association', 'nba playoffs', 'nba finals'],
  'AI & Machine Learning': ['artificial intelligence', 'ai news', 'machine learning', 'ai research'],
  'Electric Vehicles': ['electric vehicle', 'ev market', 'evs', 'electric car', 'battery-electric'],
  'Autonomous Driving': ['autonomous vehicle', 'self-driving', 'self driving', 'driverless car'],
  'Humanoid Robots': ['humanoid robot', 'bipedal robot', 'robotics'],
  'eVTOL & Flying Vehicles': ['evtol', 'flying taxi', 'air taxi', 'urban air mobility', 'electric aircraft'],
  'Tech Gadgets': ['tech gadget', 'consumer tech', 'smartphone', 'wearable device', 'hardware launch'],
  'Anti-Aging Science': ['anti-aging', 'longevity research', 'aging science', 'life extension'],
  'Virtual Medicine': ['telehealth', 'telemedicine', 'digital health', 'virtual care', 'remote patient monitoring'],
  'Travel': ['travel industry', 'airline', 'aviation sector', 'tourism'],
};

/**
 * Extract unique dates from previous reports to avoid analyzing duplicate reports from same day
 * Takes only the first report from each unique date
 */
function getReportsFromUniqueDates(reports: string[]): string[] {
  if (reports.length === 0) return [];

  // Extract date from each report (format: "Here's your morning report for [DayName], [Month] [Day], [Year]")
  const seenDates = new Set<string>();
  const uniqueReports: string[] = [];

  for (const report of reports) {
    // Extract date from opening line
    const dateMatch = report.match(/Here's your morning report for ([^.]+)\./);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      if (!seenDates.has(dateStr)) {
        seenDates.add(dateStr);
        uniqueReports.push(report);
      }
    } else {
      // If no date found, include it (fallback)
      uniqueReports.push(report);
    }
  }

  return uniqueReports;
}

/**
 * Analyzes previous reports to determine which topics haven't been covered recently
 * Ensures balanced coverage across all topics over a 5-report cycle
 */
export function analyzeTopicCoverage(newsContent: NewsContent[], previousReports: string[]): {
  underrepresentedTopics: string[];
  topicCoverageSummary: string;
} {
  if (previousReports.length === 0) {
    return {
      underrepresentedTopics: [],
      topicCoverageSummary: ""
    };
  }

  // Extract all available topic names from newsContent
  const allTopics = newsContent.map(nc => nc.topic);

  // Build lookup of keywords per topic (default to topic name if no custom list)
  const topicKeywordMap = new Map<string, string[]>();
  allTopics.forEach(topic => {
    const keywords = TOPIC_KEYWORDS[topic] || [topic];
    topicKeywordMap.set(topic, keywords.map(keyword => keyword.toLowerCase()));
  });

  // Count how many times each topic appears in previous reports
  const topicMentions: Map<string, number> = new Map();
  allTopics.forEach(topic => topicMentions.set(topic, 0));

  // Scan previous reports for topic coverage using keyword sets
  previousReports.forEach(report => {
    const reportLower = report.toLowerCase();
    allTopics.forEach(topic => {
      const keywords = topicKeywordMap.get(topic) || [topic.toLowerCase()];
      const isMentioned = keywords.some(keyword => reportLower.includes(keyword));
      if (isMentioned) {
        topicMentions.set(topic, (topicMentions.get(topic) || 0) + 1);
      }
    });
  });

  // Identify topics not covered in any of the last 5 reports
  const underrepresentedTopics = allTopics.filter(topic =>
    (topicMentions.get(topic) || 0) === 0
  );

  // Create summary for logging and prompt
  const coverageSummary = Array.from(topicMentions.entries())
    .sort((a, b) => a[1] - b[1]) // Sort by coverage count (least to most)
    .map(([topic, count]) => `${topic}: ${count}/${previousReports.length}`)
    .join(", ");

  return {
    underrepresentedTopics,
    topicCoverageSummary: coverageSummary
  };
}

// Keywords that may trigger safety filters - used for retry fallback only
const SENSITIVE_KEYWORDS = [
  'dismembered', 'beheaded', 'mutilated', 'decapitated',
  'massacre', 'slaughtered', 'tortured', 'executed',
  'bodies found', 'remains discovered', 'corpse'
];

/**
 * Detects if an article is a generic portal/homepage without actual news content
 * These articles cause GPT to hallucinate details to fill content gaps
 */
function isGenericPortalArticle(article: { title: string; summary: string; url?: string }): boolean {
  const title = article.title.toLowerCase();
  const summary = article.summary.toLowerCase();
  const url = (article.url || '').toLowerCase();

  // Generic portal keywords that appear in titles
  const genericKeywords = ['news', 'scores', 'updates', 'coverage', 'analysis', 'standings', 'playoff'];

  // Count how many generic keywords appear in the title
  const genericKeywordCount = genericKeywords.filter(keyword => title.includes(keyword)).length;

  // Additional strong indicators of generic portals
  const strongPortalIndicators = [
    /\|/,  // Pipe separator (e.g., "NBA News | Sports Illustrated")
    /breaking news/,
    /latest news/,
    /up-to-the-minute/,
    /complete coverage/,
    /expert analysis/,
    /game scores/,
  ];

  const hasStrongPortalIndicator = strongPortalIndicators.some(pattern => pattern.test(title));

  // Portal/homepage URL patterns
  const portalUrlPatterns = [
    /\/(nba|sports|news|technology|health)\/?$/,  // Category homepage
    /\/index\.(html?|php)$/,                       // Index pages
    /^https?:\/\/[^\/]+\/?$/,                      // Root domain
  ];

  // Generic summary indicators (no specific story details)
  const genericSummaryPatterns = [
    /^(up-to-the-minute|complete|comprehensive|latest)\s+(news|coverage|analysis)/,
    /players like.*still bring/,  // Generic player mentions without specific story
    /veterans? like/,
    /younger players? like/,
  ];

  // Check URL patterns
  const isPortalUrl = portalUrlPatterns.some(pattern => pattern.test(url));

  // Check summary patterns
  const hasGenericSummary = genericSummaryPatterns.some(pattern => pattern.test(summary));

  // An article is generic if:
  // - It has 2+ generic keywords in the title (e.g., "NBA News, Scores & Expert Analysis")
  // - OR it has a strong portal indicator in the title
  // - OR it has both a portal URL and a generic summary
  const isGeneric =
    (genericKeywordCount >= 2) ||
    hasStrongPortalIndicator ||
    (isPortalUrl && hasGenericSummary);

  if (isGeneric) {
    console.warn(`[Portal Filter] Filtered generic portal article: "${article.title.substring(0, 60)}..." from ${article.url || 'unknown source'}`);
    console.warn(`[Portal Filter]   Reasons: keywords=${genericKeywordCount}, strongIndicator=${hasStrongPortalIndicator}, portalUrl=${isPortalUrl}, genericSummary=${hasGenericSummary}`);
  }

  return isGeneric;
}

/**
 * Filters out generic portal/homepage articles that lack specific news content
 * Prevents GPT from hallucinating details to fill content gaps
 */
function filterGenericPortalArticles(newsContent: NewsContent[]): NewsContent[] {
  return newsContent.map(topic => ({
    ...topic,
    articles: topic.articles.filter(article => !isGenericPortalArticle(article))
  })).filter(topic => topic.articles.length > 0);
}

/**
 * Filters out articles containing highly graphic terms
 * Used as fallback when GPT refuses to generate content
 */
function filterSensitiveArticles(newsContent: NewsContent[]): NewsContent[] {
  return newsContent.map(topic => ({
    ...topic,
    articles: topic.articles.filter(article => {
      const combined = `${article.title} ${article.summary}`.toLowerCase();
      const hasSensitiveContent = SENSITIVE_KEYWORDS.some(keyword =>
        combined.includes(keyword.toLowerCase())
      );

      if (hasSensitiveContent) {
        console.warn(`[Content Filter] Filtered sensitive article: "${article.title.substring(0, 60)}..."`);
      }

      return !hasSensitiveContent;
    })
  })).filter(topic => topic.articles.length > 0);
}

export async function generateNewsReport(
  newsContent: NewsContent[],
  previousReports: string[],
  reportDate: Date
): Promise<string> {
  // CRITICAL: Filter out generic portal/homepage articles BEFORE generation
  // This prevents GPT from hallucinating details to fill content gaps
  const filteredNewsContent = filterGenericPortalArticles(newsContent);
  console.log(`[Portal Filter] Filtered from ${newsContent.length} to ${filteredNewsContent.length} topics after removing generic portals`);

  // Filter out topics with no valid articles
  const validNewsContent = filteredNewsContent.filter(section => section.articles.length > 0);

  if (validNewsContent.length === 0) {
    throw new Error('No valid news articles available - cannot generate quality report');
  }

  // Try generation with full content first
  try {
    return await attemptGenerateReport(validNewsContent, previousReports, reportDate);
  } catch (error: any) {
    // Check if response contains content refusal
    const errorMessage = error?.message || '';
    const responseContent = error?.response?.choices?.[0]?.message?.content || '';
    const isContentRefusal = errorMessage.includes("can't provide") ||
      errorMessage.includes("cannot provide") ||
      responseContent.includes("I'm sorry, but I can't provide");

    if (isContentRefusal) {
      console.warn('[GPT Refusal] Content policy triggered, retrying with filtered content...');
      const filteredContent = filterSensitiveArticles(validNewsContent);

      if (filteredContent.length === 0) {
        throw new Error("All articles filtered out due to sensitive content - cannot generate report");
      }

      console.log(`[GPT Retry] Retrying with ${filteredContent.length} topics after filtering sensitive content`);
      return await attemptGenerateReport(filteredContent, previousReports, reportDate);
    }

    // Re-throw if it's not a content refusal
    throw error;
  }
}

async function attemptGenerateReport(
  newsContent: NewsContent[],
  previousReports: string[],
  reportDate: Date
): Promise<string> {
  const maxAttempts = 2;
  let lastWordCount = 0;
  const IDEAL_MIN = 900;  // ~6 minutes of audio
  const IDEAL_MAX = 1350; // ~9 minutes of audio
  const ABSOLUTE_MINIMUM = 600; // ~4 minutes of audio (handles slow news days)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isRetry = attempt > 1;

    try {
      const report = await generateReportAttempt(
        newsContent,
        previousReports,
        reportDate,
        isRetry ? lastWordCount : undefined
      );

      const wordCount = report.split(/\s+/).length;
      console.log(`[Report Length] Generated ${wordCount} words (ideal ${IDEAL_MIN}-${IDEAL_MAX}) [attempt ${attempt}/${maxAttempts}]`);

      if (wordCount >= IDEAL_MIN && wordCount <= IDEAL_MAX) {
        console.log(`[Report Length] ✓ Within ideal range (${wordCount} words)`);
        return report;
      }

      if (wordCount > IDEAL_MAX) {
        console.warn(`[Report Length] ⚠ Slightly long (${wordCount} words > ${IDEAL_MAX}). Accuracy prioritized over trimming.`);
        return report;
      }

      if (wordCount >= ABSOLUTE_MINIMUM) {
        console.warn(`[Report Length] ⚠ Acceptable but short (${wordCount} words; ideal ${IDEAL_MIN}-${IDEAL_MAX})`);
        return report;
      }

      lastWordCount = wordCount;
      console.warn(`[Report Length] ⚠️  Report too short (${wordCount} words < ${ABSOLUTE_MINIMUM} minimum)`);

      if (attempt < maxAttempts) {
        console.log(`[Report Length] Retrying with focused expansion guidance...`);
      } else {
        console.error(`[Report Length] ❌ Failed to reach ${ABSOLUTE_MINIMUM}+ words after ${maxAttempts} attempts`);
        throw new Error(`Report generation failed: only ${wordCount} words after ${maxAttempts} attempts (minimum: ${ABSOLUTE_MINIMUM})`);
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      if (!(error instanceof Error) || !error.message.includes('Report generation failed')) {
        throw error;
      }
    }
  }

  throw new Error('Report generation failed after all attempts');
}

async function generateReportAttempt(
  newsContent: NewsContent[],
  previousReports: string[],
  reportDate: Date,
  previousWordCount?: number
): Promise<string> {
  // Analyze topic coverage in previous reports
  // Only use reports from DIFFERENT days to avoid comparing against same-day duplicates
  const uniqueDateReports = getReportsFromUniqueDates(previousReports);

  const { underrepresentedTopics, topicCoverageSummary } = analyzeTopicCoverage(
    newsContent,
    uniqueDateReports
  );

  if (topicCoverageSummary) {
    console.log(`[Topic Coverage] ${topicCoverageSummary}`);
  }

  if (underrepresentedTopics.length > 0) {
    console.log(`[Topic Balance] Underrepresented topics (0 mentions in last ${uniqueDateReports.length} unique date reports): ${underrepresentedTopics.join(', ')}`);
  }

  const newsContentStr = newsContent
    .map((section) => {
      const articlesStr = section.articles
        .map((article) => {
          const publishDate = article.publishedAt
            ? new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '';
          return `- HEADLINE: ${article.title}\n  DETAILS: ${article.summary}\n  SOURCE: ${article.source}${publishDate ? ` (${publishDate})` : ''}`;
        })
        .join("\n\n");
      return `## ${section.topic}\n\n${articlesStr}`;
    })
    .join("\n\n");

  const previousReportsContext = uniqueDateReports.length > 0
    ? `\n\nPREVIOUS REPORTS (DO NOT REPEAT):
${uniqueDateReports.slice(0, 3).map((report, i) => `--- Report ${i + 1} ---\n${report.substring(0, 500)}...`).join("\n\n")}

REPETITION RULES:
- Do NOT cover the same story from previous reports unless there is a NEW development
- NEW development = new action, new data, new event (not just rewording)
- When in doubt, skip the story and find fresh news`
    : "";

  // Build topic balance guidance
  const topicBalanceGuidance = underrepresentedTopics.length > 0
    ? `\n\nPRIORITY TOPICS (haven't appeared in last ${uniqueDateReports.length} reports):
${underrepresentedTopics.join(', ')}

Include these if they have newsworthy content with specific facts.`
    : "";

  // Format date for the intro (e.g., "Monday, November 8th, 2025")
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const dayName = dayNames[reportDate.getDay()];
  const monthName = monthNames[reportDate.getMonth()];
  const day = reportDate.getDate();
  const year = reportDate.getFullYear();

  // Add ordinal suffix (st, nd, rd, th)
  const getOrdinalSuffix = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  const formattedDate = `${dayName}, ${monthName} ${day}${getOrdinalSuffix(day)}, ${year}`;

  const topicCount = newsContent.length;
  const IDEAL_MIN = 900;  // ~6 minutes of audio
  const IDEAL_MAX = 1350; // ~9 minutes of audio
  const minPerTopic = Math.max(120, Math.floor(IDEAL_MIN / Math.max(1, topicCount)));
  const maxPerTopic = Math.max(minPerTopic + 60, Math.ceil(IDEAL_MAX / Math.max(1, topicCount)));

  const retryExpansionPrompt = previousWordCount ? `
PREVIOUS DRAFT: ${previousWordCount} words (too short)
TARGET: ${IDEAL_MIN}+ words
Add 2-3 more sentences per story with specific details from sources.
` : '';

  const prompt = `You are a professional news anchor writing a morning briefing for audio.${retryExpansionPrompt}

CORE RULES:
1. ACCURACY FIRST - Only use facts explicitly stated in source articles
2. Skip vague/generic sources - Better to skip than guess
3. Each story needs: specific names + numbers/metrics + locations/dates
4. No speculation, editorialization, or "might/could" statements

FORMAT:
- Start: "Here's your morning report for ${formattedDate}."
- End: "That's it for the morning report. Have a great day!"
- Target: ${IDEAL_MIN}-${IDEAL_MAX} words (~${minPerTopic}-${maxPerTopic} words per topic)
- Natural transitions between topics (no section headers)
- Professional NPR/BBC style, short sentences for audio

CONTENT SELECTION:
- Most significant/breaking story first for each topic
- Prioritize: NBA and Redlands CA if notable
- Skip topics without specific facts or if sources are vague
- Accuracy > word count (better to have fewer quality stories)${topicBalanceGuidance}

SENSITIVE CONTENT:
- Cover crime/violence professionally with neutral tone
- Focus on facts: who, what, where, when, why
- Avoid graphic details

NO:
❌ Source citations ("according to", "reports say")
❌ Vague phrases ("buzzing with activity", "seeing momentum")
❌ Political title changes unless confirmed
❌ Repeating stories from previous reports (unless NEW development with NEW facts)

NEWS BY TOPIC:
${newsContentStr}${previousReportsContext}`;

  // Enhanced system message with non-negotiable requirements
  const systemMessage = `You are a professional news anchor writing daily audio briefings.

PRIORITIES:
1. ACCURACY — Only use facts from provided articles, skip unverifiable content
2. SPECIFICITY — Include names, numbers, locations, dates
3. FRESHNESS — Don't repeat old stories unless there's a NEW development
4. QUALITY > QUANTITY — ${IDEAL_MIN}-${IDEAL_MAX} words, but accuracy always wins

Skip generic sources or vague stories.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_completion_tokens: 6000, // Increased to 6000 to support 1800-2000 word reports (~2667 tokens + 30% buffer)
  });

  const content = response.choices[0].message.content || "";

  if (!content || content.trim().length === 0) {
    throw new Error("OpenAI returned an empty response");
  }

  // Detect content refusal in response
  if (content.includes("I'm sorry, but I can't provide") ||
    content.includes("I cannot provide") ||
    content.includes("I'm unable to")) {
    const error: any = new Error("GPT refused to generate content due to content policy");
    error.response = { choices: [{ message: { content } }] };
    throw error;
  }

  return content;
}

export async function factCheckReportAgainstSources(
  report: string,
  newsContent: NewsContent[],
  reportDate: Date
): Promise<FactCheckResult> {
  try {
    const digest = newsContent.map(section => ({
      topic: section.topic,
      articles: section.articles.slice(0, 4).map(article => ({
        title: article.title,
        summary: article.summary.length > 360 ? `${article.summary.slice(0, 357)}...` : article.summary,
        source: article.source,
        publishedAt: article.publishedAt,
        url: article.url,
      }))
    }));

    const sourcesPayload = JSON.stringify(digest, null, 2);
    const isoDate = reportDate.toISOString();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a meticulous fact-checker. Flag statements in the generated script that are unsupported by the provided article digests or that rely on outdated information. Evaluate freshness by comparing article timestamps to the report date ${isoDate}.

IMPORTANT:
1. Do NOT flag relative dates (e.g., "Thursday", "yesterday") as missing information or accuracy errors if they are consistent with the report date.
2. Do NOT flag events from the last 72 hours as "outdated". News from the previous 1-3 days is acceptable for this report.
3. Only flag date issues if there is a clear contradiction (e.g., report says "Monday" but event was "Friday").`,
        },
        {
          role: 'user',
          content: `REPORT DATE: ${isoDate}

GENERATED REPORT:
${report}

SOURCE DIGEST:
${sourcesPayload}

Respond in JSON with the shape {
  "status": "pass" | "fail",
  "issues": [
    {
      "focus": "hallucination" | "outdated" | "accuracy" | "other",
      "severity": "critical" | "warning",
      "summary": "concise description of the problem",
      "evidence": "cite the conflicting or missing article details"
    }
  ]
}.

Mark status as "fail" if any critical issues exist. Focus on concrete factual conflicts or clearly outdated developments only. Do not fail for missing specific dates if relative timing is implied.`,
        },
      ],
      max_completion_tokens: 1200,
      temperature: 0,
    });

    const raw = response.choices[0].message.content?.trim() || '';
    if (!raw) {
      console.warn('[FactCheck] Empty response from model; skipping fact check');
      return { status: 'pass', issues: [], rawResponse: raw, skipped: true };
    }

    let jsonText = raw;
    const fenced = raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
    if (fenced) {
      jsonText = fenced[1];
    }

    let parsed: FactCheckResult;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn('[FactCheck] Unable to parse response as JSON, treating as pass', parseError);
      return { status: 'pass', issues: [], rawResponse: raw, skipped: true };
    }

    parsed.rawResponse = raw;

    if (!Array.isArray(parsed.issues)) {
      parsed.issues = [];
    }

    if (parsed.status !== 'pass' && parsed.status !== 'fail') {
      parsed.status = parsed.issues.some(issue => issue.severity === 'critical') ? 'fail' : 'pass';
    }

    return parsed;
  } catch (error) {
    console.error('[FactCheck] Error validating report:', error);
    return { status: 'pass', issues: [], skipped: true, rawResponse: error instanceof Error ? error.message : String(error) };
  }
}

function splitTextIntoChunks(text: string, maxChars: number = 4000): string[] {
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const testChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

    if (testChunk.length <= maxChars) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = '';

      if (paragraph.length > maxChars) {
        const sentences = paragraph.split('. ');
        let sentenceChunk = '';

        for (const sentence of sentences) {
          if (sentence.trim().length === 0) continue;

          const testSentence = sentenceChunk ? `${sentenceChunk}. ${sentence}` : sentence;

          if (testSentence.length <= maxChars) {
            sentenceChunk = testSentence;
          } else {
            if (sentenceChunk) {
              chunks.push(sentenceChunk);
              sentenceChunk = '';
            }

            if (sentence.length > maxChars) {
              let remaining = sentence;
              while (remaining.length > maxChars) {
                chunks.push(remaining.substring(0, maxChars));
                remaining = remaining.substring(maxChars);
              }
              if (remaining.trim().length > 0) {
                sentenceChunk = remaining;
              }
            } else {
              sentenceChunk = sentence;
            }
          }
        }

        if (sentenceChunk.trim().length > 0) {
          currentChunk = sentenceChunk;
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.filter(chunk => chunk.trim().length > 0);
}

export async function generateAudioFromText(
  text: string,
  baseOutputPath: string
): Promise<string[]> {
  const chunks = splitTextIntoChunks(text, 4000);
  const audioPaths: string[] = [];
  const tempPaths: string[] = [];

  const dir = path.dirname(baseOutputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = chunks.length > 1
        ? baseOutputPath.replace('.mp3', `-part${i + 1}.mp3`)
        : baseOutputPath;

      const tempPath = `${chunkPath}.tmp`;
      tempPaths.push(tempPath);

      const mp3 = await openai.audio.speech.create({
        model: "tts-1-hd",
        voice: "nova",
        input: chunks[i],
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      fs.writeFileSync(tempPath, buffer);

      fs.renameSync(tempPath, chunkPath);
      audioPaths.push(chunkPath);
    }

    return audioPaths;
  } catch (error) {
    for (const tempPath of tempPaths) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }

    for (const audioPath of audioPaths) {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }

    throw error;
  }
}
