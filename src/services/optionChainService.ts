import { OptionChainData, OptionLegData, OptionStrike } from '../types/market';
import { AngelOneLiveStreamer } from './angelOneLiveService';
import { getAngelQuotes, smartApiHeaders, SMARTAPI_BASE, SmartApiAuth } from './angelOneApi';
import { getInstruments, InstrumentRow, nearestExpiry, todayKeyIST } from './instrumentMaster';

// Live option chain from Angel One: premiums, OI, volume and bid/ask from
// the quote API; IV and Greeks from the optionGreek API where Angel One
// provides them (NFO index options). Nothing is estimated or simulated:
// fields Angel One does not supply are returned as null.

interface ChainUnderlying {
  angelName: string;
  exchange: string; // option exchange
  optType: 'OPTIDX' | 'OPTFUT';
  spotSymbol?: string; // ticker symbol for index spot; MCX uses the option's future
}

const CHAIN_UNDERLYINGS: Record<string, ChainUnderlying> = {
  'NIFTY 50': { angelName: 'NIFTY', exchange: 'NFO', optType: 'OPTIDX', spotSymbol: 'NIFTY 50' },
  'BANKNIFTY': { angelName: 'BANKNIFTY', exchange: 'NFO', optType: 'OPTIDX', spotSymbol: 'BANKNIFTY' },
  'FINNIFTY': { angelName: 'FINNIFTY', exchange: 'NFO', optType: 'OPTIDX', spotSymbol: 'FINNIFTY' },
  'MIDCPNIFTY': { angelName: 'MIDCPNIFTY', exchange: 'NFO', optType: 'OPTIDX', spotSymbol: 'MIDCPNIFTY' },
  'SENSEX': { angelName: 'SENSEX', exchange: 'BFO', optType: 'OPTIDX', spotSymbol: 'SENSEX' },
  'CRUDEOIL': { angelName: 'CRUDEOIL', exchange: 'MCX', optType: 'OPTFUT' },
  'NATURALGAS': { angelName: 'NATURALGAS', exchange: 'MCX', optType: 'OPTFUT' },
  'GOLD': { angelName: 'GOLD', exchange: 'MCX', optType: 'OPTFUT' },
  'SILVER': { angelName: 'SILVER', exchange: 'MCX', optType: 'OPTFUT' },
  'COPPER': { angelName: 'COPPER', exchange: 'MCX', optType: 'OPTFUT' },
  'ZINC': { angelName: 'ZINC', exchange: 'MCX', optType: 'OPTFUT' },
};

export const OPTION_CHAIN_SYMBOLS = Object.keys(CHAIN_UNDERLYINGS);

const STRIKES_EACH_SIDE = 10; // 21 strikes x CE/PE = 42 tokens, one quote call (max 50)
const CHAIN_CACHE_MS = 5_000;
const GREEKS_CACHE_MS = 60_000;
const MAX_EXPIRIES = 8;

export interface LiveOptionChain extends OptionChainData {
  source: 'ANGELONE';
  lotSize: number;
  greeksAvailable: boolean;
  oiChangeAvailable: false;
  referenceLabel: string; // what the ATM/"spot" price is
  fetchedAt: string;
}

export class OptionChainError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type GreekRow = { delta: number; gamma: number; theta: number; vega: number; iv: number };

const chainCache = new Map<string, { at: number; data: LiveOptionChain }>();
const greeksCache = new Map<string, { at: number; rows: Map<string, GreekRow> | null }>();

const round2 = (n: number) => Number(n.toFixed(2));

// optionGreek is rate-limited and only covers NFO options; cache per
// underlying+expiry and treat any failure as "not available".
async function getGreeks(auth: SmartApiAuth, name: string, expiry: string): Promise<Map<string, GreekRow> | null> {
  const key = `${name}|${expiry}`;
  const cached = greeksCache.get(key);
  if (cached && Date.now() - cached.at < GREEKS_CACHE_MS) return cached.rows;

  let rows: Map<string, GreekRow> | null = null;
  try {
    const res = await fetch(`${SMARTAPI_BASE}/rest/secure/angelbroking/marketData/v1/optionGreek`, {
      method: 'POST',
      headers: smartApiHeaders(auth.apiKey, auth.jwtToken),
      body: JSON.stringify({ name, expirydate: expiry }),
    });
    const json: any = await res.json().catch(() => null);
    if (json?.status && Array.isArray(json.data)) {
      rows = new Map();
      for (const g of json.data) {
        rows.set(`${Number(g.strikePrice)}|${g.optionType}`, {
          delta: Number(Number(g.delta).toFixed(3)),
          gamma: Number(Number(g.gamma).toFixed(4)),
          theta: round2(Number(g.theta)),
          vega: round2(Number(g.vega)),
          iv: round2(Number(g.impliedVolatility)),
        });
      }
    }
  } catch {
    rows = null;
  }
  // Keep a previous good result if this refresh failed (e.g. rate limit)
  if (!rows && cached?.rows) rows = cached.rows;
  greeksCache.set(key, { at: Date.now(), rows });
  return rows;
}

function leg(quote: any, greek: GreekRow | undefined): OptionLegData {
  return {
    ltp: Number(quote?.ltp) || 0,
    change: round2(Number(quote?.netChange) || 0),
    changePercent: round2(Number(quote?.percentChange) || 0),
    oi: Number(quote?.opnInterest) || 0,
    oiChange: null,
    volume: Number(quote?.tradeVolume) || 0,
    iv: greek ? greek.iv : null,
    delta: greek ? greek.delta : null,
    theta: greek ? greek.theta : null,
    gamma: greek ? greek.gamma : null,
    vega: greek ? greek.vega : null,
    bid: Number(quote?.depth?.buy?.[0]?.price) || 0,
    ask: Number(quote?.depth?.sell?.[0]?.price) || 0,
  };
}

export async function getLiveOptionChain(
  streamer: AngelOneLiveStreamer,
  symbol: string,
  requestedExpiry?: string
): Promise<LiveOptionChain> {
  const u = CHAIN_UNDERLYINGS[symbol.toUpperCase()];
  if (!u) throw new OptionChainError(`Option chain not available for ${symbol}`, 404);
  const auth = streamer.getSessionAuth();
  if (!auth) throw new OptionChainError('Angel One session not active - live option chain unavailable', 503);

  const instruments = await getInstruments();
  const today = todayKeyIST();
  const all = instruments.filter(r => r.name === u.angelName && r.exchange === u.exchange && r.instrumentType === u.optType && r.expiryKey >= today);
  if (!all.length) throw new OptionChainError(`No option contracts found for ${symbol}`, 404);

  const expiryKeys = [...new Set(all.map(r => r.expiryKey))].sort((a, b) => a - b).slice(0, MAX_EXPIRIES);
  const expiryByKey = new Map(all.map(r => [r.expiryKey, r.expiry]));
  const expiryDates = expiryKeys.map(k => expiryByKey.get(k)!);
  const selectedExpiry = requestedExpiry && expiryDates.includes(requestedExpiry) ? requestedExpiry : expiryDates[0];

  const cacheKey = `${symbol.toUpperCase()}|${selectedExpiry}`;
  const cached = chainCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CHAIN_CACHE_MS) return cached.data;

  const contracts = all.filter(r => r.expiry === selectedExpiry);
  const expiryKey = contracts[0].expiryKey;

  // ATM reference: index spot for index options; for MCX (options on
  // futures) the future the option expires into.
  let reference = 0;
  let referenceLabel = 'Spot';
  if (u.spotSymbol) {
    reference = streamer.getTicker(u.spotSymbol)?.ltp || 0;
  } else {
    const fut = nearestExpiry(instruments, { name: u.angelName, exchange: 'MCX', instrumentType: 'FUTCOM' }, expiryKey)[0];
    if (fut) {
      const q = await getAngelQuotes(auth, { MCX: [fut.token] }, 'LTP');
      reference = Number(q?.[0]?.ltp) || 0;
      referenceLabel = `Future ${fut.expiry}`;
    }
  }
  if (!(reference > 0)) throw new OptionChainError(`No live price for ${symbol} to centre the chain`, 503);

  const strikes = [...new Set(contracts.map(r => r.strike))].sort((a, b) => a - b);
  const atmIndex = strikes.reduce((best, s, i) => (Math.abs(s - reference) < Math.abs(strikes[best] - reference) ? i : best), 0);
  const shown = strikes.slice(Math.max(0, atmIndex - STRIKES_EACH_SIDE), atmIndex + STRIKES_EACH_SIDE + 1);
  const shownSet = new Set(shown);
  const shownContracts = contracts.filter(r => shownSet.has(r.strike));

  const [quotes, greeks] = await Promise.all([
    getAngelQuotes(auth, { [u.exchange]: shownContracts.map(r => r.token) }, 'FULL'),
    u.exchange === 'NFO' ? getGreeks(auth, u.angelName, selectedExpiry) : Promise.resolve(null),
  ]);
  if (!quotes) throw new OptionChainError('Angel One quote request failed - try again shortly', 503);

  const quoteByToken = new Map(quotes.map((q: any) => [String(q.symbolToken), q]));
  const contractFor = (strike: number, type: 'CE' | 'PE'): InstrumentRow | undefined =>
    shownContracts.find(r => r.strike === strike && r.optionType === type);

  const rows: OptionStrike[] = shown.map(strike => {
    const ce = contractFor(strike, 'CE');
    const pe = contractFor(strike, 'PE');
    return {
      strikePrice: strike,
      call: leg(ce && quoteByToken.get(ce.token), greeks?.get(`${strike}|CE`)),
      put: leg(pe && quoteByToken.get(pe.token), greeks?.get(`${strike}|PE`)),
    };
  });

  // Aggregates over the strikes shown (not the full chain)
  const totalCallOI = rows.reduce((sum, r) => sum + r.call.oi, 0);
  const totalPutOI = rows.reduce((sum, r) => sum + r.put.oi, 0);
  const maxBy = (pick: (r: OptionStrike) => number) => rows.reduce((best, r) => (pick(r) > pick(best) ? r : best), rows[0]);
  const maxPain = rows.reduce(
    (best, candidate) => {
      const pain = rows.reduce(
        (sum, r) =>
          sum + r.call.oi * Math.max(0, candidate.strikePrice - r.strikePrice) + r.put.oi * Math.max(0, r.strikePrice - candidate.strikePrice),
        0
      );
      return pain < best.pain ? { strike: candidate.strikePrice, pain } : best;
    },
    { strike: rows[0].strikePrice, pain: Infinity }
  ).strike;

  const data: LiveOptionChain = {
    underlyingSymbol: symbol.toUpperCase(),
    underlyingPrice: round2(reference),
    expiryDates,
    selectedExpiry,
    strikes: rows,
    pcr: totalCallOI > 0 ? round2(totalPutOI / totalCallOI) : 0,
    maxPain,
    totalCallOI,
    totalPutOI,
    highestCallOIStrike: maxBy(r => r.call.oi).strikePrice,
    highestPutOIStrike: maxBy(r => r.put.oi).strikePrice,
    atmStrike: strikes[atmIndex],
    source: 'ANGELONE',
    lotSize: contracts[0].lotSize,
    greeksAvailable: !!greeks,
    oiChangeAvailable: false,
    referenceLabel,
    fetchedAt: new Date().toISOString(),
  };
  chainCache.set(cacheKey, { at: Date.now(), data });
  return data;
}
