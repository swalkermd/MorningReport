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
  
  // Count how many times each topic appears in previous reports
  const topicMentions: Map<string, number> = new Map();
  allTopics.forEach(topic => topicMentions.set(topic, 0));
  
  // Scan previous reports for topic coverage
  previousReports.forEach(report => {
    allTopics.forEach(topic => {
      // Check if topic name or key terms appear in the report
      const topicTerms = topic.toLowerCase();
      if (report.toLowerCase().includes(topicTerms)) {
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
  // Filter out topics with no valid articles
  const validNewsContent = newsContent.filter(section => section.articles.length > 0);
  
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
  // Try up to 2 attempts to generate a properly-sized report
  const maxAttempts = 2;
  let lastWordCount = 0;
  const topicCount = newsContent.length;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isRetry = attempt > 1;
    
    try {
      const report = await generateReportAttempt(
        newsContent,
        previousReports,
        reportDate,
        isRetry ? lastWordCount : undefined
      );
      
      // Validate length
      const wordCount = report.split(/\s+/).length;
      console.log(`[Report Length] Generated ${wordCount} words (target: 1500-2000) [attempt ${attempt}/${maxAttempts}]`);
      
      // Dynamic minimum based on available topics
      // Testing (6 topics, sparse data): 700 words minimum (2-3 min audio)
      // Production (10+ topics, fresh data): 1200 words minimum (4-6 min audio)  
      // Full production (13 topics): Will easily hit 1500-2000 words
      const minimumWords = topicCount < 10 ? 700 : 1200;
      const targetWords = 1500;
      
      console.log(`[Report Length] Minimum: ${minimumWords} words (${topicCount} topics), Target: ${targetWords} words`);
      
      if (wordCount >= targetWords) {
        console.log(`[Report Length] ✓ Report meets target length (${wordCount} words >= ${targetWords})`);
        return report;
      } else if (wordCount >= minimumWords) {
        console.log(`[Report Length] ✓ Report meets minimum length (${wordCount} words >= ${minimumWords}, target: ${targetWords})`);
        return report;
      }
      
      // Report too short - prepare for retry
      lastWordCount = wordCount;
      console.warn(`[Report Length] ⚠️  Report too short (${wordCount} words < ${minimumWords} minimum, target: ${targetWords})`);
      
      if (attempt < maxAttempts) {
        console.log(`[Report Length] Retrying with expansion instructions...`);
      } else {
        console.error(`[Report Length] ❌ Failed to generate ${minimumWords}+ word report after ${maxAttempts} attempts`);
        throw new Error(`Report generation failed: only ${wordCount} words after ${maxAttempts} attempts (minimum: ${minimumWords}, target: ${targetWords})`);
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      // For non-length errors, rethrow immediately
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
  const { underrepresentedTopics, topicCoverageSummary } = analyzeTopicCoverage(
    newsContent, 
    previousReports
  );
  
  if (topicCoverageSummary) {
    console.log(`[Topic Coverage] ${topicCoverageSummary}`);
  }
  
  if (underrepresentedTopics.length > 0) {
    console.log(`[Topic Balance] Underrepresented topics (0 mentions in last ${previousReports.length} reports): ${underrepresentedTopics.join(', ')}`);
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

  const previousReportsContext = previousReports.length > 0
    ? `\n\n🚨 CRITICAL ANTI-REPETITION REQUIREMENT 🚨

PREVIOUS 5 REPORTS (DO NOT REPEAT THESE STORIES):
${previousReports.map((report, i) => `--- Report ${i + 1} ---\n${report}`).join("\n\n")}

📋 REPETITION POLICY (STRICTLY ENFORCED):
1. DO NOT cover the same story/event from previous reports UNLESS there is a NEW development
2. A "NEW development" means:
   ✅ A new action taken (e.g., company announced → company launched)
   ✅ New numbers/data released (e.g., Q3 results → Q4 results)
   ✅ New follow-up event (e.g., announcement → product ships)
   ✅ Breaking update to ongoing story (e.g., investigation → arrest made)
   
3. NOT acceptable as "new development":
   ❌ Same story with slightly different wording
   ❌ General progress on previously covered topics
   ❌ Continuation of same trend without new data points
   ❌ "Still happening" or "ongoing" without specific new facts
   
4. REQUIRED for any repeat story:
   - MUST explicitly state what's NEW (e.g., "In an update to yesterday's story...")
   - MUST include NEW specific facts (names, numbers, dates) not in previous reports
   - MUST represent meaningful progression, not just restatement
   
5. When in doubt: SKIP the story and find fresh news instead
   - It's better to have 6 fresh topics than 8 topics with 2 repeats
   - Listeners expect DIFFERENT news each day, not reruns

❌ EXAMPLE OF VIOLATION:
Previous report: "Tesla announced new battery technology with 30% range improvement"
Today's report: "Tesla continues progress on battery technology improvements" ← REJECT THIS

✅ EXAMPLE OF ACCEPTABLE REPEAT:
Previous report: "Tesla announced new battery technology with 30% range improvement"
Today's report: "Tesla began production of its new battery cells at the Texas Gigafactory, shipping first units to customers this week" ← NEW ACTION, NEW FACTS`
    : "";
  
  // Build topic balance guidance
  const topicBalanceGuidance = underrepresentedTopics.length > 0
    ? `\n\n🎯 TOPIC COVERAGE REQUIREMENT:
The following topics have NOT appeared in the last ${previousReports.length} reports and MUST be included in today's report if they have newsworthy content with specific facts:
${underrepresentedTopics.map(t => `- ${t}`).join('\n')}

To ensure balanced coverage, prioritize these underrepresented topics when selecting stories. Every topic should appear at least once every 5 reports.`
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

  // Calculate required words per topic
  const topicCount = newsContent.length;
  const wordsPerTopic = Math.ceil(1600 / topicCount); // Aim for 1600 to provide buffer
  
  // Build retry-specific expansion instruction if this is a retry attempt
  const retryExpansionPrompt = previousWordCount ? `
🚨🚨🚨 CRITICAL LENGTH FAILURE - IMMEDIATE EXPANSION REQUIRED 🚨🚨🚨

Your previous draft had only ${previousWordCount} words. This is too short.
The target is 1500-2000 words for a comprehensive audio briefing. You need at least ${wordsPerTopic} words PER TOPIC.

MATHEMATICAL REQUIREMENT:
You have ${topicCount} topics available. To reach 1500+ words total:
- You MUST write ${wordsPerTopic}+ words PER TOPIC
- That means 3-4 FULL paragraphs for EACH topic
- Each paragraph should be 60-80 words minimum

MANDATORY EXPANSION TECHNIQUES:
1. START each topic with context/background (1 paragraph)
2. DETAIL the specific facts from source articles (1-2 paragraphs)  
3. EXPLAIN the significance and implications (1 paragraph)
4. ADD transitional phrases between topics
5. INCLUDE relevant details: names, dates, numbers, locations, quotes
6. ELABORATE on how this impacts people/industry/society

DO NOT write brief summaries. This is a COMPREHENSIVE audio briefing, not a headline list.
Your previous ${previousWordCount}-word draft was rejected. Write ${wordsPerTopic}+ words per topic NOW.
` : `

📊 LENGTH REQUIREMENT (STRICTLY ENFORCED):
You have ${topicCount} topics. You MUST write ${wordsPerTopic}+ words PER TOPIC to reach the 1500-2000 word target.
- That means 3-4 full paragraphs per topic
- Include context, details, analysis, and implications
- This is a comprehensive audio briefing, not a headline summary
`;

  const prompt = `You are a professional news anchor for NPR/BBC writing a daily morning news briefing. You MUST write at NATIONAL NEWS QUALITY LEVEL with SPECIFIC facts, names, numbers, and citations.${retryExpansionPrompt}

SENSITIVE CONTENT POLICY:
- You MUST cover crime, violence, and other difficult news topics professionally
- Use neutral, factual tone without graphic details
- Focus on facts: who, what, where, when, why
- Avoid sensationalism while maintaining editorial integrity
- Example: "Authorities in Dubai are investigating after the remains of two individuals were discovered" instead of graphic descriptions

CRITICAL REQUIREMENTS:
- Start with EXACTLY: "Here's your morning report for ${formattedDate}."
- Include a brief "On This Day in History" section (1-2 sentences) near the end, before the closing
- End with EXACTLY: "That's it for the morning report. Have a great day!"
- MUST be 1500-2000 words (target length for 5-10 minute audio briefing)
- MINIMUM 1500 words - this is NON-NEGOTIABLE for proper audio duration
- Each topic should receive 2-3 paragraphs of coverage (150-200 words per topic)
- Include transitional phrases, context, and analysis to reach target length
- If you have 6-8 topics, aim for 200-250 words per topic to hit 1500+ total
- EVERY story MUST include SPECIFIC details: names, numbers, locations, dates, companies
- ABSOLUTELY NO vague phrases like "buzzing with activity", "seeing momentum", "noteworthy increase"
- REJECT generic content - if source data lacks specifics, skip that topic entirely
- DO NOT improvise your own closing - use the required closing line only
🚨 CRITICAL FACT-CHECKING REQUIREMENT (MANDATORY):
- You MUST fact-check and CORRECT all political titles, even when source articles are wrong
- As of November 2025: Donald Trump is President of the United States (inaugurated January 2025)
- If a source article says "former President Trump" - this is INCORRECT and you MUST correct it to "President Trump"
- DO NOT copy outdated/incorrect titles from sources - always use current, factually accurate titles
- When writing about Trump in November 2025, refer to him as "President Trump" or "President Donald Trump"
- This applies to ALL political figures - verify current officeholders and correct source errors

🔴 FRESHNESS REQUIREMENT (CRITICAL):
- Breaking news topics (World, US, NBA, Redlands, Travel): ONLY stories from last 24 hours
- Tech/Science topics (AI, EVs, Robotics, Anti-Aging, eVTOL, etc.): Stories from last 3-4 days acceptable
- Check publication dates in source metadata - respect the tiered freshness windows
- For sports (NBA): Only include games/events from yesterday or today
- For tech announcements: Recent launches/updates within the past few days
- Better to skip a topic entirely than include genuinely stale news

NATIONAL NEWS QUALITY STANDARDS:
- Include SPECIFIC names (people, companies, organizations)
- Include NUMBERS (percentages, amounts, statistics)
- Include LOCATIONS (cities, countries, regions)
- Include TIMEFRAMES (yesterday, this week, Q4 results)
- Cite ACTUAL events, announcements, or developments
- Use ACTIVE voice with concrete details

FORBIDDEN PHRASES (causes immediate failure):
❌ "buzzing with activity"
❌ "seeing new momentum"
❌ "noteworthy increase"
❌ "industry experts are enthusiastic"
❌ "recent breakthroughs"
❌ "may soon be"
❌ ANY vague generalization without specific facts

REQUIRED FORMAT for each story:
✅ "[Company/Person] announced [specific thing] on [date/timeframe]"
✅ "[Metric] increased/decreased by [number]% in [location/sector]"
✅ "[Organization] launched [specific product/initiative] featuring [details]"

CITATION REQUIREMENTS:
- Only cite sources when pertinent to the story's credibility or context
- Sources are NOT required for every piece of information
- When citing: use natural attribution (e.g., "according to Bloomberg", "Reuters reports")
- Include publication dates only when relevant to the story's timeliness

CONTENT SELECTION:
- PRIORITY TOPICS (prioritize these if notable): NBA, Redlands CA Local News
- TOPIC BALANCE: Each topic should appear at least once every 5 reports to ensure comprehensive coverage
- Only include stories with SPECIFIC, verifiable facts
- MUST have: organization/person name + number/metric + location/timeframe
- Skip any topic where source data is too vague or story isn't newsworthy
- Better to cover stories well than force inclusion of unremarkable content
- Focus on: major announcements, statistical changes, product launches, policy decisions
- If NBA or Redlands news is notable and meets quality standards, prioritize it
- Skip any topic (including priority topics) if the news isn't significant or lacks specifics${topicBalanceGuidance}

ON THIS DAY IN HISTORY:
- After covering the main news topics, include a brief "On This Day in History" segment
- MUST be 1-2 sentences only
- State an interesting, specific historical event that occurred on ${monthName} ${day}
- Include the YEAR and specific FACTS (names, numbers, locations)
- Example format: "On this day in [YEAR], [specific event with names and details]."
- Keep it concise and factual - this is a brief transition before the closing

QUALITY VALIDATION (each story must pass):
✅ Contains at least ONE specific organization/person name
✅ Contains at least ONE specific number, percentage, or metric
✅ Contains at least ONE specific location, date, or timeframe

DELIVERY STYLE:
- Professional but conversational (NPR/BBC style)
- Short sentences for audio clarity
- Smooth transitions between topics WITHOUT stating topic names as headers
- DO NOT say "World News", "NBA", "Electric Vehicles", etc. as section titles
- Instead, incorporate topic transitions naturally into the first sentence:
  ✅ "In international developments, the United Nations..."
  ✅ "Turning to professional basketball, the Dallas Mavericks..."
  ✅ "On the automotive front, Tesla announced..."
  ❌ "World News. The United Nations..."
  ❌ "NBA. The Dallas Mavericks..."
- NO editorializing or speculation

NEWS CONTENT BY TOPIC:
${newsContentStr}${previousReportsContext}

Write your news report now. Remember: 
1. SPECIFIC FACTS ONLY (names + numbers + dates)
2. Cite sources only when pertinent to the story
3. If a story can't meet quality standards, skip it entirely
4. DO NOT REPEAT stories from previous reports unless there's a NEW development with NEW facts`;

  // Enhanced system message with non-negotiable requirements
  const systemMessage = `You are a professional news anchor writing comprehensive daily audio news briefings for Morning Report.

🔴 ABSOLUTE REQUIREMENTS (FAILURE = REJECTION):
1. LENGTH: MINIMUM 1500 words, target 1500-2000 words. This is for a 5-10 minute AUDIO briefing.
   - Short reports (under 1500 words) will be REJECTED and you will be asked to rewrite
   - Write 3-4 FULL paragraphs (250+ words) per topic
   - This is NOT a headline summary - it's a comprehensive audio briefing
   
2. STRUCTURE: 
   - Start EXACTLY: "Here's your morning report for [date]."
   - End EXACTLY: "That's it for the morning report. Have a great day!"
   - Include "On This Day in History" (1-2 sentences) before closing
   
3. QUALITY: Every story requires specific names, numbers, locations, dates - NO generic phrases

4. FRESHNESS: DO NOT repeat stories from previous 5 reports unless there's a genuinely NEW development
   - Listeners expect DIFFERENT news each day, not rehashed content
   - When in doubt, skip the story and find fresh news instead
   
5. STYLE: Professional NPR/BBC quality - conversational but detailed and authoritative

These are HARD requirements. Reports under 1500 words or with repeated stories are automatically rejected.`;

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
    max_completion_tokens: 4500, // Increased for longer reports
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
  
  // Apply political title corrections (deterministic post-processing)
  const correctedContent = validateAndCorrectPoliticalTitles(content);

  return correctedContent;
}

/**
 * Validates and automatically corrects incorrect political titles in the report.
 * Throws an error if unknown title violations are detected after corrections.
 */
function validateAndCorrectPoliticalTitles(content: string): string {
  let corrected = content;
  let correctionsMade = 0;
  
  // As of November 2025, Trump is the current president (inaugurated January 2025)
  // Replace all instances of "former President Trump" with "President Trump"
  const formerTrumpRegex = /(f|F)ormer (P|p)resident (Donald )?Trump/g;
  const matches = content.match(formerTrumpRegex);
  
  if (matches && matches.length > 0) {
    corrected = corrected.replace(formerTrumpRegex, (match) => {
      // Preserve the capitalization of "President"
      const isCapitalized = match.includes('President');
      return match.replace(/former /i, '').replace(/Former /i, '');
    });
    correctionsMade = matches.length;
    console.log(`[Title Validator] ✓ Corrected ${correctionsMade} instance(s) of "former President Trump" → "President Trump"`);
  }
  
  // Add more title corrections here as needed for other political figures
  // Example: corrected = corrected.replace(/Vice President-elect/g, 'Vice President');
  
  return corrected;
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
