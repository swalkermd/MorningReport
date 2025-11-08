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

  const prompt = `You are an expert news anchor writing a daily morning news briefing called "Morning Report". Your task is to write an intelligent, engaging, and concise news report based on the following curated news content.

CRITICAL REQUIREMENTS:
- Your report MUST start with exactly this line: "Here's your morning report for ${formattedDate}."
- Your report MUST be under 700 words to fit within technical constraints
- Aim for 600-700 words maximum (including the intro line)
- Be extremely selective about which stories to include

GUIDELINES:
- Write in a professional but conversational tone suitable for audio delivery
- Focus on news items that are NEW and have not been covered in detail in previous reports
- If a story continues from previous reports, only include it if there are NOTABLE UPDATES
- Be concise and direct - minimize banter and filler phrases
- Select only the MOST IMPORTANT 5-6 topics from the news content below
- Use smooth transitions between topics
- Write for spoken word delivery (short sentences, natural phrasing)
- Keep each topic section to 2-3 sentences maximum

NEWS CONTENT BY TOPIC:
${newsContentStr}${previousReportsContext}

Write the complete news report now (under 700 words, starting with the required intro line):`;

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
