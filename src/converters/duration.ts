import { formatDuration, parseDuration } from '../parsers/duration';

export function parseISODuration(duration?: string | null): number | undefined {
  const parsed = parseDuration(duration ?? '');
  return parsed ?? undefined;
}

export function minutesToISODuration(minutes?: number | null): string | undefined {
  if (minutes === undefined || minutes === null || Number.isNaN(minutes)) {
    return undefined;
  }
  return formatDuration(minutes);
}
