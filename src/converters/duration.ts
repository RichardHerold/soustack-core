const DURATION_REGEX =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;

export function parseISODuration(duration?: string | null): number | undefined {
  if (!duration || typeof duration !== 'string') return undefined;
  const match = duration.trim().match(DURATION_REGEX);
  if (!match) return undefined;

  const days = match[1] ? parseInt(match[1], 10) : 0;
  const hours = match[2] ? parseInt(match[2], 10) : 0;
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  const seconds = match[4] ? parseInt(match[4], 10) : 0;

  const totalMinutes = days * 24 * 60 + hours * 60 + minutes + seconds / 60;
  return totalMinutes || undefined;
}

export function minutesToISODuration(minutes?: number | null): string | undefined {
  if (minutes === undefined || minutes === null || Number.isNaN(minutes)) {
    return undefined;
  }

  const totalMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  const segments = [];
  if (hours) segments.push(`${hours}H`);
  if (remainingMinutes) segments.push(`${remainingMinutes}M`);

  if (!segments.length) {
    return 'PT0M';
  }

  return `PT${segments.join('')}`;
}
