export function parseComparableVersion(version: string): number[] | null {
  const core = version.trim().split("-")[0] ?? "";
  if (!core) {
    return null;
  }

  const parts = core.split(".");
  if (!parts.length) {
    return null;
  }

  const parsed: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    parsed.push(Number(part));
  }
  return parsed;
}

export function isNewerVersion(localVersion: string, remoteVersion: string): boolean {
  const local = parseComparableVersion(localVersion);
  const remote = parseComparableVersion(remoteVersion);
  if (!local || !remote) {
    return false;
  }

  const maxLength = Math.max(local.length, remote.length);
  for (let index = 0; index < maxLength; index += 1) {
    const localPart = local[index] ?? 0;
    const remotePart = remote[index] ?? 0;
    if (remotePart > localPart) {
      return true;
    }
    if (remotePart < localPart) {
      return false;
    }
  }
  return false;
}
