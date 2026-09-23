import fs from 'fs';
import path from 'path';
import { PriceActionSignal } from '../types/market';
import { AngelOneLiveStreamer } from './angelOneLiveService';
import { AngelCandle, getAngelCandles, getAngelQuotes, SmartApiAuth } from './angelOneApi';
import { getInstruments, InstrumentRow, nearestExpiry, todayKeyIST } from './instrumentMaster';
import { OPEN_TRADE_STATUSES, PriceActionStrategyEngine } from './priceActionEngine';

// Live option signal engine: detects 5-minute breakouts on the near-month
// future of each underlying from real Angel One candles, prices the ATM
// option from the live option chain, and tracks every signal's premium
// until target / stop loss / square-off.

type Market = 'NSE' | 'MCX';
export type SignalEvent = 'T1' | 'T2' | 'T4' | 'SL' | 'SQUARED_OFF';

interface Underlying {
  symbol: string; // ticker/profile symbol used across the app
  angelName: string; // underlying name in the instrument master
  market: Market;
  futExchange: string;
  futType: 'FUTIDX' | 'FUTCOM';
  optExchange: string;
  optType: 'OPTIDX' | 'OPTFUT';
}

const UNDERLYINGS: Underlying[] = [
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

// IST minutes-of-day windows. New signals only inside [entryStart, entryEnd];
// open signals are closed at squareOff.
const SESSION: Record<Market, { entryStart: number; entryEnd: number; squareOff: number }> = {
  NSE: { entryStart: 9 * 60 + 30, entryEnd: 14 * 60 + 45, squareOff: 15 * 60 + 15 },
  MCX: { entryStart: 9 * 60 + 15, entryEnd: 22 * 60 + 30, squareOff: 23 * 60 + 15 },
};

const CANDLE_MS = 5 * 60 * 1000;
const EVALUATE_OFFSET_MS = 20 * 1000; // run 20s after each 5-minute close
const TRACK_MS = 5 * 1000;
const MIN_GAP_BETWEEN_SIGNALS_MS = 30 * 60 * 1000;
const OPTION_DELTA = 0.5; // ATM approximation to translate underlying risk to premium
const SL_MIN_PCT = 0.15;
const SL_MAX_PCT = 0.35;
const MAX_UPPER_WICK_PCT = 30;
const MIN_BODY_PCT = 50;
const STORE_FILE = path.join(process.cwd(), 'data', 'price-action-signals.json');
const STORE_DAYS = 30;

function istNow() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return {
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    dateKey: ist.toISOString().slice(0, 10),
    weekday: ist.getUTCDay(),
    hhmm: ist.toISOString().slice(11, 16).replace(':', ''),
  };
}

function formatTimeIST(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

function roundToTick(value: number, tick: number): number {
  return Number((Math.round(value / tick) * tick).toFixed(2));
}

const round2 = (n: number) => Number(n.toFixed(2));

export interface LiveSignalEngineHooks {
  onNewSignal: (signal: PriceActionSignal) => void;
  onSignalEvent: (signal: PriceActionSignal, event: SignalEvent) => void;
}

export class LiveSignalEngine {
  private lastEvaluatedCandle = new Map<string, number>();
  private lastRun: { at: string; evaluated: number; skipped: string[] } = { at: '', evaluated: 0, skipped: [] };
  private evaluating = false;
  private tracking = false;
  private dirty = false;

  constructor(
    private streamer: AngelOneLiveStreamer,
    private store: PriceActionStrategyEngine,
    private hooks: LiveSignalEngineHooks
  ) {}

  public start() {
    this.loadFromDisk();
    this.scheduleNextEvaluation();
    setInterval(() => this.trackOpenSignals(), TRACK_MS);
    setInterval(() => this.saveToDisk(), 30 * 1000);
  }

  public getStatus() {
    return {
      underlyings: UNDERLYINGS.map(u => u.symbol),
      openSignals: this.store.getOpenSignals().length,
      lastRun: this.lastRun,
      sessionActive: !!this.streamer.getSessionAuth(),
    };
  }

  private scheduleNextEvaluation() {
    const now = Date.now();
    const next = Math.floor(now / CANDLE_MS) * CANDLE_MS + CANDLE_MS + EVALUATE_OFFSET_MS;
    setTimeout(async () => {
      await this.evaluateAll().catch(err => console.warn('[Signals] evaluation error:', err?.message || err));
      this.scheduleNextEvaluation();
    }, next - now);
  }

  // ---- Signal detection ----------------------------------------------------

  public async evaluateAll() {
    if (this.evaluating) return;
    this.evaluating = true;
    const skipped: string[] = [];
    let evaluated = 0;
    try {
      const auth = this.streamer.getSessionAuth();
      if (!auth) {
        skipped.push('no Angel One session');
        return;
      }
      const { minutes, weekday } = istNow();
      if (weekday === 0 || weekday === 6) {
        skipped.push('weekend');
        return;
      }
      const instruments = await getInstruments();

      for (const u of UNDERLYINGS) {
        const session = SESSION[u.market];
        if (minutes < session.entryStart || minutes > session.entryEnd) {
          skipped.push(`${u.symbol}: outside entry window`);
          continue;
        }
        const reason = await this.evaluateUnderlying(u, auth, instruments);
        evaluated++;
        if (reason) skipped.push(`${u.symbol}: ${reason}`);
      }
    } finally {
      this.lastRun = { at: new Date().toISOString(), evaluated, skipped };
      this.evaluating = false;
    }
  }

  // Returns why no signal was created, or null when one was.
  private async evaluateUnderlying(u: Underlying, auth: SmartApiAuth, instruments: InstrumentRow[]): Promise<string | null> {
    const today = istNow().dateKey;
    const profile = this.store.getProfile(u.symbol);
    const symbolSignals = this.store.getSignals(u.symbol);

    if (symbolSignals.some(s => OPEN_TRADE_STATUSES.includes(s.tradeStatus))) return 'signal already open';
    const todays = symbolSignals.filter(s => this.istDateOf(s.timestamp) === today);
    if (todays.length >= profile.dailySignalLimit) return 'daily signal limit reached';
    const latest = symbolSignals[0];
    if (latest && Date.now() - new Date(latest.timestamp).getTime() < MIN_GAP_BETWEEN_SIGNALS_MS) return 'last signal under 30 min ago';

    const fut = nearestExpiry(instruments, { name: u.angelName, exchange: u.futExchange, instrumentType: u.futType }, todayKeyIST())[0];
    if (!fut) return 'no future contract found';

    const now = Date.now();
    const candles = await getAngelCandles(auth, fut.exchange, fut.token, 'FIVE_MINUTE', now - 6 * 24 * 60 * 60 * 1000, now);
    if (!candles) return 'candle request failed (Angel One rate limit or error)';
    if (candles.length < 30) return 'not enough candle data';

    const closed = candles.filter(c => c.ts + CANDLE_MS <= now);
    const c = closed[closed.length - 1];
    const p = closed[closed.length - 2];
    if (!c || !p || c.dateKey !== today) return 'no closed candle today';
    if (this.lastEvaluatedCandle.get(u.symbol) === c.ts) return 'candle already evaluated';
    this.lastEvaluatedCandle.set(u.symbol, c.ts);

    const todayCandles = closed.filter(x => x.dateKey === today);
    const prevDate = [...new Set(closed.map(x => x.dateKey))].filter(d => d < today).pop();
    const prevCandles = closed.filter(x => x.dateKey === prevDate);
    if (todayCandles.length < 4 || prevCandles.length === 0) return 'opening range not complete';

    const pdh = Math.max(...prevCandles.map(x => x.high));
    const pdl = Math.min(...prevCandles.map(x => x.low));
    const openingRange = todayCandles.slice(0, 3);
    const orh = Math.max(...openingRange.map(x => x.high));
    const orl = Math.min(...openingRange.map(x => x.low));

    const recent = closed.slice(-14);
    const atr = recent.reduce((sum, x) => sum + (x.high - x.low), 0) / recent.length;
    const prior = closed.slice(-21, -1);
    const avgVolume = prior.reduce((sum, x) => sum + x.volume, 0) / (prior.length || 1);
    const volumeMultiplier = avgVolume > 0 ? round2(c.volume / avgVolume) : 0;

    const range = c.high - c.low;
    if (range <= 0 || atr <= 0) return 'flat candle';
    const bodyPct = (Math.abs(c.close - c.open) / range) * 100;
    const upperWickPct = ((c.high - Math.max(c.open, c.close)) / range) * 100;
    const lowerWickPct = ((Math.min(c.open, c.close) - c.low) / range) * 100;

    const bullLevels = ([['Opening range high', orh], ['Previous day high', pdh]] as [string, number][])
      .filter(([, level]) => p.close <= level && c.close > level);
    const bearLevels = ([['Opening range low', orl], ['Previous day low', pdl]] as [string, number][])
      .filter(([, level]) => p.close >= level && c.close < level);

    let bias: 'BULLISH' | 'BEARISH';
    let levels: [string, number][];
    if (bullLevels.length && c.close > c.open) {
      bias = 'BULLISH';
      levels = bullLevels;
    } else if (bearLevels.length && c.close < c.open) {
      bias = 'BEARISH';
      levels = bearLevels;
    } else {
      return 'no level crossed';
    }

    // Strongest level crossed: highest for breakouts, lowest for breakdowns
    const [levelName, level] = levels.sort((a, b) => (bias === 'BULLISH' ? b[1] - a[1] : a[1] - b[1]))[0];
    const againstWickPct = bias === 'BULLISH' ? upperWickPct : lowerWickPct;
    const extension = Math.abs(c.close - level);

    if (bodyPct < MIN_BODY_PCT) return `body ${bodyPct.toFixed(0)}% < ${MIN_BODY_PCT}%`;
    if (againstWickPct > MAX_UPPER_WICK_PCT) return `rejection wick ${againstWickPct.toFixed(0)}%`;
    if (volumeMultiplier < profile.breakoutVolumeThreshold) return `volume ${volumeMultiplier}x < ${profile.breakoutVolumeThreshold}x`;
    if (extension > atr) return 'close too far beyond level';

    const underlyingRisk = Math.max(bias === 'BULLISH' ? c.close - c.low : c.high - c.close, 0.25 * atr);

    const signal = await this.buildOptionSignal({
      u, auth, instruments, fut, candle: c, bias, level, levelName, levels, atr, volumeMultiplier,
      bodyPct, againstWickPct, underlyingRisk, todaysCount: todays.length,
    });
    if (typeof signal === 'string') return signal;

    this.store.addSignal(signal);
    this.dirty = true;
    this.saveToDisk();
    console.log(`[Signals] NEW ${signal.optionSymbol} entry ${signal.optionEntryPrice} SL ${signal.optionStopLoss} (${levelName} ${level})`);
    this.hooks.onNewSignal(signal);
    return null;
  }

  private async buildOptionSignal(ctx: {
    u: Underlying;
    auth: SmartApiAuth;
    instruments: InstrumentRow[];
    fut: InstrumentRow;
    candle: AngelCandle;
    bias: 'BULLISH' | 'BEARISH';
    level: number;
    levelName: string;
    levels: [string, number][];
    atr: number;
    volumeMultiplier: number;
    bodyPct: number;
    againstWickPct: number;
    underlyingRisk: number;
    todaysCount: number;
  }): Promise<PriceActionSignal | string> {
    const { u, auth, instruments, fut, candle, bias, level, levelName } = ctx;
    const optionType = bias === 'BULLISH' ? 'CE' : 'PE';

    // Nearest expiry that is not today (no expiry-day entries)
    const chain = nearestExpiry(instruments, { name: u.angelName, exchange: u.optExchange, instrumentType: u.optType }, todayKeyIST(), true)
      .filter(r => r.optionType === optionType);
    if (!chain.length) return 'no option chain found';
    const expiryKey = chain[0].expiryKey;

    // ATM reference: index spot for index options; for MCX options (options
    // on futures) the future that the option expires into.
    let reference: number;
    if (u.market === 'MCX') {
      const underlyingFut = nearestExpiry(instruments, { name: u.angelName, exchange: 'MCX', instrumentType: 'FUTCOM' }, expiryKey)[0];
      if (!underlyingFut) return 'no underlying future for option expiry';
      const q = await getAngelQuotes(auth, { MCX: [underlyingFut.token] }, 'LTP');
      reference = Number(q?.[0]?.ltp) || 0;
    } else {
      reference = this.streamer.getTicker(u.symbol)?.ltp || 0;
    }
    if (!(reference > 0)) return 'no reference price for ATM strike';

    const atm = chain.reduce((best, r) => (Math.abs(r.strike - reference) < Math.abs(best.strike - reference) ? r : best));

    const quotes = await getAngelQuotes(auth, { [atm.exchange]: [atm.token] }, 'FULL');
    const quote = quotes?.[0];
    const entry = Number(quote?.ltp) || 0;
    if (!(entry > 0)) return `no live premium for ${atm.symbol}`;
    if (!(Number(quote?.tradeVolume) > 0)) return `${atm.symbol} has not traded today`;

    const tick = atm.tickSize || 0.05;
    const rawSl = Math.min(Math.max(OPTION_DELTA * ctx.underlyingRisk, SL_MIN_PCT * entry), SL_MAX_PCT * entry);
    const slPoints = Math.max(roundToTick(rawSl, tick), tick);
    const stopLoss = round2(entry - slPoints);
    const target = (mult: number) => roundToTick(entry + mult * slPoints, tick);

    // Rule-based setup score (not a probability): volume, candle body, and
    // how many levels the candle cleared.
    const profile = this.store.getProfile(u.symbol);
    const volScore = Math.min(ctx.volumeMultiplier / profile.breakoutVolumeThreshold, 2) * 10;
    const setupScore = Math.min(99, Math.round(50 + volScore + ctx.bodyPct * 0.15 + (ctx.levels.length > 1 ? 10 : 0)));

    const expiryLabel = atm.expiry;
    const optionSymbol = `${u.angelName} ${expiryLabel} ${atm.strike} ${optionType}`;
    const direction = bias === 'BULLISH' ? 'above' : 'below';
    const levelMr: Record<string, string> = {
      'Opening range high': 'ओपनिंग रेंज हाय',
      'Previous day high': 'मागील दिवसाचा हाय',
      'Opening range low': 'ओपनिंग रेंज लो',
      'Previous day low': 'मागील दिवसाचा लो',
    };
    const now = Date.now();
    const { hhmm, dateKey } = istNow();

    return {
      id: `SIG-${u.symbol.replace(/\s+/g, '')}-${dateKey.replace(/-/g, '')}-${hhmm}`,
      timestamp: new Date(now).toISOString(),
      timeFormatted: formatTimeIST(now),
      indexSymbol: u.symbol,
      underlyingSpot: round2(reference),
      patternType: bias === 'BULLISH' ? 'RESISTANCE_BREAKOUT' : 'SUPPORT_BREAKOUT',
      bias,
      action: 'BUY',
      optionType,
      strikePrice: atm.strike,
      optionSymbol,
      optionEntryPrice: entry,
      optionStopLoss: stopLoss,
      optionStopLossPoints: slPoints,
      target1: { price: target(2), ratio: '1:2', points: round2(2 * slPoints), hit: false },
      target2: { price: target(3), ratio: '1:3', points: round2(3 * slPoints), hit: false },
      target4: { price: target(4), ratio: '1:4', points: round2(4 * slPoints), hit: false },
      adaptiveTarget: {
        price: target(1.5),
        ratio: '1:1.5',
        points: round2(1.5 * slPoints),
        probabilityPercent: 0,
        optimalRatioMultiplier: 1.5,
        reason: 'Partial-profit level at 1.5x risk',
        hit: false,
      },
      confirmationStatus: 'CONFIRMED_BREAKOUT',
      tradeStatus: 'ACTIVE',
      currentOptionPrice: entry,
      pointsCaptured: 0,
      maxPointsReached: 0,
      pnlPercent: 0,
      confidenceScore: setupScore,
      daySignalNumber: ctx.todaysCount + 1,
      keyLevel: level,
      volumeMultiplier: ctx.volumeMultiplier,
      rejectionWickPercent: round2(ctx.againstWickPct),
      rationale:
        `${fut.symbol} 5-min candle closed at ${candle.close} ${direction} ${levelName.toLowerCase()} ${level} ` +
        `(body ${ctx.bodyPct.toFixed(0)}%, volume ${ctx.volumeMultiplier}x the 20-candle average). ` +
        `ATM ${atm.strike} ${optionType} (${expiryLabel}) at live premium ₹${entry}; SL ₹${stopLoss} ` +
        `from ~${OPTION_DELTA} delta x ${round2(ctx.underlyingRisk)} pts underlying risk.`,
      marathiRationale:
        `${u.angelName} फ्युचर्सने ${levelMr[levelName]} ${level} च्या ${bias === 'BULLISH' ? 'वर' : 'खाली'} ` +
        `५-मिनिट कँडल क्लोज दिली (व्हॉल्यूम ${ctx.volumeMultiplier}x). ${atm.strike} ${optionType} ₹${entry} ला एंट्री, SL ₹${stopLoss}.`,
      source: 'LIVE_ENGINE',
      optionToken: atm.token,
      optionExchange: atm.exchange,
      optionExpiry: expiryLabel,
      lotSize: atm.lotSize,
      initialStopLoss: stopLoss,
    };
  }

  // ---- Trade tracking ------------------------------------------------------

  private async trackOpenSignals() {
    if (this.tracking) return;
    const open = this.store.getOpenSignals().filter(s => s.source === 'LIVE_ENGINE' && s.optionToken && s.optionExchange);
    if (!open.length) return;
    const auth = this.streamer.getSessionAuth();
    if (!auth) return;

    this.tracking = true;
    try {
      const exchangeTokens: Record<string, string[]> = {};
      open.forEach(s => {
        (exchangeTokens[s.optionExchange!] = exchangeTokens[s.optionExchange!] || []).push(s.optionToken!);
      });
      const quotes = await getAngelQuotes(auth, exchangeTokens, 'LTP');
      const ltpByToken = new Map((quotes || []).map((q: any) => [String(q.symbolToken), Number(q.ltp)]));

      const { minutes, dateKey } = istNow();
      for (const s of open) {
        const market: Market = s.optionExchange === 'MCX' ? 'MCX' : 'NSE';
        // Signals are intraday: anything still open from an earlier day
        // (e.g. server was down at square-off) is closed now, at the last
        // known premium if its option no longer quotes.
        const staleDay = this.istDateOf(s.timestamp) !== dateKey;
        const ltp = ltpByToken.get(s.optionToken!) || (staleDay ? s.currentOptionPrice : 0);
        if (!(ltp > 0)) continue;
        this.applyPrice(s, ltp, staleDay || minutes >= SESSION[market].squareOff);
      }
    } finally {
      this.tracking = false;
    }
  }

  private istDateOf(iso: string): string {
    return new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  private applyPrice(s: PriceActionSignal, ltp: number, squareOff: boolean) {
    const entry = s.optionEntryPrice;
    s.currentOptionPrice = ltp;
    s.maxPointsReached = round2(Math.max(s.maxPointsReached, ltp - entry));
    if (!s.adaptiveTarget.hit && ltp >= s.adaptiveTarget.price) s.adaptiveTarget.hit = true;

    const close = (status: PriceActionSignal['tradeStatus'], event: SignalEvent) => {
      s.tradeStatus = status;
      s.exitPrice = ltp;
      s.closedAt = new Date().toISOString();
      s.pointsCaptured = round2(ltp - entry);
      s.pnlPercent = round2(((ltp - entry) / entry) * 100);
      this.dirty = true;
      this.hooks.onSignalEvent(s, event);
    };

    if (ltp <= s.optionStopLoss) {
      close('STOPLOSS_HIT', 'SL');
      return;
    }
    if (!s.target4.hit && ltp >= s.target4.price) {
      s.target1.hit = s.target2.hit = s.target4.hit = true;
      close('TARGET_4_HIT', 'T4');
      return;
    }
    if (!s.target2.hit && ltp >= s.target2.price) {
      s.target1.hit = s.target2.hit = true;
      s.tradeStatus = 'TARGET_2_HIT';
      s.optionStopLoss = s.target1.price; // trail stop to T1
      this.dirty = true;
      this.hooks.onSignalEvent(s, 'T2');
    } else if (!s.target1.hit && ltp >= s.target1.price) {
      s.target1.hit = true;
      s.tradeStatus = 'TARGET_1_HIT';
      s.optionStopLoss = entry; // trail stop to cost
      this.dirty = true;
      this.hooks.onSignalEvent(s, 'T1');
    }

    if (squareOff) {
      close('SQUARED_OFF', 'SQUARED_OFF');
      return;
    }
    s.pointsCaptured = round2(ltp - entry);
    s.pnlPercent = round2(((ltp - entry) / entry) * 100);
  }

  // ---- Persistence ---------------------------------------------------------

  private loadFromDisk() {
    try {
      if (!fs.existsSync(STORE_FILE)) return;
      const saved: PriceActionSignal[] = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      const cutoff = Date.now() - STORE_DAYS * 24 * 60 * 60 * 1000;
      const kept = saved.filter(s => s.source === 'LIVE_ENGINE' && new Date(s.timestamp).getTime() >= cutoff);
      this.store.loadSignals(kept);
      console.log(`[Signals] loaded ${kept.length} saved signals`);
    } catch (err: any) {
      console.warn('[Signals] could not load saved signals:', err?.message || err);
    }
  }

  private saveToDisk() {
    if (!this.dirty) return;
    try {
      const live = this.store.getSignals().filter(s => s.source === 'LIVE_ENGINE');
      fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
      fs.writeFileSync(STORE_FILE + '.tmp', JSON.stringify(live, null, 2));
      fs.renameSync(STORE_FILE + '.tmp', STORE_FILE);
      this.dirty = false;
    } catch (err: any) {
      console.warn('[Signals] could not save signals:', err?.message || err);
    }
  }
}
