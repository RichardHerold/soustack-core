const ISO_DURATION_REGEX =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

const HUMAN_OVERNIGHT = 8 * 60; // 8 hours

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseDuration(iso: string): number | null;
export function parseDuration(iso: string | null | undefined): number | null;
export function parseDuration(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;

  const trimmed = iso.trim();
  if (!trimmed) return null;

  const match = trimmed.match(ISO_DURATION_REGEX);
  if (!match) return null;

  const [, daysRaw, hoursRaw, minutesRaw, secondsRaw] = match;

  if (!daysRaw && !hoursRaw && !minutesRaw && !secondsRaw) {
    return null;
  }

  let total = 0;
  if (daysRaw) total += parseFloat(daysRaw) * 24 * 60;
  if (hoursRaw) total += parseFloat(hoursRaw) * 60;
  if (minutesRaw) total += parseFloat(minutesRaw);
  if (secondsRaw) total += Math.ceil(parseFloat(secondsRaw) / 60);

  return Math.round(total);
}

export function formatDuration(minutes: number): string;
export function formatDuration(minutes: number | null | undefined): string;
export function formatDuration(minutes: number | null | undefined): string {
  if (!isFiniteNumber(minutes) || minutes <= 0) {
    return 'PT0M';
  }

  const rounded = Math.round(minutes);
  const days = Math.floor(rounded / (24 * 60));
  const afterDays = rounded % (24 * 60);
  const hours = Math.floor(afterDays / 60);
  const mins = afterDays % 60;

  let result = 'P';

  if (days > 0) {
    result += `${days}D`;
  }

  if (hours > 0 || mins > 0) {
    result += 'T';
    if (hours > 0) {
      result += `${hours}H`;
    }
    if (mins > 0) {
      result += `${mins}M`;
    }
  }

  if (result === 'P') {
    return 'PT0M';
  }

  return result;
}

export function parseHumanDuration(text: string): number | null;
export function parseHumanDuration(text: string | null | undefined): number | null;
export function parseHumanDuration(text: string | null | undefined): number | null {
  if (!text || typeof text !== 'string') return null;

  const normalized = text.toLowerCase().trim();
  if (!normalized) return null;

  if (normalized === 'overnight') {
    return HUMAN_OVERNIGHT;
  }

  let total = 0;

  const hourRegex = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/g;
  let hourMatch: RegExpExecArray | null;
  while ((hourMatch = hourRegex.exec(normalized)) !== null) {
    total += parseFloat(hourMatch[1]) * 60;
  }

  const minuteRegex = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/g;
  let minuteMatch: RegExpExecArray | null;
  while ((minuteMatch = minuteRegex.exec(normalized)) !== null) {
    total += parseFloat(minuteMatch[1]);
  }

  if (total <= 0) {
    return null;
  }

  return Math.round(total);
}

export function smartParseDuration(input: string): number | null;
export function smartParseDuration(input: string | null | undefined): number | null;
export function smartParseDuration(input: string | null | undefined): number | null {
  const iso = parseDuration(input);
  if (iso !== null) {
    return iso;
  }
  return parseHumanDuration(input);
}
