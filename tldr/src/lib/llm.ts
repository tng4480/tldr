export type SimplifyLevel = "simple" | "gcse" | "plain";

type LlmResult = {
  simplifiedText: string;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

export async function simplifyWithLlm(text: string, level: SimplifyLevel): Promise<LlmResult> {
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!apiKey || !model) {
    throw new Error("LLM configuration is missing.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a careful editor. Preserve meaning, simplify language to the requested level, avoid adding facts, and keep edits minimal.",
        },
        {
          role: "user",
          content: `Simplify the following paragraph to ${level} reading level. Return only the simplified paragraph.\n\n${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM request failed: ${errorText}`);
  }

  const data = await response.json();
  const simplifiedText = data.choices?.[0]?.message?.content?.trim() ?? "";

  return {
    simplifiedText,
    model: data.model,
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
    totalTokens: data.usage?.total_tokens ?? null,
  };
}
