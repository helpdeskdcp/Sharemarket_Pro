// Long-history backtest of the live signal rules on a 5-minute OHLC CSV
// (columns: date,open,high,low,close,volume; date in IST "YYYY-MM-DD HH:MM:SS").
//
// Index CSVs carry no volume, so the two volume rules (volume surge and
// futures liquidity) are switched off here; every other rule, the entry
// windows and the trade management are exactly the live engine's.
// Results are in R on the underlying (no option premium, theta or spread).
//
// Usage: npx tsx scripts/backtest-history.ts <csv> <symbol> [NSE|MCX]
import fs from 'fs';
import { AngelCandle } from '../src/services/angelOneApi';
import { DEFAULT_INDEX_PROFILES } from '../src/services/priceActionEngine';
import { RuleSet, RULES_V1, RULES_V2, SignalMarket } from '../src/services/signalRules';
import { formatStats, replayCandles, Trade, tradeStats } from './backtest-lib';

const [csvPath, symbol = 'NIFTY 50', marketArg = 'NSE'] = process.argv.slice(2);
if (!csvPath) {
  console.log('usage: npx tsx scripts/backtest-history.ts <csv> <symbol> [NSE|MCX]');
  process.exit(1);
}
const market = marketArg as SignalMarket;
const SESSION: Record<SignalMarket, [number, number]> = { NSE: [9 * 60 + 15, 15 * 60 + 25], MCX: [9 * 60, 23 * 60 + 25] };

// ---- load candles --------------------------------------------------------
const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const header = lines[0].toLowerCase().split(',');
const col = (name: string) => header.indexOf(name);
const [iDate, iO, iH, iL, iC, iV] = ['date', 'open', 'high', 'low', 'close', 'volume'].map(col);
const candles: AngelCandle[] = [];
for (const line of lines.slice(1)) {
  const f = line.split(',');
  const date = f[iDate];
  const minutes = Number(date.slice(11, 13)) * 60 + Number(date.slice(14, 16));
  if (minutes < SESSION[market][0] || minutes > SESSION[market][1]) continue; // drop pre/post-market rows
  const [open, high, low, close] = [f[iO], f[iH], f[iL], f[iC]].map(Number);
  if (!(open > 0 && high > 0 && low > 0 && close > 0)) continue;
  candles.push({
    ts: Date.parse(`${date.slice(0, 10)}T${date.slice(11, 19)}+05:30`),
    dateKey: date.slice(0, 10),
    open, high, low, close,
    volume: iV >= 0 ? Number(f[iV]) || 0 : 0,
  });
}
candles.sort((a, b) => a.ts - b.ts);
const days = new Set(candles.map(c => c.dateKey)).size;
console.log(`${symbol}: ${candles.length} candles, ${days} sessions, ${candles[0].dateKey} to ${candles[candles.length - 1].dateKey}`);
console.log('Volume rules OFF (no volume in index data); all other v1/v2 rules and trade management as live.\n');

// ---- run both rule sets ----------------------------------------------------
const noVolume = (r: RuleSet): RuleSet => ({ ...r, name: `${r.name} (no volume rules)`, minMedianVolume: 0 });
const profile = DEFAULT_INDEX_PROFILES[symbol] || DEFAULT_INDEX_PROFILES['NIFTY 50'];
const results: Record<string, Trade[]> = {};
for (const rules of [noVolume(RULES_V1), noVolume(RULES_V2)]) {
  results[rules.name] = replayCandles(symbol, market, candles, rules, {
    dailyLimit: profile.dailySignalLimit,
    volumeThreshold: 0,
    warmupCandles: 150,
  });
}

for (const [name, trades] of Object.entries(results)) {
  console.log(`=== ${name} ===`);
  console.log(formatStats('ALL', tradeStats(trades), trades.length / days));
  for (const cost of [0.1, 0.2]) console.log(formatStats(`cost ${cost}R`, tradeStats(trades, cost)));
  const byYear: Record<string, Trade[]> = {};
  trades.forEach(t => (byYear[t.date.slice(0, 4)] = byYear[t.date.slice(0, 4)] || []).push(t));
  for (const [year, list] of Object.entries(byYear)) console.log(formatStats(`  ${year}`, tradeStats(list)));
  const exits: Record<string, number> = {};
  trades.forEach(t => (exits[t.exit] = (exits[t.exit] || 0) + 1));
  console.log('  exits:', Object.entries(exits).map(([k, v]) => `${k} ${v}`).join(', '));
  const risks = trades.map(t => t.riskPts).sort((a, b) => a - b);
  if (risks.length) console.log(`  median risk (1R) ${risks[Math.floor(risks.length / 2)]} pts`);
  console.log('');
}
