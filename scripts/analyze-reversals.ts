// Continuation vs reversal study of level breakouts on 5-min futures candles.
//
// For every fresh 5-min close through the opening-range high/low or the
// previous-day high/low, both trades are simulated from the same entry with
// the same risk (1R = 1 x ATR14): the breakout trade (CE for an upside
// break) and the opposite trade (PE). Each candidate is labelled
// CONT (breakout +2R first), REV (opposite +2R first) or CHOP.
// Features use only candles up to and including the entry candle.
// Features are ranked on the first 60% of sessions (discovery) and checked,
// unchanged, on the last 40% (holdout).
//
// Usage: npx tsx scripts/analyze-reversals.ts <candles.json> <symbol> <MCX|NSE> [rollDay,rollDay,...] [candidates-out.json]
import fs from 'fs';
import { AngelCandle } from '../src/services/angelOneApi';
import { istMinutesOf, RULES_V2, SignalMarket } from '../src/services/signalRules';

const [jsonPath, symbol = 'NATURALGAS', marketArg = 'MCX', rollArg = '', outPath = ''] = process.argv.slice(2);
const market = marketArg as SignalMarket;
const ROLL_DAYS = new Set(rollArg.split(',').filter(Boolean));
const CANDLE_MS = 5 * 60 * 1000;
const SQUARE_OFF = market === 'MCX' ? 23 * 60 + 15 : 15 * 60 + 15;
const WINDOW = RULES_V2.entryWindow[market];
const DISCOVERY_SHARE = 0.6;

const candles: AngelCandle[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
candles.sort((a, b) => a.ts - b.ts);

// ---- index sessions --------------------------------------------------------
const sessions: { date: string; start: number; end: number }[] = [];
for (let i = 0; i < candles.length; i++) {
  const last = sessions[sessions.length - 1];
  if (!last || last.date !== candles[i].dateKey) sessions.push({ date: candles[i].dateKey, start: i, end: i });
  else last.end = i;
}

interface Candidate {
  date: string;
  time: string;
  bias: 'BULL' | 'BEAR';
  level: string;
  label: 'CONT' | 'REV' | 'CHOP';
  breakoutR: number; // realised R of the breakout trade (+2 / -1 / square-off mark)
  fadeR: number; // realised R of the opposite trade
  breakoutLost: boolean;
  features: Record<string, number>;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}
const closes = candles.map(c => c.close);
const ema20 = ema(closes, 20);

// Simulates one direction from entry with SL 1R / target 2R until square-off.
function play(from: number, end: number, entry: number, risk: number, dir: 1 | -1): { r: number; hitSl: boolean } {
  for (let j = from; j <= end; j++) {
    const c = candles[j];
    const worst = dir === 1 ? c.low : c.high;
    const best = dir === 1 ? c.high : c.low;
    if (dir * (worst - (entry - dir * risk)) <= 0) return { r: -1, hitSl: true }; // stop first when both touched
    if (dir * (best - (entry + dir * 2 * risk)) >= 0) return { r: 2, hitSl: false };
    if (istMinutesOf(c.ts + CANDLE_MS) >= SQUARE_OFF) return { r: (dir * (c.close - entry)) / risk, hitSl: false };
  }
  return { r: (dir * (candles[end].close - entry)) / risk, hitSl: false };
}

// ---- build candidates ----------------------------------------------------------
const candidates: Candidate[] = [];
for (let s = 1; s < sessions.length; s++) {
  const day = sessions[s];
  const prev = sessions[s - 1];
  if (ROLL_DAYS.has(day.date)) continue; // levels/ATR would mix two contracts
  if (day.end - day.start < 20) continue; // partial/special session
  const prevHigh = Math.max(...candles.slice(prev.start, prev.end + 1).map(c => c.high));
  const prevLow = Math.min(...candles.slice(prev.start, prev.end + 1).map(c => c.low));
  const prevClose = candles[prev.end].close;
  const orEnd = day.start + 2;
  const orHigh = Math.max(...candles.slice(day.start, orEnd + 1).map(c => c.high));
  const orLow = Math.min(...candles.slice(day.start, orEnd + 1).map(c => c.low));
  const dayOpen = candles[day.start].open;
  const levels: [string, number, 'BULL' | 'BEAR'][] = [
    ['OR high', orHigh, 'BULL'], ['PD high', prevHigh, 'BULL'],
    ['OR low', orLow, 'BEAR'], ['PD low', prevLow, 'BEAR'],
  ];
  const crosses: Record<string, number> = {};
  let cumPV = 0;
  let cumV = 0;
  for (let i = day.start; i <= orEnd; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += tp * candles[i].volume;
    cumV += candles[i].volume;
  }

  for (let i = orEnd + 1; i <= day.end; i++) {
    const b = candles[i];
    const p = candles[i - 1];
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
    const minutes = istMinutesOf(b.ts + CANDLE_MS);
    if (minutes < WINDOW.start || minutes > WINDOW.end) continue;
    if (i - 20 < 0) continue;

    for (const [name, level, bias] of levels) {
      const dir = bias === 'BULL' ? 1 : -1;
      const crossed = dir * (p.close - level) <= 0 && dir * (b.close - level) > 0;
      if (!crossed) continue;
      const priorCrosses = crosses[name] || 0;
      crosses[name] = priorCrosses + 1;

      const window14 = candles.slice(i - 13, i + 1);
      const atr = avg(window14.map(c => c.high - c.low));
      if (!(atr > 0)) continue;
      const prior20 = candles.slice(i - 20, i);
      const avgVol20 = avg(prior20.map(c => c.volume));
      const range = b.high - b.low || 1e-9;
      const dayCandles = candles.slice(day.start, i + 1);
      const dayHigh = Math.max(...dayCandles.map(c => c.high));
      const dayLow = Math.min(...dayCandles.map(c => c.low));
      const last12 = candles.slice(i - 11, i + 1);
      const withVol = last12.filter(c => dir * (c.close - c.open) > 0).reduce((sum, c) => sum + c.volume, 0);
      const againstVol = last12.filter(c => dir * (c.close - c.open) < 0).reduce((sum, c) => sum + c.volume, 0);
      const vwap = cumV > 0 ? cumPV / cumV : b.close;

      const features: Record<string, number> = {
        extensionAtr: (dir * (b.close - level)) / atr,
        bodyPct: (Math.abs(b.close - b.open) / range) * 100,
        withBody: dir * (b.close - b.open) > 0 ? 1 : 0,
        againstWickPct: ((dir === 1 ? b.high - Math.max(b.open, b.close) : Math.min(b.open, b.close) - b.low) / range) * 100,
        closeLocation: dir === 1 ? (b.close - b.low) / range : (b.high - b.close) / range,
        candleRangeAtr: range / atr,
        volumeSurge: avgVol20 > 0 ? b.volume / avgVol20 : 0,
        volumeBuildup3: avgVol20 > 0 ? avg(candles.slice(i - 3, i).map(c => c.volume)) / avgVol20 : 0,
        volumeVsPrev: p.volume > 0 ? b.volume / p.volume : 0,
        withVsAgainstVol12: againstVol > 0 ? withVol / againstVol : withVol > 0 ? 5 : 1,
        minutesOfDay: istMinutesOf(b.ts),
        dayRangeAtr: (dayHigh - dayLow) / atr,
        travelFromOpenAtr: (dir * (b.close - dayOpen)) / atr,
        gapWithDirAtr: (dir * (dayOpen - prevClose)) / atr,
        priorCrossesToday: priorCrosses,
        vwapDistanceAtr: (dir * (b.close - vwap)) / atr,
        ema20SlopeAtr: (dir * (ema20[i] - ema20[i - 5])) / atr,
        prevDayRangeAtr: (prevHigh - prevLow) / atr,
        atrPctOfPrice: (atr / b.close) * 100,
        isPrevDayLevel: name.startsWith('PD') ? 1 : 0,
      };

      const entry = b.close;
      const risk = atr;
      const brk = play(i + 1, day.end, entry, risk, dir as 1 | -1);
      const fade = play(i + 1, day.end, entry, risk, (-dir) as 1 | -1);
      const label: Candidate['label'] = brk.r >= 2 ? 'CONT' : fade.r >= 2 ? 'REV' : 'CHOP';
      candidates.push({
        date: day.date,
        time: new Date(b.ts + CANDLE_MS).toISOString().slice(11, 16),
        bias,
        level: name,
        label,
        breakoutR: brk.r,
        fadeR: fade.r,
        breakoutLost: brk.hitSl,
        features,
      });
    }
  }
}

// ---- statistics -------------------------------------------------------------------
// Mann-Whitney U: AUC = P(feature of CONT > feature of REV); two-sided p (normal approx)
function mannWhitney(a: number[], b: number[]): { auc: number; p: number } {
  const all = [...a.map(v => ({ v, g: 0 })), ...b.map(v => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const ranks = new Array(all.length);
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    for (let k = i; k <= j; k++) ranks[k] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const rankSumA = all.reduce((s, x, i) => s + (x.g === 0 ? ranks[i] : 0), 0);
  const n1 = a.length;
  const n2 = b.length;
  const u = rankSumA - (n1 * (n1 + 1)) / 2;
  const mean = (n1 * n2) / 2;
  const sd = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sd > 0 ? (u - mean) / sd : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { auc: n1 && n2 ? u / (n1 * n2) : 0.5, p };
}
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const dates = [...new Set(candidates.map(c => c.date))].sort();
const splitDate = dates[Math.floor(dates.length * DISCOVERY_SHARE)];
const discovery = candidates.filter(c => c.date < splitDate);
const holdout = candidates.filter(c => c.date >= splitDate);

console.log(`${symbol}: ${candles.length} candles, ${sessions.length} sessions (${sessions[0].date} .. ${sessions[sessions.length - 1].date}), ${ROLL_DAYS.size} roll days excluded`);
console.log(`Candidates: ${candidates.length} fresh level crosses | discovery < ${splitDate} (${discovery.length}) | holdout >= ${splitDate} (${holdout.length})\n`);

function outcomeTable(label: string, list: Candidate[]) {
  const n = list.length || 1;
  const count = (l: string) => list.filter(c => c.label === l).length;
  const lost = list.filter(c => c.breakoutLost);
  const lostFadeWon = lost.filter(c => c.fadeR >= 2);
  const netBrk = list.reduce((s, c) => s + c.breakoutR, 0);
  const netFade = list.reduce((s, c) => s + c.fadeR, 0);
  console.log(
    `${label.padEnd(10)} n ${String(list.length).padStart(4)} | CONT ${((count('CONT') / n) * 100).toFixed(0)}% REV ${((count('REV') / n) * 100).toFixed(0)}% CHOP ${((count('CHOP') / n) * 100).toFixed(0)}%` +
    ` | breakout lost ${lost.length}, of which opposite won +2R: ${lostFadeWon.length} (${lost.length ? ((lostFadeWon.length / lost.length) * 100).toFixed(0) : 0}%)` +
    ` | avg R breakout ${(netBrk / n).toFixed(2)} opposite ${(netFade / n).toFixed(2)}`
  );
}
console.log('=== Outcomes (1R = 1 ATR, SL 1R, target 2R, both directions from the same entry) ===');
outcomeTable('ALL', candidates);
outcomeTable('discovery', discovery);
outcomeTable('holdout', holdout);
for (const lvl of ['OR high', 'OR low', 'PD high', 'PD low']) outcomeTable(lvl, candidates.filter(c => c.level === lvl));

console.log('\n=== Features: CONT vs REV (AUC > 0.5 = higher in continuations) ===');
console.log('feature'.padEnd(20), 'disc AUC  p      | hold AUC  p      | median CONT / REV (all)   | consistent?');
const featureNames = Object.keys(candidates[0]?.features || {});
const ranked: { name: string; discAuc: number; holdAuc: number; discP: number; holdP: number }[] = [];
for (const f of featureNames) {
  const split = (list: Candidate[]) => ({
    cont: list.filter(c => c.label === 'CONT').map(c => c.features[f]),
    rev: list.filter(c => c.label === 'REV').map(c => c.features[f]),
  });
  const d = split(discovery);
  const h = split(holdout);
  const a = split(candidates);
  const dm = mannWhitney(d.cont, d.rev);
  const hm = mannWhitney(h.cont, h.rev);
  const consistent = dm.p < 0.05 && Math.sign(dm.auc - 0.5) === Math.sign(hm.auc - 0.5) && hm.p < 0.1;
  ranked.push({ name: f, discAuc: dm.auc, holdAuc: hm.auc, discP: dm.p, holdP: hm.p });
  console.log(
    f.padEnd(20),
    `${dm.auc.toFixed(3)}  ${dm.p.toFixed(3)}  | ${hm.auc.toFixed(3)}  ${hm.p.toFixed(3)}  |`,
    `${median(a.cont).toFixed(2).padStart(8)} / ${median(a.rev).toFixed(2).padEnd(8)}      |`,
    consistent ? 'YES' : ''
  );
}

// ---- single-feature rules: threshold fixed on discovery, judged on holdout ---------
console.log('\n=== Single-feature filters (threshold chosen on discovery only; breakout trades, 0.1R cost) ===');
const COST = 0.1;
const tradeR = (list: Candidate[], side: 'breakout' | 'fade') =>
  list.reduce((s, c) => s + (side === 'breakout' ? c.breakoutR : c.fadeR) - COST, 0);
console.log(`baseline: all breakouts   disc n ${discovery.length} avg ${(tradeR(discovery, 'breakout') / (discovery.length || 1)).toFixed(3)}R | hold n ${holdout.length} avg ${(tradeR(holdout, 'breakout') / (holdout.length || 1)).toFixed(3)}R`);
console.log(`baseline: all opposites   disc n ${discovery.length} avg ${(tradeR(discovery, 'fade') / (discovery.length || 1)).toFixed(3)}R | hold n ${holdout.length} avg ${(tradeR(holdout, 'fade') / (holdout.length || 1)).toFixed(3)}R`);
for (const r of ranked.filter(x => x.discP < 0.05).sort((x, y) => x.discP - y.discP)) {
  const higherIsCont = r.discAuc > 0.5;
  const values = [...new Set(discovery.map(c => c.features[r.name]))].sort((a, b) => a - b);
  const qs = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map(q => values[Math.floor(q * (values.length - 1))]);
  let best: { t: number; side: 'breakout' | 'fade'; avg: number; n: number } | null = null;
  for (const t of qs) {
    const contSide = discovery.filter(c => (higherIsCont ? c.features[r.name] >= t : c.features[r.name] <= t));
    const revSide = discovery.filter(c => (higherIsCont ? c.features[r.name] < t : c.features[r.name] > t));
    for (const [side, list] of [['breakout', contSide], ['fade', revSide]] as ['breakout' | 'fade', Candidate[]][]) {
      if (list.length < 30) continue;
      const a = tradeR(list, side) / list.length;
      if (!best || a > best.avg) best = { t, side, avg: a, n: list.length };
    }
  }
  if (!best) continue;
  const b = best;
  const inHold = holdout.filter(c =>
    b.side === 'breakout'
      ? (higherIsCont ? c.features[r.name] >= b.t : c.features[r.name] <= b.t)
      : (higherIsCont ? c.features[r.name] < b.t : c.features[r.name] > b.t)
  );
  const holdAvg = inHold.length ? tradeR(inHold, b.side) / inHold.length : 0;
  const cmp = b.side === 'breakout' ? (higherIsCont ? '>=' : '<=') : (higherIsCont ? '<' : '>');
  console.log(
    `${b.side.padEnd(8)} when ${r.name} ${cmp} ${b.t.toFixed(2)}`.padEnd(52),
    `disc n ${String(b.n).padStart(4)} avg ${b.avg >= 0 ? '+' : ''}${b.avg.toFixed(3)}R | hold n ${String(inHold.length).padStart(4)} avg ${holdAvg >= 0 ? '+' : ''}${holdAvg.toFixed(3)}R`,
    holdAvg > 0 ? '<- holds' : ''
  );
}

if (outPath) fs.writeFileSync(outPath, JSON.stringify(candidates));
