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
  }>;
}

export async function generateNewsReport(
  newsContent: NewsContent[],
  previousReports: string[],
  reportDate: Date
): Promise<string> {
  const newsContentStr = newsContent
    .map((section) => {
      const articlesStr = section.articles
        .map((article) => `- ${article.title}\n  ${article.summary}\n  Source: ${article.source}`)
        .join("\n\n");
      return `## ${section.topic}\n\n${articlesStr}`;
    })
    .join("\n\n");

  const previousReportsContext = previousReports.length > 0
    ? `\n\nPrevious 5 reports (avoid repeating this content unless there are significant updates):\n${previousReports.map((report, i) => `--- Report ${i + 1} ---\n${report}`).join("\n\n")}`
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

  const prompt = `You are a professional news anchor for NPR/BBC writing a daily morning news briefing. You MUST write at NATIONAL NEWS QUALITY LEVEL with SPECIFIC facts, names, numbers, and citations.

CRITICAL REQUIREMENTS:
- Start with EXACTLY: "Here's your morning report for ${formattedDate}."
- MUST be 600-700 words maximum (strict limit for audio)
- EVERY story MUST include SPECIFIC details: names, numbers, locations, dates, companies
- ABSOLUTELY NO vague phrases like "buzzing with activity", "seeing momentum", "noteworthy increase"
- REJECT generic content - if source data lacks specifics, skip that topic entirely

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

CONTENT SELECTION:
- Only include stories with SPECIFIC, verifiable facts
- Skip any topic where source data is too vague
- Better to cover 4-5 stories well than 8 stories poorly
- Focus on: major announcements, statistical changes, product launches, policy decisions

DELIVERY STYLE:
- Professional but conversational (NPR/BBC style)
- Short sentences for audio clarity
- Smooth transitions between unrelated topics
- NO editorializing or speculation

NEWS CONTENT BY TOPIC:
${newsContentStr}${previousReportsContext}

Write your news report now. Remember: SPECIFIC FACTS ONLY. No vague generalizations. If a topic lacks specific information, skip it entirely.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a professional news anchor writing daily audio news briefings. Write in a clear, engaging style suitable for spoken delivery.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_completion_tokens: 2500,
  });

  const content = response.choices[0].message.content || "";
  
  if (!content || content.trim().length === 0) {
    throw new Error("OpenAI returned an empty response");
  }

  return content;
}

export async function generateAudioFromText(
  text: string,
  outputPath: string
): Promise<void> {
  const mp3 = await openai.audio.speech.create({
    model: "tts-1-hd",
    voice: "nova",
    input: text,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, buffer);
}
