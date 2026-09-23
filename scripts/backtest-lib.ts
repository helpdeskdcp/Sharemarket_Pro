// Shared replay logic for scripts/replay-signals.ts (recent Angel One
// candles) and scripts/backtest-history.ts (long CSV history). Walks 5-min
// candles one at a time with the live engine's rules (signalRules.ts) and
// trade management, and measures outcomes in R on the underlying.
import { AngelCandle } from '../src/services/angelOneApi';
import { detectBreakout, istMinutesOf, RuleSet, SignalMarket } from '../src/services/signalRules';

export const CANDLE_MS = 5 * 60 * 1000;
export const SQUARE_OFF: Record<SignalMarket, number> = { NSE: 15 * 60 + 15, MCX: 23 * 60 + 15 };
const MIN_GAP_MS = 30 * 60 * 1000;
// detectBreakout needs the previous session plus today; 400 candles covers
// two full MCX sessions (~170 candles each)
const WINDOW = 400;

export interface Trade {
  symbol: string;
  market: SignalMarket;
  date: string;
  time: string;
  bias: string;
  levelName: string;
  resultR: number;
  exit: string;
  riskPts: number; // underlying points between entry and stop (1R)
}

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

// Follows the underlying after entry with the live engine's stop/target logic.
export function simulate(
  after: AngelCandle[],
  entry: number,
  risk: number,
  bullish: boolean,
  rules: RuleSet,
  market: SignalMarket
): { r: number; exit: string } {
  const dir = bullish ? 1 : -1;
  const at = (mult: number) => entry + dir * mult * risk;
  let stop = at(-1);
  let t1 = false;
  let t2 = false;
  const moveR = (price: number) => (dir * (price - entry)) / risk;

  for (const c of after) {
    const worst = bullish ? c.low : c.high;
    const best = bullish ? c.high : c.low;
    // Conservative: when a candle touches both, assume the stop came first
    if (dir * (worst - stop) <= 0) {
      const r = moveR(stop);
      return { r, exit: t1 ? 'trailing stop' : r >= 0 ? 'stop at cost' : 'stop loss' };
    }
    if (dir * (best - at(4)) >= 0) return { r: 4, exit: 'target 4' };
    if (!t2 && dir * (best - at(3)) >= 0) {
      t1 = t2 = true;
      stop = at(2);
    } else if (!t1 && dir * (best - at(2)) >= 0) {
      t1 = true;
      stop = at(rules.breakevenAtR !== null ? 1 : 0);
    } else if (rules.breakevenAtR !== null && dir * (best - at(rules.breakevenAtR)) >= 0 && dir * (stop - entry) < 0) {
      stop = entry;
    }
    if (istMinutesOf(c.ts + CANDLE_MS) >= SQUARE_OFF[market]) return { r: moveR(c.close), exit: 'square-off' };
  }
  const last = after[after.length - 1];
  return { r: last ? moveR(last.close) : 0, exit: 'data end' };
}

// Replays one underlying: one open trade at a time, daily signal limit and a
// 30-minute gap between signals, as in the live engine.
export function replayCandles(
  symbol: string,
  market: SignalMarket,
  candles: AngelCandle[],
  rules: RuleSet,
  opts: { dailyLimit: number; volumeThreshold: number; warmupCandles: number }
): Trade[] {
  const trades: Trade[] = [];
  let openUntil = 0;
  let lastSignalAt = 0;
  const perDay: Record<string, number> = {};
  const firstDay = candles.length ? candles[Math.min(candles.length - 1, opts.warmupCandles)].dateKey : '';
  const win = rules.entryWindow[market];

  for (let i = 30; i < candles.length; i++) {
    const c = candles[i];
    if (c.dateKey < firstDay) continue;
    const closeAt = c.ts + CANDLE_MS;
    const minutes = istMinutesOf(closeAt);
    if (minutes < win.start || minutes > win.end) continue;
    if (closeAt < openUntil || closeAt - lastSignalAt < MIN_GAP_MS) continue;
    if ((perDay[c.dateKey] || 0) >= opts.dailyLimit) continue;

    const setup = detectBreakout(candles.slice(Math.max(0, i + 1 - WINDOW), i + 1), c.dateKey, opts.volumeThreshold, rules);
    if (typeof setup === 'string') continue;

    // Same-day candles after entry (stop scanning at the next session)
    const after: AngelCandle[] = [];
    for (let j = i + 1; j < candles.length && candles[j].dateKey === c.dateKey; j++) after.push(candles[j]);
    const outcome = simulate(after, setup.entryCandle.close, setup.underlyingRisk, setup.bias === 'BULLISH', rules, market);
    const exitIndex = after.findIndex(x => istMinutesOf(x.ts + CANDLE_MS) >= SQUARE_OFF[market]);
    openUntil = exitIndex >= 0 ? after[exitIndex].ts + CANDLE_MS : closeAt + 60 * 60 * 1000;
    lastSignalAt = closeAt;
    perDay[c.dateKey] = (perDay[c.dateKey] || 0) + 1;
    trades.push({
      symbol,
      market,
      date: c.dateKey,
      time: hhmm(closeAt),
      bias: setup.bias,
      levelName: setup.levelName,
      resultR: Number(outcome.r.toFixed(2)),
      exit: outcome.exit,
      riskPts: Number(setup.underlyingRisk.toFixed(2)),
    });
  }
  return trades;
}

export interface TradeStats {
  count: number;
  wins: number;
  losses: number;
  flat: number;
  winRate: number;
  netR: number;
  avgR: number;
  maxDrawdownR: number;
  worstLosingStreak: number;
}

export function tradeStats(trades: Trade[], costR = 0): TradeStats {
  const results = trades.map(t => t.resultR - costR);
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  let streak = 0;
  let worstLosingStreak = 0;
  for (const r of results) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
    streak = r < 0 ? streak + 1 : 0;
    worstLosingStreak = Math.max(worstLosingStreak, streak);
  }
  const wins = results.filter(r => r > 0).length;
  const losses = results.filter(r => r < 0).length;
  const netR = results.reduce((s, r) => s + r, 0);
  return {
    count: results.length,
    wins,
    losses,
    flat: results.length - wins - losses,
    winRate: results.length ? (wins / results.length) * 100 : 0,
    netR,
    avgR: results.length ? netR / results.length : 0,
    maxDrawdownR,
    worstLosingStreak,
  };
}

export function formatStats(label: string, s: TradeStats, perDay?: number): string {
  return (
    `${label.padEnd(12)} signals ${String(s.count).padStart(4)}${perDay !== undefined ? ` (${perDay.toFixed(2)}/day)` : ''}` +
    ` | W ${s.wins} L ${s.losses} flat ${s.flat} | win ${s.winRate.toFixed(0)}%` +
    ` | net ${s.netR >= 0 ? '+' : ''}${s.netR.toFixed(1)}R avg ${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R` +
    ` | maxDD ${s.maxDrawdownR.toFixed(1)}R | worst streak ${s.worstLosingStreak}`
  );
}
