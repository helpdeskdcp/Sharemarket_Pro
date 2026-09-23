// Direction + capacity research on level breakouts (research only; does not
// touch the live engine).
//
// Candidates: fresh 5-min closes through the opening-range high/low or the
// previous-day high/low, inside the live v2 entry window.
// Pre-entry filters:
//   TREND - previous close vs 20-day average of daily closes agrees with the breakout
//   MOM   - previous close vs close 5 sessions earlier agrees with the breakout
//   ROOM  - today's range has not yet reached ADR20 in the breakout direction
// Trade management grid (in 5-min ATR): stop 1/2/3, target 2/4/6, breakeven on/off.
// Every result is net of a round-trip cost in ATR (default 0.25) and in ATR units.
// Settings are chosen on the first 60% of sessions and judged on the last 40%.
//
// Contract-roll days (continuous futures) are excluded from trading, the
// session after a roll gets no previous-day levels, and daily closes are
// back-adjusted across rolls for the trend filters.
//
// Usage: npx tsx scripts/research-edge.ts <csv> <symbol> <NSE|MCX> [rollDays,...] [costAtr]
import fs from 'fs';
import { RULES_V2, SignalMarket } from '../src/services/signalRules';

const [csvPath, symbol, marketArg = 'NSE', rollArg = '', costArg = '0.25'] = process.argv.slice(2);
const market = marketArg as SignalMarket;
const ROLL = new Set(rollArg.split(',').filter(Boolean));
const COST_ATR = Number(costArg);
const SESSION: Record<SignalMarket, [number, number]> = { NSE: [9 * 60 + 15, 15 * 60 + 25], MCX: [9 * 60, 23 * 60 + 25] };
const SQUARE_OFF = market === 'MCX' ? 23 * 60 + 15 : 15 * 60 + 15;
const WINDOW = RULES_V2.entryWindow[market];

interface Bar { minutes: number; date: string; open: number; high: number; low: number; close: number }

// ---- load ----------------------------------------------------------------------
const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const header = lines[0].toLowerCase().split(',');
const idx = (n: string) => header.indexOf(n);
const bars: Bar[] = [];
for (const line of lines.slice(1)) {
  const f = line.split(',');
  const d = f[idx('date')];
  const minutes = Number(d.slice(11, 13)) * 60 + Number(d.slice(14, 16));
  if (minutes < SESSION[market][0] || minutes > SESSION[market][1]) continue;
  const [open, high, low, close] = ['open', 'high', 'low', 'close'].map(n => Number(f[idx(n)]));
  if (!(open > 0 && high > 0 && low > 0 && close > 0)) continue;
  bars.push({ minutes, date: d.slice(0, 10), open, high, low, close });
}

const days: { date: string; s: number; e: number }[] = [];
bars.forEach((b, i) => {
  const last = days[days.length - 1];
  if (!last || last.date !== b.date) days.push({ date: b.date, s: i, e: i });
  else last.e = i;
});
const dayHigh = days.map(d => Math.max(...bars.slice(d.s, d.e + 1).map(b => b.high)));
const dayLow = days.map(d => Math.min(...bars.slice(d.s, d.e + 1).map(b => b.low)));
const dayClose = days.map(d => bars[d.e].close);

// Back-adjusted daily closes: scale everything before a roll by the roll gap
const adjClose = [...dayClose];
for (let k = days.length - 1; k >= 1; k--) {
  if (ROLL.has(days[k].date)) {
    const ratio = bars[days[k].s].open / dayClose[k - 1];
    for (let j = 0; j < k; j++) adjClose[j] *= ratio;
  }
}
const noTrade = new Set<string>();
days.forEach((d, k) => {
  if (ROLL.has(d.date)) noTrade.add(d.date);
});
const noPrevLevels = new Set(days.filter((d, k) => k > 0 && ROLL.has(days[k - 1].date)).map(d => d.date));

// ---- candidates -------------------------------------------------------------------
interface Cand {
  date: string;
  dir: 1 | -1;
  trend: boolean;
  mom: boolean;
  room: boolean;
  atr: number;
  entry: number;
  path: [number, number, number][]; // high, low, close of each later bar until square-off
}
const cands: Cand[] = [];
for (let k = 21; k < days.length; k++) {
  const day = days[k];
  if (noTrade.has(day.date) || day.e - day.s < 20) continue;
  const prior = [];
  for (let j = k - 1; j >= 0 && prior.length < 20; j--) if (!noTrade.has(days[j].date)) prior.push(j);
  if (prior.length < 20) continue;
  const adr = prior.reduce((s, j) => s + (dayHigh[j] - dayLow[j]), 0) / prior.length;
  const sma20 = prior.reduce((s, j) => s + adjClose[j], 0) / prior.length;
  const prevClose = adjClose[k - 1];
  const trendDir = Math.sign(prevClose - sma20);
  const momDir = Math.sign(prevClose - adjClose[k - 6]);

  const orEnd = day.s + 2;
  const orH = Math.max(...bars.slice(day.s, orEnd + 1).map(b => b.high));
  const orL = Math.min(...bars.slice(day.s, orEnd + 1).map(b => b.low));
  const levels: [number, 1 | -1][] = [[orH, 1], [orL, -1]];
  if (!noPrevLevels.has(day.date)) levels.push([dayHigh[k - 1], 1], [dayLow[k - 1], -1]);

  let hi = orH;
  let lo = orL;
  for (let i = orEnd + 1; i <= day.e; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    hi = Math.max(hi, b.high);
    lo = Math.min(lo, b.low);
    const closeMinutes = b.minutes + 5;
    if (closeMinutes < WINDOW.start || closeMinutes > WINDOW.end || i < 14) continue;
    for (const [level, dir] of levels) {
      if (!(dir * (p.close - level) <= 0 && dir * (b.close - level) > 0)) continue;
      const atr = bars.slice(i - 13, i + 1).reduce((s, x) => s + x.high - x.low, 0) / 14;
      if (!(atr > 0)) continue;
      const room = dir === 1 ? lo + adr - b.close : b.close - (hi - adr);
      const path: [number, number, number][] = [];
      for (let j = i + 1; j <= day.e; j++) {
        path.push([bars[j].high, bars[j].low, bars[j].close]);
        if (bars[j].minutes + 5 >= SQUARE_OFF) break;
      }
      cands.push({ date: day.date, dir, trend: trendDir === dir, mom: momDir === dir, room: room >= 0, atr, entry: b.close, path });
    }
  }
}

// ---- simulation ---------------------------------------------------------------------
// Result in ATR units, net of cost. Stop first when a bar touches both.
function run(c: Cand, sl: number, tgt: number, be: boolean): number {
  const { dir, entry, atr } = c;
  let stop = entry - dir * sl * atr;
  const target = entry + dir * tgt * atr;
  let result = 0;
  let exited = false;
  for (const [h, l, cl] of c.path) {
    const worst = dir === 1 ? l : h;
    const best = dir === 1 ? h : l;
    if (dir * (worst - stop) <= 0) { result = (dir * (stop - entry)) / atr; exited = true; break; }
    if (dir * (best - target) >= 0) { result = tgt; exited = true; break; }
    if (be && dir * (best - (entry + dir * sl * atr)) >= 0 && dir * (stop - entry) < 0) stop = entry;
    result = (dir * (cl - entry)) / atr;
  }
  if (!exited && !c.path.length) result = 0;
  return result - COST_ATR;
}

const filters: Record<string, (c: Cand) => boolean> = {
  ALL: () => true,
  TREND: c => c.trend,
  MOM: c => c.mom,
  ROOM: c => c.room,
  'TREND+ROOM': c => c.trend && c.room,
  'MOM+ROOM': c => c.mom && c.room,
  'TREND+MOM': c => c.trend && c.mom,
  'TREND+MOM+ROOM': c => c.trend && c.mom && c.room,
};
const grid: { sl: number; tgt: number; be: boolean }[] = [];
for (const sl of [1, 2, 3]) for (const tgt of [2, 4, 6]) for (const be of [false, true]) grid.push({ sl, tgt, be });

const dates = [...new Set(cands.map(c => c.date))].sort();
const split = dates[Math.floor(dates.length * 0.6)];
const disc = cands.filter(c => c.date < split);
const hold = cands.filter(c => c.date >= split);

function stats(list: Cand[], m: { sl: number; tgt: number; be: boolean }) {
  const r = list.map(c => run(c, m.sl, m.tgt, m.be));
  const n = r.length;
  const mean = n ? r.reduce((s, x) => s + x, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0, win: n ? (r.filter(x => x > 0).length / n) * 100 : 0 };
}
const fmt = (s: ReturnType<typeof stats>) =>
  `n ${String(s.n).padStart(5)} win ${s.win.toFixed(0).padStart(2)}% avg ${s.mean >= 0 ? '+' : ''}${s.mean.toFixed(3)} ATR t ${s.t >= 0 ? '+' : ''}${s.t.toFixed(1)}`;
const mname = (m: { sl: number; tgt: number; be: boolean }) => `SL ${m.sl} T ${m.tgt}${m.be ? ' BE' : '   '}`;

console.log(`${symbol}: ${days.length} sessions ${days[0].date}..${days[days.length - 1].date} | ${cands.length} breakout candidates | cost ${COST_ATR} ATR/trade`);
console.log(`discovery < ${split} (${disc.length}) | holdout >= ${split} (${hold.length})\n`);

console.log('=== Filters with the live-style management (SL 1, T 2, BE) ===');
for (const [name, f] of Object.entries(filters)) {
  const m = { sl: 1, tgt: 2, be: true };
  console.log(`${name.padEnd(15)} disc ${fmt(stats(disc.filter(f), m))} | hold ${fmt(stats(hold.filter(f), m))}`);
}

console.log('\n=== Best management per filter, chosen on discovery only, judged on holdout ===');
let positiveDisc = 0;
let positiveBoth = 0;
for (const [name, f] of Object.entries(filters)) {
  const d = disc.filter(f);
  const h = hold.filter(f);
  let best = grid[0];
  let bestMean = -Infinity;
  for (const m of grid) {
    const sd = stats(d, m);
    const sh = stats(h, m);
    if (sd.mean > 0) {
      positiveDisc++;
      if (sh.mean > 0) positiveBoth++;
    }
    if (sd.n >= 30 && sd.mean > bestMean) { bestMean = sd.mean; best = m; }
  }
  const sh = stats(h, best);
  console.log(`${name.padEnd(15)} ${mname(best)} | disc ${fmt(stats(d, best))} | hold ${fmt(sh)}${sh.mean > 0 && sh.t > 2 ? '  <- holds (t>2)' : sh.mean > 0 ? '  (positive, weak)' : ''}`);
}
console.log(`\nRobustness: ${positiveDisc} of ${Object.keys(filters).length * grid.length} filter x management combos were profitable on discovery; ${positiveBoth} of those stayed profitable on holdout.`);
