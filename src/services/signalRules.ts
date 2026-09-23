import { AngelCandle } from './angelOneApi';

// Breakout detection rules shared by the live engine (liveSignalEngine.ts)
// and the historical replay, so both always apply exactly the same logic.

export type SignalMarket = 'NSE' | 'MCX';

export interface RuleSet {
  name: string;
  minBodyPct: number;
  maxAgainstWickPct: number;
  // Breakout candle must close at least this many ATRs beyond the level (0 = off)
  minExtensionAtr: number;
  maxExtensionAtr: number;
  // Enter only after the next candle also closes beyond the level
  requireConfirmation: boolean;
  // Skip futures whose median 5-min volume (recent candles) is below this (0 = off)
  minMedianVolume: number;
  // IST minutes-of-day window for new entries
  entryWindow: Record<SignalMarket, { start: number; end: number }>;
  // Move SL to cost once premium is this many risk-multiples in profit (null = off)
  breakevenAtR: number | null;
}

// Original rules (live until 23 Sep 2026), kept for replay comparison
export const RULES_V1: RuleSet = {
  name: 'v1',
  minBodyPct: 50,
  maxAgainstWickPct: 30,
  minExtensionAtr: 0,
  maxExtensionAtr: 1,
  requireConfirmation: false,
  minMedianVolume: 0,
  entryWindow: {
    NSE: { start: 9 * 60 + 30, end: 14 * 60 + 45 },
    MCX: { start: 9 * 60 + 15, end: 22 * 60 + 30 },
  },
  breakevenAtR: null,
};

// After the 23 Sep 2026 review: weak 0.1-pt breakouts, no follow-through,
// late NSE entries, thin futures volume and no profit protection.
export const RULES_V2: RuleSet = {
  name: 'v2',
  minBodyPct: 50,
  maxAgainstWickPct: 30,
  minExtensionAtr: 0.25,
  maxExtensionAtr: 1,
  requireConfirmation: true,
  minMedianVolume: 20,
  entryWindow: {
    NSE: { start: 9 * 60 + 30, end: 13 * 60 + 30 },
    MCX: { start: 9 * 60 + 15, end: 21 * 60 + 30 },
  },
  breakevenAtR: 1,
};

export const ACTIVE_RULES = RULES_V2;

export interface BreakoutSetup {
  bias: 'BULLISH' | 'BEARISH';
  level: number;
  levelName: string;
  levels: [string, number][];
  atr: number;
  volumeMultiplier: number;
  medianVolume: number;
  bodyPct: number;
  againstWickPct: number;
  extensionAtr: number;
  breakoutCandle: AngelCandle;
  entryCandle: AngelCandle; // confirmation candle (or the breakout candle when confirmation is off)
  underlyingRisk: number; // entry reference to structural stop, in underlying points
}

export function istMinutesOf(ms: number): number {
  const ist = new Date(ms + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const round2 = (n: number) => Number(n.toFixed(2));

// Evaluates the most recent candles in `closed` (all fully closed 5-min
// candles, oldest first). Returns the setup, or the reason there is none.
export function detectBreakout(
  closed: AngelCandle[],
  today: string,
  volumeThreshold: number,
  rules: RuleSet
): BreakoutSetup | string {
  const offset = rules.requireConfirmation ? 1 : 0;
  const entryCandle = closed[closed.length - 1];
  const b = closed[closed.length - 1 - offset];
  const p = closed[closed.length - 2 - offset];
  if (!entryCandle || !b || !p || entryCandle.dateKey !== today || b.dateKey !== today) return 'no closed candle today';

  const todayCandles = closed.filter(x => x.dateKey === today);
  const prevDate = [...new Set(closed.map(x => x.dateKey))].filter(d => d < today).pop();
  const prevCandles = closed.filter(x => x.dateKey === prevDate);
  const openingRange = todayCandles.slice(0, 3);
  if (openingRange.length < 3 || prevCandles.length === 0) return 'opening range not complete';
  if (b.ts <= openingRange[2].ts) return 'opening range not complete';

  const bIndex = closed.length - 1 - offset;
  const history = closed.slice(0, bIndex); // candles before the breakout candle
  const recent = closed.slice(Math.max(0, bIndex - 13), bIndex + 1);
  const atr = recent.reduce((sum, x) => sum + (x.high - x.low), 0) / recent.length;
  const prior = history.slice(-20);
  const avgVolume = prior.reduce((sum, x) => sum + x.volume, 0) / (prior.length || 1);
  const volumeMultiplier = avgVolume > 0 ? round2(b.volume / avgVolume) : 0;
  const medianVolume = median(history.slice(-75).map(x => x.volume));

  if (rules.minMedianVolume > 0 && medianVolume < rules.minMedianVolume) {
    return `illiquid future (median volume ${medianVolume} < ${rules.minMedianVolume})`;
  }

  const range = b.high - b.low;
  if (range <= 0 || atr <= 0) return 'flat candle';
  const bodyPct = (Math.abs(b.close - b.open) / range) * 100;
  const upperWickPct = ((b.high - Math.max(b.open, b.close)) / range) * 100;
  const lowerWickPct = ((Math.min(b.open, b.close) - b.low) / range) * 100;

  const pdh = Math.max(...prevCandles.map(x => x.high));
  const pdl = Math.min(...prevCandles.map(x => x.low));
  const orh = Math.max(...openingRange.map(x => x.high));
  const orl = Math.min(...openingRange.map(x => x.low));

  const bullLevels = ([['Opening range high', orh], ['Previous day high', pdh]] as [string, number][])
    .filter(([, level]) => p.close <= level && b.close > level);
  const bearLevels = ([['Opening range low', orl], ['Previous day low', pdl]] as [string, number][])
    .filter(([, level]) => p.close >= level && b.close < level);

  let bias: 'BULLISH' | 'BEARISH';
  let levels: [string, number][];
  if (bullLevels.length && b.close > b.open) {
    bias = 'BULLISH';
    levels = bullLevels;
  } else if (bearLevels.length && b.close < b.open) {
    bias = 'BEARISH';
    levels = bearLevels;
  } else {
    return 'no level crossed';
  }

  // Strongest level crossed: highest for breakouts, lowest for breakdowns
  const [levelName, level] = [...levels].sort((x, y) => (bias === 'BULLISH' ? y[1] - x[1] : x[1] - y[1]))[0];
  const againstWickPct = bias === 'BULLISH' ? upperWickPct : lowerWickPct;
  const extensionAtr = Math.abs(b.close - level) / atr;

  if (bodyPct < rules.minBodyPct) return `body ${bodyPct.toFixed(0)}% < ${rules.minBodyPct}%`;
  if (againstWickPct > rules.maxAgainstWickPct) return `rejection wick ${againstWickPct.toFixed(0)}%`;
  if (volumeMultiplier < volumeThreshold) return `volume ${volumeMultiplier}x < ${volumeThreshold}x`;
  if (extensionAtr < rules.minExtensionAtr) return `weak breakout (${extensionAtr.toFixed(2)} ATR beyond level)`;
  if (extensionAtr > rules.maxExtensionAtr) return 'close too far beyond level';

  if (rules.requireConfirmation) {
    const holds = bias === 'BULLISH' ? entryCandle.close > level : entryCandle.close < level;
    if (!holds) return 'breakout not confirmed by next candle';
  }

  const structuralStop = bias === 'BULLISH' ? Math.min(b.low, entryCandle.low) : Math.max(b.high, entryCandle.high);
  const underlyingRisk = Math.max(Math.abs(entryCandle.close - structuralStop), 0.25 * atr);

  return {
    bias,
    level,
    levelName,
    levels,
    atr,
    volumeMultiplier,
    medianVolume,
    bodyPct,
    againstWickPct,
    extensionAtr,
    breakoutCandle: b,
    entryCandle,
    underlyingRisk,
  };
}
