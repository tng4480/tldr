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

const SYSTEM_INSTRUCTION =
  "You are a careful editor. Preserve meaning, simplify language to the requested level, avoid adding facts, and keep edits minimal.";

function createAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("LLM configuration is missing.");
  }

  const options: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (process.env.LLM_BASE_URL) {
    (options as any).baseURL = process.env.LLM_BASE_URL;
  }
  return new Anthropic(options);
}

const TONE_PROMPTS: Record<SimplifyTone, string> = {
  preserve: "Keep the tone and voice as close to the original paragraph as possible.",
  descriptive:
    "Rewrite the paragraph with a descriptive tone that highlights imagery while keeping the meaning intact.",
  bullets: "Return the simplified content as a concise list of bullet points, each starting with a dash.",
};

export const runtime = "nodejs";

const WHOLE_TEXT_PROMPTS: Record<WholeTextMode, string> = {
  key_info:
    "Extract the key information from the full text. " +
    "Return STRICT JSON with this shape: " +
    "{sections: {\"Important dates\": string[], \"Things to do\": string[], \"Things to know\": string[]}, events: Array<{title: string, start?: string|null, end?: string|null, timezone?: string|null, location?: string|null, details?: string|null}>}. " +
    "Rules: always include all 3 section keys in that order; if a section has no items, use [\"None\"]. " +
    "For events: include only when the text clearly describes something calendar-worthy (meeting, deadline, appointment, session, exam, submission, travel, etc). " +
    "Use RFC3339 for start/end when time is known (include timezone offset if known); use YYYY-MM-DD for all-day; otherwise use null. " +
    "Do not add facts or assumptions. Do not include markdown. Do not include any extra keys. Return JSON only.",
};

export async function simplifyWithLlm(
  text: string,
  level: SimplifyLevel,
  tone: SimplifyTone,
): Promise<LlmResult> {
  const model = process.env.ANTHROPIC_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || !model) {
    throw new Error("LLM configuration is missing.");
  }

  const client = createAnthropicClient();

  const prompt = `${TONE_PROMPTS[tone]}\n\nSimplify the following paragraph to ${level} reading level. Return only the simplified paragraph.`;

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

export async function simplifyWithLlmStream(
  text: string,
  level: SimplifyLevel,
  tone: SimplifyTone,
  onDelta: (text: string) => void,
): Promise<LlmResult> {
  const model = process.env.ANTHROPIC_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || !model) {
    throw new Error("LLM configuration is missing.");
  }

  const prompt = `${TONE_PROMPTS[tone]}\n\nSimplify the following paragraph to ${level} reading level. Return only the simplified paragraph.`;

  const client = createAnthropicClient();
  const stream = client.messages
    .stream({
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
    } as any)
    .on("text", (deltaText: string) => {
      if (typeof deltaText === "string" && deltaText.length > 0) {
        onDelta(deltaText);
      }
    });

  const finalMessage = await stream.finalMessage();
  const simplifiedText = finalMessage.content
    ?.filter((block: any) => block.type === "text")
    .map((block: any) => ("text" in block ? block.text : ""))
    .join("")
    .trim();

  return {
    simplifiedText: simplifiedText ?? "",
    model: finalMessage.model ?? model,
    inputTokens: finalMessage.usage?.input_tokens ?? null,
    outputTokens: finalMessage.usage?.output_tokens ?? null,
    totalTokens:
      finalMessage.usage?.input_tokens !== undefined && finalMessage.usage?.output_tokens !== undefined
        ? finalMessage.usage.input_tokens + finalMessage.usage.output_tokens
        : null,
  };
}

export async function extractKeyInfoWithLlm(text: string, mode: WholeTextMode): Promise<LlmResult> {
  const model = process.env.ANTHROPIC_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || !model) {
    throw new Error("LLM configuration is missing.");
  }

  const client = createAnthropicClient();

  const prompt = WHOLE_TEXT_PROMPTS[mode];

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

export async function extractKeyInfoWithLlmStream(
  text: string,
  mode: WholeTextMode,
  onDelta: (text: string) => void,
): Promise<LlmResult> {
  const model = process.env.ANTHROPIC_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || !model) {
    throw new Error("LLM configuration is missing.");
  }

  const prompt = WHOLE_TEXT_PROMPTS[mode];

  const client = createAnthropicClient();
  const stream = client.messages
    .stream({
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
    } as any)
    .on("text", (deltaText: string) => {
      if (typeof deltaText === "string" && deltaText.length > 0) {
        onDelta(deltaText);
      }
    });

  const finalMessage = await stream.finalMessage();
  const simplifiedText = finalMessage.content
    ?.filter((block: any) => block.type === "text")
    .map((block: any) => ("text" in block ? block.text : ""))
    .join("")
    .trim();

  return {
    simplifiedText: simplifiedText ?? "",
    model: finalMessage.model ?? model,
    inputTokens: finalMessage.usage?.input_tokens ?? null,
    outputTokens: finalMessage.usage?.output_tokens ?? null,
    totalTokens:
      finalMessage.usage?.input_tokens !== undefined && finalMessage.usage?.output_tokens !== undefined
        ? finalMessage.usage.input_tokens + finalMessage.usage.output_tokens
        : null,
  };
}
