"use client";

import {
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Grid,
  Group,
  Highlight,
  List,
  Mark,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import {
  detectHardSentences,
  extractKeywords,
  fleschReadingEase,
  pickTopSentences,
  splitIntoSentences,
  wordCount,
} from "@/lib/textAnalysis";

type ReadingLevel = "simple" | "gcse" | "plain";

type SimplifiedMap = Record<number, string>;

type SimplifyState = {
  loadingIndex: number | null;
  error: string | null;
};

const READING_LEVEL_OPTIONS = [
  { value: "simple", label: "Simple" },
  { value: "gcse", label: "GCSE" },
  { value: "plain", label: "Plain" },
] as const;

export default function HomePage() {
  const [text, setText] = useState("");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("simple");
  const [simplifiedMap, setSimplifiedMap] = useState<SimplifiedMap>({});
  const [simplifyState, setSimplifyState] = useState<SimplifyState>({
    loadingIndex: null,
    error: null,
  });

  const sentences = useMemo(() => splitIntoSentences(text), [text]);
  const keywords = useMemo(() => extractKeywords(text, 8), [text]);
  const hardSentences = useMemo(() => detectHardSentences(sentences), [sentences]);
  const keySentences = useMemo(() => pickTopSentences(sentences, 3), [sentences]);
  const readability = useMemo(() => fleschReadingEase(text), [text]);
  const totalWords = useMemo(() => wordCount(text), [text]);

  const paragraphs = useMemo(() => {
    if (!text.trim()) {
      return [];
    }
    return text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }, [text]);

  async function handleSimplify(paragraph: string, index: number) {
    setSimplifyState({ loadingIndex: index, error: null });
    try {
      const response = await fetch("/api/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: paragraph, readingLevel }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? "Unable to simplify this paragraph.");
      }

      const data = await response.json();
      setSimplifiedMap((prev) => ({ ...prev, [index]: data.simplifiedText }));
      setSimplifyState({ loadingIndex: null, error: null });
    } catch (error) {
      setSimplifyState({
        loadingIndex: null,
        error: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  }

  return (
    <Stack gap="xl">
      <SiteHeader />
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <Title order={2}>Simplify long reads with confidence.</Title>
              <Text c="dimmed">
                Paste text, see instant readability insights, and opt in to AI-powered
                simplification per paragraph. By default, everything stays on your device.
              </Text>
              <Textarea
                label="Paste your text"
                placeholder="Drop in an article, policy, or study notes."
                minRows={8}
                value={text}
                onChange={(event) => setText(event.currentTarget.value)}
              />
              <Group justify="space-between" wrap="wrap">
                <Select
                  label="Simplification level"
                  data={READING_LEVEL_OPTIONS}
                  value={readingLevel}
                  onChange={(value) => value && setReadingLevel(value as ReadingLevel)}
                  w={200}
                />
                <Badge size="lg" variant="light" color="indigo">
                  Client-side analysis only
                </Badge>
              </Group>
            </Stack>
          </Card>

          <Grid gutter="lg">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Paper withBorder p="lg">
                <Stack gap="sm">
                  <Title order={4}>Analysis snapshot</Title>
                  <Group gap="xs">
                    <Badge color="indigo">Flesch score: {readability}</Badge>
                    <Badge color="grape">Sentences: {sentences.length}</Badge>
                    <Badge color="teal">Words: {totalWords}</Badge>
                  </Group>
                  <Divider />
                  <Text fw={600}>Key sentences</Text>
                  {keySentences.length ? (
                    <List spacing="xs">
                      {keySentences.map((sentence) => (
                        <List.Item key={sentence}>{sentence}</List.Item>
                      ))}
                    </List>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Add text to reveal key sentences.
                    </Text>
                  )}
                  <Divider />
                  <Text fw={600}>Top keywords</Text>
                  <Group gap="xs">
                    {keywords.length ? (
                      keywords.map((keyword) => (
                        <Badge key={keyword} variant="light" color="orange">
                          {keyword}
                        </Badge>
                      ))
                    ) : (
                      <Text size="sm" c="dimmed">
                        No keywords yet.
                      </Text>
                    )}
                  </Group>
                </Stack>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper withBorder p="lg">
                <Stack gap="sm">
                  <Title order={4}>Highlighted reading view</Title>
                  {sentences.length ? (
                    <Text>
                      {sentences.map((sentence, index) => {
                        const content = (
                          <Highlight highlight={keywords} color="grape">
                            {sentence}
                          </Highlight>
                        );
                        return (
                          <Text component="span" key={`${sentence}-${index}`}>
                            {hardSentences[index] ? <Mark color="yellow">{content}</Mark> : content}
                            {" "}
                          </Text>
                        );
                      })}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Highlighted text appears here once you paste content.
                    </Text>
                  )}
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>

          <Card withBorder padding="lg" radius="md">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Title order={3}>Simplify paragraphs</Title>
                <Text size="sm" c="dimmed">
                  Opt in to AI per paragraph. No streaming, just a clean rewrite.
                </Text>
              </Group>
              {simplifyState.error ? <Text c="red">{simplifyState.error}</Text> : null}
              {paragraphs.length ? (
                <Stack gap="md">
                  {paragraphs.map((paragraph, index) => (
                    <Card key={`${index}-${paragraph.slice(0, 12)}`} withBorder>
                      <Stack gap="sm">
                        <Text fw={600}>Paragraph {index + 1}</Text>
                        <Text>{paragraph}</Text>
                        <Group justify="space-between" align="center">
                          <Button
                            loading={simplifyState.loadingIndex === index}
                            onClick={() => handleSimplify(paragraph, index)}
                          >
                            Simplify this paragraph
                          </Button>
                          {simplifiedMap[index] ? (
                            <Badge color="teal" variant="light">
                              Simplified
                            </Badge>
                          ) : null}
                        </Group>
                        {simplifiedMap[index] ? (
                          <Paper withBorder p="md" bg="gray.0">
                            <Text fw={600} mb="xs">
                              Simplified copy
                            </Text>
                            <Text>{simplifiedMap[index]}</Text>
                          </Paper>
                        ) : null}
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Paste text above to break it into paragraphs.
                </Text>
              )}
            </Stack>
          </Card>
        </Stack>
      </Container>
    </Stack>
  );
}
