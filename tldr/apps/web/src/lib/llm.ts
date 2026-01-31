import { Anthropic } from "@anthropic-ai/sdk";

export type SimplifyLevel = "simple" | "gcse" | "plain";
export type SimplifyTone = "preserve" | "descriptive" | "bullets";
export type WholeTextMode = "key_info";

type LlmResult = {
  simplifiedText: string;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

function getUtcTimestamp(): string {
  const now = new Date();

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    `${now.getUTCFullYear()}-` +
    `${pad(now.getUTCMonth() + 1)}-` +
    `${pad(now.getUTCDate())} ` +
    `${pad(now.getUTCHours())}:` +
    `${pad(now.getUTCMinutes())}:` +
    `${pad(now.getUTCSeconds())} UTC`
  );
}


const SYSTEM_INSTRUCTION =
  "You are a careful editor. Preserve meaning, simplify language to the requested level, avoid adding facts, and keep edits minimal.";

const TONE_PROMPTS: Record<SimplifyTone, string> = {
  preserve: "Keep the tone and voice as close to the original paragraph as possible.",
  descriptive:
    "Rewrite the paragraph with a descriptive tone that highlights imagery while keeping the meaning intact.",
  bullets: "Return the simplified content as a concise list of bullet points, each starting with a dash.",
};

export const runtime = "nodejs";

const WHOLE_TEXT_PROMPTS: Record<WholeTextMode, string> = {
  key_info:
    "Extract the key information from the full text. Return a JSON object with the following shape: " +
    "{ \"sections\": { \"Important dates\": string[], \"Things to do\": string[], \"Things to know\": string[] }, " +
    "\"events\": [{ \"title\": string, \"start\": string|null, \"end\": string|null, \"timezone\": string|null, \"location\": string|null, \"details\": string|null }] }. " +
    "Always include the three section headings in this order. Use \"None\" as the only entry when a section has no items. " +
    "Dates should be ISO 8601 (YYYY-MM-DD for all-day; include time with timezone offset when present)" +
    "Include an event object only when the text specifies a real date or time. " +
    "Return only valid JSON without markdown or commentary. Do not add facts or assumptions.",
};

export async function simplifyWithLlm(
  text: string,
  level: SimplifyLevel,
  tone: SimplifyTone,
): Promise<LlmResult> {
  const model = process.env.ANTHROPIC_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.anthropic.com/v1";

  if (!apiKey || !model) {
    throw new Error("LLM configuration is missing.");
  }

  const client = new Anthropic({
    apiKey,
  });

  const nowUtc = getUtcTimestamp();

  const prompt =
    `Current date and time: ${nowUtc}\n` +
    `${TONE_PROMPTS[tone]}\n\n` +
    `Simplify the following paragraph to ${level} reading level. ` +
    `Return only the simplified paragraph.`;


  const response = await client.messages.create({
    model,
    temperature: 0.2,
    max_tokens: 1024,
    system: SYSTEM_INSTRUCTION,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\n${text}`,
      },
    ],
  });

  const simplifiedText = response.content
    ?.filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("")
    .trim();

  return {
    simplifiedText: simplifiedText ?? "",
    model: response.model ?? model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    totalTokens:
      response.usage?.input_tokens !== undefined && response.usage?.output_tokens !== undefined
        ? response.usage.input_tokens + response.usage.output_tokens
        : null,
  };
}

export async function extractKeyInfoWithLlm(text: string, mode: WholeTextMode): Promise<LlmResult> {
  const model = process.env.ANTHROPIC_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || !model) {
    throw new Error("LLM configuration is missing.");
  }

  const client = new Anthropic({
    apiKey,
  });

  const nowUtc = getUtcTimestamp();

  const prompt =
    `Current date and time: ${nowUtc}\n` +
    `${WHOLE_TEXT_PROMPTS[mode]}\n\n` +
    `Return only the JSON object.`;


  const response = await client.messages.create({
    model,
    temperature: 0.2,
    max_tokens: 1024,
    system: SYSTEM_INSTRUCTION,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\n${text}`,
      },
    ],
  });

  const simplifiedText = response.content
    ?.filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("")
    .trim();

  return {
    simplifiedText: simplifiedText ?? "",
    model: response.model ?? model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    totalTokens:
      response.usage?.input_tokens !== undefined && response.usage?.output_tokens !== undefined
        ? response.usage.input_tokens + response.usage.output_tokens
        : null,
  };
}
