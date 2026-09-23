// Replays the breakout rules (src/services/signalRules.ts) over recent real
// 5-minute futures candles from Angel One, walking candle by candle exactly
// as the live engine would, and reports signals and outcomes per market.
//
// Outcomes are in R (multiples of the risk taken) on the underlying future:
// Angel One has no history for expired option contracts, so option premiums
// cannot be replayed. The live engine sizes the option SL from the same risk.
//
// Usage: npx tsx scripts/replay-signals.ts [days=30]
import 'dotenv/config';
import * as OTPAuth from 'otpauth';
import { AngelCandle, getAngelCandles, smartApiHeaders, SMARTAPI_BASE } from '../src/services/angelOneApi';
import { getInstruments, InstrumentRow, nearestExpiry, todayKeyIST } from '../src/services/instrumentMaster';
import { DEFAULT_INDEX_PROFILES } from '../src/services/priceActionEngine';
import { RuleSet, RULES_V1, RULES_V2, SignalMarket } from '../src/services/signalRules';
import { CANDLE_MS, replayCandles, Trade } from './backtest-lib';

const DAYS = Number(process.argv[2]) || 30;

const UNDERLYINGS: { symbol: string; angelName: string; market: SignalMarket; futExchange: string; futType: string; optExchange: string; optType: string }[] = [
  { symbol: 'NIFTY 50', angelName: 'NIFTY', market: 'NSE', futExchange: 'NFO', futType: 'FUTIDX', optExchange: 'NFO', optType: 'OPTIDX' },
  { symbol: 'BANKNIFTY', angelName: 'BANKNIFTY', market: 'NSE', futExchange: 'NFO', futType: 'FUTIDX', optExchange: 'NFO', optType: 'OPTIDX' },
  { symbol: 'FINNIFTY', angelName: 'FINNIFTY', market: 'NSE', futExchange: 'NFO', futType: 'FUTIDX', optExchange: 'NFO', optType: 'OPTIDX' },
  { symbol: 'MIDCPNIFTY', angelName: 'MIDCPNIFTY', market: 'NSE', futExchange: 'NFO', futType: 'FUTIDX', optExchange: 'NFO', optType: 'OPTIDX' },
  { symbol: 'SENSEX', angelName: 'SENSEX', market: 'NSE', futExchange: 'BFO', futType: 'FUTIDX', optExchange: 'BFO', optType: 'OPTIDX' },
  { symbol: 'CRUDEOIL', angelName: 'CRUDEOIL', market: 'MCX', futExchange: 'MCX', futType: 'FUTCOM', optExchange: 'MCX', optType: 'OPTFUT' },
  { symbol: 'NATURALGAS', angelName: 'NATURALGAS', market: 'MCX', futExchange: 'MCX', futType: 'FUTCOM', optExchange: 'MCX', optType: 'OPTFUT' },
  { symbol: 'GOLD', angelName: 'GOLD', market: 'MCX', futExchange: 'MCX', futType: 'FUTCOM', optExchange: 'MCX', optType: 'OPTFUT' },
  { symbol: 'SILVER', angelName: 'SILVER', market: 'MCX', futExchange: 'MCX', futType: 'FUTCOM', optExchange: 'MCX', optType: 'OPTFUT' },
  { symbol: 'COPPER', angelName: 'COPPER', market: 'MCX', futExchange: 'MCX', futType: 'FUTCOM', optExchange: 'MCX', optType: 'OPTFUT' },
  { symbol: 'ZINC', angelName: 'ZINC', market: 'MCX', futExchange: 'MCX', futType: 'FUTCOM', optExchange: 'MCX', optType: 'OPTFUT' },
];

function summary(label: string, trades: Trade[], days: number) {
  const wins = trades.filter(t => t.resultR > 0);
  const losses = trades.filter(t => t.resultR < 0);
  const net = trades.reduce((s, t) => s + t.resultR, 0);
  console.log(
    `${label.padEnd(10)} signals ${String(trades.length).padStart(3)} (${(trades.length / Math.max(days, 1)).toFixed(2)}/day)` +
    ` | win ${wins.length} loss ${losses.length} flat ${trades.length - wins.length - losses.length}` +
    ` | win rate ${trades.length ? ((wins.length / trades.length) * 100).toFixed(0) : 0}%` +
    ` | net ${net >= 0 ? '+' : ''}${net.toFixed(1)}R avg ${trades.length ? (net / trades.length).toFixed(2) : '0.00'}R`
  );
}

const e = process.env;
const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(e.ANGELONE_TOTP_SECRET!.replace(/\s/g, '').toUpperCase()), digits: 6, period: 30 }).generate();
const login: any = await (await fetch(`${SMARTAPI_BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
  method: 'POST', headers: smartApiHeaders(e.ANGELONE_API_KEY!),
  body: JSON.stringify({ clientcode: e.ANGELONE_CLIENT_CODE, password: e.ANGELONE_MPIN, totp }),
})).json();
const auth = { apiKey: e.ANGELONE_API_KEY!, jwtToken: login.data.jwtToken };
const instruments = await getInstruments();
const today = todayKeyIST();

// v1 used the near-month future; v2 (rule 5) uses the future MCX options expire into
function futureFor(u: typeof UNDERLYINGS[number], rules: RuleSet): InstrumentRow | undefined {
  if (u.market === 'MCX' && rules.name !== 'v1') {
    const opt = nearestExpiry(instruments, { name: u.angelName, exchange: u.optExchange, instrumentType: u.optType }, today, true)[0];
    if (opt) return nearestExpiry(instruments, { name: u.angelName, exchange: 'MCX', instrumentType: 'FUTCOM' }, opt.expiryKey)[0];
  }
  return nearestExpiry(instruments, { name: u.angelName, exchange: u.futExchange, instrumentType: u.futType }, today)[0];
}

const now = Date.now();
const fromMs = now - (DAYS + 12) * 24 * 60 * 60 * 1000; // extra history for ATR/volume warm-up
const candleCache = new Map<string, AngelCandle[] | null>();
const all: Record<string, Trade[]> = { v1: [], v2: [] };
const volumeRows: string[] = [];
let tradingDays = 0;

for (const rules of [RULES_V1, RULES_V2]) {
  for (const u of UNDERLYINGS) {
    const fut = futureFor(u, rules);
    if (!fut) { console.log(`${u.symbol}: no future found`); continue; }
    if (!candleCache.has(fut.token)) candleCache.set(fut.token, await getAngelCandles(auth, fut.exchange, fut.token, 'FIVE_MINUTE', fromMs, now));
    const candles = (candleCache.get(fut.token) || []).filter(c => c.ts + CANDLE_MS <= now);
    if (!candles.length) { console.log(`${u.symbol} ${fut.symbol}: no candles`); continue; }
    if (rules.name === 'v2') {
      const vols = candles.slice(-300).map(c => c.volume).sort((a, b) => a - b);
      volumeRows.push(`${u.symbol.padEnd(11)} ${fut.symbol.padEnd(24)} median 5-min volume ${vols[Math.floor(vols.length / 2)]}`);
      tradingDays = Math.max(tradingDays, new Set(candles.map(c => c.dateKey)).size);
    }
    const profile = DEFAULT_INDEX_PROFILES[u.symbol] || DEFAULT_INDEX_PROFILES['NIFTY 50'];
    all[rules.name].push(...replayCandles(u.symbol, u.market, candles, rules, {
      dailyLimit: profile.dailySignalLimit,
      volumeThreshold: profile.breakoutVolumeThreshold,
      warmupCandles: 150,
    }));
  }
}

const replayDays = Math.max(1, tradingDays - Math.ceil(150 / 75));
console.log(`\nReplay over ~${replayDays} trading days of real 5-min futures candles (results in R on the underlying)\n`);
console.log('Liquidity (rule 4 threshold 20):');
volumeRows.forEach(r => console.log('  ' + r));
for (const name of ['v1', 'v2']) {
  console.log(`\n=== Rules ${name} ===`);
  const trades = all[name];
  summary('ALL', trades, replayDays);
  summary('NSE/BSE', trades.filter(t => t.market === 'NSE'), replayDays);
  summary('MCX', trades.filter(t => t.market === 'MCX'), replayDays);
  const bySymbol: Record<string, Trade[]> = {};
  trades.forEach(t => (bySymbol[t.symbol] = bySymbol[t.symbol] || []).push(t));
  Object.entries(bySymbol).forEach(([sym, list]) => summary(`  ${sym}`, list, replayDays));
}
console.log('\nLast 12 v2 trades:');
all.v2.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(-12)
  .forEach(t => console.log(`  ${t.date} ${t.time} ${t.symbol.padEnd(10)} ${t.bias.padEnd(8)} ${t.levelName.padEnd(19)} ${t.resultR >= 0 ? '+' : ''}${t.resultR}R (${t.exit})`));
process.exit(0);
