const DEFAULT_UNITS_IN_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000
};

export function parseDurationToMs(input: string | number | undefined, fallbackMs: number): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(0, input * 1000);
  }

  if (typeof input !== "string") {
    return fallbackMs;
  }

  if (!input) {
    return fallbackMs;
  }

  const trimmed = input.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }

  const match = /^(\d+)(ms|s|m|h|d|w)$/.exec(trimmed);
  if (!match) {
    return fallbackMs;
  }

  const value = Number.parseInt(match[1], 10);
  const multiplier = DEFAULT_UNITS_IN_MS[match[2]];
  return value * multiplier;
}
