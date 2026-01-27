"use client";

import { Button, Group, Paper, Text, Title } from "@mantine/core";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

export default function SiteHeader() {
  const { data: session } = useSession();

  return (
    <Paper withBorder px="lg" py="md">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Link href="/" style={{ textDecoration: "none" }}>
            <Title order={3} c="indigo.8">
              Clarity Companion
            </Title>
          </Link>
          <Text size="sm" c="dimmed">
            Reading simplifier with opt-in AI
          </Text>
        </Group>
        <Group gap="sm">
          <Button component={Link} variant="subtle" href="/pricing">
            Pricing
          </Button>
          <Button component={Link} variant="subtle" href="/account">
            Account
          </Button>
          {session?.user ? (
            <Button variant="light" onClick={() => signOut()}>
              Sign out
            </Button>
          ) : (
            <Group gap="xs">
              <Button variant="light" onClick={() => signIn("google")}>
                Sign in with Google
              </Button>
              <Button variant="outline" onClick={() => signIn("github")}>
                Sign in with GitHub
              </Button>
            </Group>
          )}
        </Group>
      </Group>
    </Paper>
  );
}
