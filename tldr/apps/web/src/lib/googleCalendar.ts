export type GoogleCalendarTemplateEvent = {
  title: string;
  start?: string | null;
  end?: string | null;
  timezone?: string | null;
  location?: string | null;
  details?: string | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcDateTimeForGoogle(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function formatDateOnlyForGoogle(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function parseDateTime(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function buildGoogleCalendarTemplateUrl(event: GoogleCalendarTemplateEvent): string {
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", event.title);

  if (event.details) {
    params.set("details", event.details);
  }
  if (event.location) {
    params.set("location", event.location);
  }
  if (event.timezone && /^[A-Za-z_]+\/[A-Za-z_]+/.test(event.timezone)) {
    params.set("ctz", event.timezone);
  }

  const startDateOnly = event.start ? parseDateOnly(event.start) : null;
  const endDateOnly = event.end ? parseDateOnly(event.end) : null;
  if (startDateOnly) {
    const end = endDateOnly
      ? endDateOnly
      : new Date(startDateOnly.getTime() + 24 * 60 * 60 * 1000);
    params.set("dates", `${formatDateOnlyForGoogle(startDateOnly)}/${formatDateOnlyForGoogle(end)}`);
  } else {
    const startDateTime = event.start ? parseDateTime(event.start) : null;
    if (startDateTime) {
      const endDateTime = event.end ? parseDateTime(event.end) : null;
      const end = endDateTime && endDateTime.getTime() > startDateTime.getTime()
        ? endDateTime
        : new Date(startDateTime.getTime() + 60 * 60 * 1000);
      params.set("dates", `${formatUtcDateTimeForGoogle(startDateTime)}/${formatUtcDateTimeForGoogle(end)}`);
    }
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}