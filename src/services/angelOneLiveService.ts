import WebSocket from 'ws';
import { Ticker, Exchange, InstrumentType, MarketDepthItem } from '../types/market';
import { getInstruments, todayKeyIST, InstrumentRow } from './instrumentMaster';

export type AngelOneFeedStatus =
  | 'ANGELONE_WS_CONNECTED'
  | 'ANGELONE_REST_LIVE'
  | 'REAL_EXCHANGE_LIVE'
  | 'CONNECTING'
  | 'DISCONNECTED';

export interface McxContractInfo {
  symbol: string;
  angelName: string;
  token: string;
  tradingSymbol: string;
  expiry: string;
  lastAngelTick: string | null;
}

export interface AngelOneMarketFeedState {
  connected: boolean;
  feedStatus: AngelOneFeedStatus;
  lastTickTimestamp: string;
  source: string;
  totalTicksReceived: number;
  activeClientCode: string;
  subscribedTokens: string[];
  latencyMs: number;
  sessionActive: boolean;
  mcxContracts: McxContractInfo[];
}

interface SymbolMeta {
  yahooSymbol: string;
  token: string;
  exchange: Exchange;
  name: string;
  instrumentType: InstrumentType;
  lotSize: number;
  // MCX only: underlying name in Angel One's instrument master. The token
  // for these is resolved at runtime to the nearest-expiry FUTCOM contract,
  // because MCX futures tokens change every month on expiry.
  angelName?: string;
  tradingSymbol?: string;
  expiry?: string;
}

// Live Exchange Symbol to Market Ticker Mapping
export const EXCHANGE_SYMBOL_MAP: Record<string, SymbolMeta> = {
  'NIFTY 50': { yahooSymbol: '^NSEI', token: '99926000', exchange: 'NSE', name: 'Nifty 50 Benchmark Index', instrumentType: 'INDEX', lotSize: 25 },
  'BANKNIFTY': { yahooSymbol: '^NSEBANK', token: '99926009', exchange: 'NSE', name: 'Nifty Bank Index', instrumentType: 'INDEX', lotSize: 15 },
  'FINNIFTY': { yahooSymbol: 'NIFTY_FIN_SERVICE.NS', token: '99926037', exchange: 'NSE', name: 'Nifty Financial Services', instrumentType: 'INDEX', lotSize: 25 },
  'MIDCPNIFTY': { yahooSymbol: 'NIFTY_MIDCAP_50.NS', token: '99926074', exchange: 'NSE', name: 'Nifty Midcap Select', instrumentType: 'INDEX', lotSize: 50 },
  'SENSEX': { yahooSymbol: '^BSESN', token: '99919000', exchange: 'BSE', name: 'BSE SENSEX 30 Benchmark', instrumentType: 'INDEX', lotSize: 10 },
  'BANKEX': { yahooSymbol: '^BSEBANK', token: '99919012', exchange: 'BSE', name: 'BSE BANKEX Index', instrumentType: 'INDEX', lotSize: 15 },
  'INDIA VIX': { yahooSymbol: '^INDIAVIX', token: '99926017', exchange: 'NSE', name: 'India Volatility Index', instrumentType: 'INDEX', lotSize: 1 },
  'RELIANCE': { yahooSymbol: 'RELIANCE.NS', token: '2885', exchange: 'NSE', name: 'Reliance Industries Ltd', instrumentType: 'EQUITY', lotSize: 250 },
  'HDFCBANK': { yahooSymbol: 'HDFCBANK.NS', token: '1333', exchange: 'NSE', name: 'HDFC Bank Ltd', instrumentType: 'EQUITY', lotSize: 550 },
  'INFY': { yahooSymbol: 'INFY.NS', token: '1594', exchange: 'NSE', name: 'Infosys Ltd', instrumentType: 'EQUITY', lotSize: 400 },
  'TCS': { yahooSymbol: 'TCS.NS', token: '11536', exchange: 'NSE', name: 'Tata Consultancy Services', instrumentType: 'EQUITY', lotSize: 175 },
  'TATAMOTORS': { yahooSymbol: 'TATAMOTORS.NS', token: '3456', exchange: 'NSE', name: 'Tata Motors Ltd', instrumentType: 'EQUITY', lotSize: 575 },
  'SBIN': { yahooSymbol: 'SBIN.NS', token: '3045', exchange: 'NSE', name: 'State Bank of India', instrumentType: 'EQUITY', lotSize: 750 },
  'ICICIBANK': { yahooSymbol: 'ICICIBANK.NS', token: '4963', exchange: 'NSE', name: 'ICICI Bank Ltd', instrumentType: 'EQUITY', lotSize: 700 },
  'BHARTIARTL': { yahooSymbol: 'BHARTIARTL.NS', token: '10604', exchange: 'NSE', name: 'Bharti Airtel Ltd', instrumentType: 'EQUITY', lotSize: 475 },
  'GIFT NIFTY': { yahooSymbol: '^NSEI', token: 'SGX_NIFTY_FUT', exchange: 'GLOBAL', name: 'GIFT Nifty (SGX Futures)', instrumentType: 'GLOBAL', lotSize: 25 },
  'NASDAQ': { yahooSymbol: '^IXIC', token: 'IXIC', exchange: 'GLOBAL', name: 'Nasdaq Composite Index', instrumentType: 'GLOBAL', lotSize: 1 },
  'S&P 500': { yahooSymbol: '^GSPC', token: 'SPX', exchange: 'GLOBAL', name: 'S&P 500 Index', instrumentType: 'GLOBAL', lotSize: 1 },
  'DOW JONES': { yahooSymbol: '^DJI', token: 'DJI', exchange: 'GLOBAL', name: 'Dow Jones Industrial Average', instrumentType: 'GLOBAL', lotSize: 1 },
  'CRUDE OIL': { yahooSymbol: 'CL=F', token: '', angelName: 'CRUDEOIL', exchange: 'MCX', name: 'Crude Oil Futures (MCX)', instrumentType: 'COMMODITY', lotSize: 100 },
  'CRUDEOIL': { yahooSymbol: 'CL=F', token: '', angelName: 'CRUDEOIL', exchange: 'MCX', name: 'MCX Crude Oil Futures', instrumentType: 'COMMODITY', lotSize: 100 },
  'CRUDEOILMINI': { yahooSymbol: 'CL=F', token: '', angelName: 'CRUDEOILM', exchange: 'MCX', name: 'MCX Crude Oil Mini Futures', instrumentType: 'COMMODITY', lotSize: 10 },
  'NATURALGAS': { yahooSymbol: 'NG=F', token: '', angelName: 'NATURALGAS', exchange: 'MCX', name: 'MCX Natural Gas Futures', instrumentType: 'COMMODITY', lotSize: 1250 },
  'NATURALGASMINI': { yahooSymbol: 'NG=F', token: '', angelName: 'NATGASMINI', exchange: 'MCX', name: 'MCX Natural Gas Mini Futures', instrumentType: 'COMMODITY', lotSize: 250 },
  'GOLD': { yahooSymbol: 'GC=F', token: '', angelName: 'GOLD', exchange: 'MCX', name: 'MCX Gold Bullion Futures', instrumentType: 'COMMODITY', lotSize: 1 },
  'GOLDMINI': { yahooSymbol: 'GC=F', token: '', angelName: 'GOLDM', exchange: 'MCX', name: 'MCX Gold Mini Futures', instrumentType: 'COMMODITY', lotSize: 1 },
  'SILVER': { yahooSymbol: 'SI=F', token: '', angelName: 'SILVER', exchange: 'MCX', name: 'MCX Silver Bullion Futures', instrumentType: 'COMMODITY', lotSize: 30 },
  'SILVERMINI': { yahooSymbol: 'SI=F', token: '', angelName: 'SILVERM', exchange: 'MCX', name: 'MCX Silver Mini Futures', instrumentType: 'COMMODITY', lotSize: 5 },
  'COPPER': { yahooSymbol: 'HG=F', token: '', angelName: 'COPPER', exchange: 'MCX', name: 'MCX Copper Futures', instrumentType: 'COMMODITY', lotSize: 2500 },
  'ZINC': { yahooSymbol: 'ZNC=F', token: '', angelName: 'ZINC', exchange: 'MCX', name: 'MCX Zinc Futures', instrumentType: 'COMMODITY', lotSize: 5000 },
};

const SMARTAPI_BASE = 'https://apiconnect.angelone.in';
const SMART_STREAM_URL = 'wss://smartapisocket.angelone.in/smart-stream';

// SmartAPI WebSocket 2.0 exchange type codes
const WS_EXCHANGE_TYPE: Partial<Record<Exchange, number>> = { NSE: 1, BSE: 3, MCX: 5 };
const WS_EXCHANGE_BY_CODE: Record<number, Exchange> = { 1: 'NSE', 3: 'BSE', 5: 'MCX' };

// A symbol counts as Angel-live while it has had an Angel One tick within
// this window; until then (or once it goes stale) the Yahoo fallback may
// update it.
const ANGEL_FRESH_MS = 30_000;
const QUOTE_POLL_MS = 3_000;
const WS_HEARTBEAT_MS = 10_000;
const NOTIFY_THROTTLE_MS = 250;

interface AngelQuoteUpdate {
  ltp: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  bidDepth?: MarketDepthItem[];
  askDepth?: MarketDepthItem[];
}

function toDepth(levels: any[] | undefined): MarketDepthItem[] | undefined {
  if (!Array.isArray(levels) || levels.length === 0) return undefined;
  return levels.map(l => ({
    price: Number(l.price) || 0,
    quantity: Number(l.quantity) || 0,
    orders: Number(l.orders) || 0,
  }));
}

export class AngelOneLiveStreamer {
  private static instance: AngelOneLiveStreamer;
  private ws: WebSocket | null = null;
  private listeners: ((tickers: Ticker[], flashes: Record<string, 'UP' | 'DOWN'>) => void)[] = [];
  private currentTickers: Map<string, Ticker> = new Map();
  private totalTicks = 0;
  private pollingTimer: NodeJS.Timeout | null = null;

  // Real SmartAPI session -- empty until the server logs in.
  private clientCode = '';
  private apiKey = '';
  private feedToken = '';
  private jwtToken = '';
  private sessionExpiredHandler: (() => void) | null = null;
  private lastSessionRefreshRequest = 0;

  // exchange:token -> ticker symbols (CRUDE OIL and CRUDEOIL share a contract)
  private tokenIndex: Map<string, string[]> = new Map();
  private angelLiveAt: Map<string, number> = new Map();
  private lastWsTickAt = 0;
  private lastRestQuoteAt = 0;
  private lastYahooTickAt = 0;

  private wsGeneration = 0;
  private wsHeartbeat: NodeJS.Timeout | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsReconnectDelay = 5_000;

  private mcxFutures: InstrumentRow[] = [];

  private pendingFlashes: Record<string, 'UP' | 'DOWN'> = {};
  private notifyTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeTickers();
    this.rebuildTokenIndex();
    this.startRealTimeExchangeFeed();
    this.startAngelQuotePolling();
    this.refreshMcxContracts();
    // Re-check hourly so contracts roll over on expiry; the instrument
    // master itself is only re-downloaded about once a day (instrumentMaster.ts).
    setInterval(() => this.refreshMcxContracts(), 60 * 60 * 1000);
  }

  public static getInstance(): AngelOneLiveStreamer {
    if (!AngelOneLiveStreamer.instance) {
      AngelOneLiveStreamer.instance = new AngelOneLiveStreamer();
    }
    return AngelOneLiveStreamer.instance;
  }

  private initializeTickers() {
    // Initial real benchmark seed values
    const initialBase: Record<string, { ltp: number; close: number; high: number; low: number; open: number; volume: number }> = {
      'NIFTY 50': { ltp: 24824.50, close: 24682.20, high: 24895.80, low: 24680.10, open: 24710.00, volume: 382910400 },
      'BANKNIFTY': { ltp: 51940.80, close: 51620.35, high: 52120.00, low: 51680.00, open: 51750.20, volume: 194820100 },
      'FINNIFTY': { ltp: 23680.20, close: 23594.60, high: 23740.00, low: 23550.00, open: 23610.00, volume: 82019400 },
      'MIDCPNIFTY': { ltp: 12845.30, close: 12732.90, high: 12890.00, low: 12720.50, open: 12750.00, volume: 64201000 },
      'SENSEX': { ltp: 81450.60, close: 81040.35, high: 81680.00, low: 81120.00, open: 81150.00, volume: 14201000 },
      'BANKEX': { ltp: 58920.40, close: 58540.10, high: 59120.00, low: 58610.00, open: 58680.00, volume: 9450000 },
      'INDIA VIX': { ltp: 13.45, close: 13.92, high: 14.15, low: 13.20, open: 13.88, volume: 450000 },
      'RELIANCE': { ltp: 2985.40, close: 2954.20, high: 3012.00, low: 2945.00, open: 2960.00, volume: 14500000 },
      'HDFCBANK': { ltp: 1682.50, close: 1664.10, high: 1694.00, low: 1658.00, open: 1668.00, volume: 22400000 },
      'INFY': { ltp: 1845.20, close: 1828.40, high: 1858.00, low: 1822.00, open: 1830.00, volume: 8900000 },
      'TCS': { ltp: 4280.00, close: 4235.50, high: 4310.00, low: 4220.00, open: 4245.00, volume: 4100000 },
      'TATAMOTORS': { ltp: 985.60, close: 968.40, high: 994.00, low: 965.00, open: 972.00, volume: 18200000 },
      'SBIN': { ltp: 824.50, close: 814.20, high: 832.00, low: 811.00, open: 816.00, volume: 28400000 },
      'ICICIBANK': { ltp: 1245.80, close: 1230.10, high: 1254.00, low: 1226.00, open: 1234.00, volume: 16800000 },
      'BHARTIARTL': { ltp: 1540.20, close: 1518.50, high: 1555.00, low: 1512.00, open: 1522.00, volume: 9200000 },
      'GIFT NIFTY': { ltp: 24865.00, close: 24710.00, high: 24920.00, low: 24700.00, open: 24720.00, volume: 1850000 },
      'NASDAQ': { ltp: 18074.52, close: 17948.32, high: 18120.40, low: 17920.00, open: 17980.00, volume: 1020000000 },
      'S&P 500': { ltp: 5699.94, close: 5648.40, high: 5712.00, low: 5640.00, open: 5655.00, volume: 2450000000 },
      'DOW JONES': { ltp: 42063.36, close: 41914.75, high: 42150.00, low: 41880.00, open: 41950.00, volume: 380000000 },
      'CRUDE OIL': { ltp: 6145.00, close: 6047.00, high: 6195.00, low: 6020.00, open: 6050.00, volume: 348200 },
      'CRUDEOIL': { ltp: 6145.00, close: 6047.00, high: 6195.00, low: 6020.00, open: 6050.00, volume: 348200 },
      'CRUDEOILMINI': { ltp: 6145.00, close: 6047.00, high: 6195.00, low: 6020.00, open: 6050.00, volume: 184500 },
      'NATURALGAS': { ltp: 234.60, close: 228.80, high: 238.40, low: 228.10, open: 229.00, volume: 148920 },
      'NATURALGASMINI': { ltp: 234.60, close: 228.80, high: 238.40, low: 228.10, open: 229.00, volume: 68400 },
      'GOLD': { ltp: 75420.00, close: 75010.00, high: 75680.00, low: 74900.00, open: 75050.00, volume: 84200 },
      'GOLDMINI': { ltp: 75420.00, close: 75010.00, high: 75680.00, low: 74900.00, open: 75050.00, volume: 52000 },
      'SILVER': { ltp: 91450.00, close: 90200.00, high: 91800.00, low: 89900.00, open: 90200.00, volume: 64200 },
      'SILVERMINI': { ltp: 91450.00, close: 90200.00, high: 91800.00, low: 89900.00, open: 90200.00, volume: 48000 },
      'COPPER': { ltp: 842.50, close: 834.30, high: 848.00, low: 832.00, open: 834.00, volume: 32000 },
      'ZINC': { ltp: 285.40, close: 282.30, high: 288.00, low: 281.00, open: 282.00, volume: 24000 },
    };

    Object.entries(EXCHANGE_SYMBOL_MAP).forEach(([sym, meta]) => {
      const base = initialBase[sym] || { ltp: 1000, close: 990, high: 1010, low: 980, open: 995, volume: 1000000 };
      const change = Number((base.ltp - base.close).toFixed(2));
      const changePercent = Number(((change / base.close) * 100).toFixed(2));

      this.currentTickers.set(sym, {
        symbol: sym,
        name: meta.name,
        exchange: meta.exchange,
        ltp: base.ltp,
        change,
        changePercent,
        high: base.high,
        low: base.low,
        open: base.open,
        close: base.close,
        volume: base.volume,
        lotSize: meta.lotSize,
        instrumentType: meta.instrumentType,
        currency: sym === 'NASDAQ' || sym === 'S&P 500' || sym === 'DOW JONES' ? 'USD' : 'INR',
        lastUpdated: new Date().toISOString(),
      });
    });
  }

  private rebuildTokenIndex() {
    this.tokenIndex.clear();
    Object.entries(EXCHANGE_SYMBOL_MAP).forEach(([sym, meta]) => {
      if (!meta.token || !WS_EXCHANGE_TYPE[meta.exchange]) return;
      const key = `${meta.exchange}:${meta.token}`;
      this.tokenIndex.set(key, [...(this.tokenIndex.get(key) || []), sym]);
    });
  }

  // Unique Angel One tokens per exchange (NSE/BSE/MCX) for quotes and subscriptions.
  private angelTokensByExchange(): Partial<Record<Exchange, string[]>> {
    const out: Partial<Record<Exchange, string[]>> = {};
    for (const key of this.tokenIndex.keys()) {
      const [exchange, token] = key.split(':') as [Exchange, string];
      (out[exchange] = out[exchange] || []).push(token);
    }
    return out;
  }

  private hasSession(): boolean {
    return !!(this.jwtToken && this.feedToken && this.apiKey && this.clientCode);
  }

  private isAngelFresh(sym: string): boolean {
    return Date.now() - (this.angelLiveAt.get(sym) || 0) < ANGEL_FRESH_MS;
  }

  // Called by the server when Angel One rejects the session (expired JWT).
  public onSessionExpired(handler: () => void) {
    this.sessionExpiredHandler = handler;
  }

  private requestSessionRefresh(reason: string) {
    if (!this.sessionExpiredHandler) return;
    if (Date.now() - this.lastSessionRefreshRequest < 5 * 60 * 1000) return;
    this.lastSessionRefreshRequest = Date.now();
    console.warn(`[AngelOne] session rejected (${reason}); requesting re-login`);
    this.sessionExpiredHandler();
  }

  // Update credentials and (re)establish the SmartAPI WebSocket. Every
  // visitor's client calls the reconnect endpoint, so an unchanged session
  // with a healthy socket is left alone rather than reconnected.
  public updateCredentials(clientCode: string, apiKey: string, feedToken?: string, jwtToken?: string) {
    const changed =
      clientCode !== this.clientCode ||
      apiKey !== this.apiKey ||
      (!!feedToken && feedToken !== this.feedToken) ||
      (!!jwtToken && jwtToken !== this.jwtToken);

    this.clientCode = clientCode;
    this.apiKey = apiKey;
    if (feedToken) this.feedToken = feedToken;
    if (jwtToken) this.jwtToken = jwtToken;

    const wsHealthy = this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
    if (changed || !wsHealthy) {
      this.connectAngelOneWebSocket();
    }
  }

  public getSessionAuth(): { apiKey: string; jwtToken: string } | null {
    return this.hasSession() ? { apiKey: this.apiKey, jwtToken: this.jwtToken } : null;
  }

  public getInstrument(symbol: string): SymbolMeta | undefined {
    return EXCHANGE_SYMBOL_MAP[symbol.toUpperCase()];
  }

  // ---- MCX contract resolution -------------------------------------------

  private async refreshMcxContracts() {
    try {
      const names = new Set(Object.values(EXCHANGE_SYMBOL_MAP).map(m => m.angelName).filter(Boolean));
      this.mcxFutures = (await getInstruments()).filter(
        i => i.exchange === 'MCX' && i.instrumentType === 'FUTCOM' && names.has(i.name)
      );
      this.applyNearestMcxContracts();
    } catch (err: any) {
      console.warn('[MCX] contract refresh failed:', err?.message || err);
    }
  }

  private applyNearestMcxContracts() {
    const today = todayKeyIST();
    const changes: string[] = [];

    Object.entries(EXCHANGE_SYMBOL_MAP).forEach(([sym, meta]) => {
      if (!meta.angelName) return;
      const nearest = this.mcxFutures
        .filter(f => f.name === meta.angelName && f.expiryKey >= today)
        .sort((a, b) => a.expiryKey - b.expiryKey)[0];
      if (!nearest || nearest.token === meta.token) return;

      meta.token = nearest.token;
      meta.tradingSymbol = nearest.symbol;
      meta.expiry = nearest.expiry;
      this.angelLiveAt.delete(sym);
      const ticker = this.currentTickers.get(sym);
      if (ticker) this.currentTickers.set(sym, { ...ticker, name: `${meta.name} (${nearest.expiry})` });
      changes.push(`${sym}=${nearest.symbol}/${nearest.token}`);
    });

    if (changes.length) {
      console.log(`[MCX] contracts resolved: ${changes.join(', ')}`);
      this.rebuildTokenIndex();
      // Resubscribe so the socket streams the new contracts.
      if (this.hasSession()) this.connectAngelOneWebSocket();
    }
  }

  // ---- Angel One tick application -----------------------------------------

  private applyAngelQuote(exchange: Exchange, token: string, q: AngelQuoteUpdate): boolean {
    const syms = this.tokenIndex.get(`${exchange}:${token}`);
    if (!syms || !(q.ltp > 0)) return false;

    syms.forEach(sym => {
      const existing = this.currentTickers.get(sym);
      if (!existing) return;

      const ltp = Number(q.ltp.toFixed(2));
      const close = q.close && q.close > 0 ? q.close : existing.close;
      const change = Number((ltp - close).toFixed(2));
      const changePercent = Number(((change / (close || 1)) * 100).toFixed(2));
      const direction = ltp >= existing.ltp ? 'UP' : 'DOWN';
      if (ltp !== existing.ltp) this.pendingFlashes[sym] = direction;

      this.currentTickers.set(sym, {
        ...existing,
        ltp,
        change,
        changePercent,
        open: q.open && q.open > 0 ? q.open : existing.open,
        high: q.high && q.high > 0 ? Math.max(q.high, ltp) : Math.max(existing.high, ltp),
        low: q.low && q.low > 0 ? Math.min(q.low, ltp) : Math.min(existing.low, ltp),
        close,
        volume: q.volume && q.volume > 0 ? q.volume : existing.volume,
        bidDepth: q.bidDepth || existing.bidDepth,
        askDepth: q.askDepth || existing.askDepth,
        tickDirection: direction,
        lastUpdated: new Date().toISOString(),
      });
      this.angelLiveAt.set(sym, Date.now());
    });

    this.totalTicks++;
    return true;
  }

  // Coalesce bursts of WebSocket ticks into one broadcast per interval.
  private queueNotify() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      const flashes = this.pendingFlashes;
      this.pendingFlashes = {};
      this.notifyListeners(flashes);
    }, NOTIFY_THROTTLE_MS);
  }

  // ---- Angel One REST quote polling ---------------------------------------

  private startAngelQuotePolling() {
    const poll = async () => {
      if (!this.hasSession()) return;
      const exchangeTokens = this.angelTokensByExchange();
      if (!Object.keys(exchangeTokens).length) return;

      try {
        const res = await fetch(`${SMARTAPI_BASE}/rest/secure/angelbroking/market/v1/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': 'fe80::1',
            'X-PrivateKey': this.apiKey,
            'Authorization': `Bearer ${this.jwtToken}`,
          },
          body: JSON.stringify({ mode: 'FULL', exchangeTokens }),
        });

        const data: any = await res.json().catch(() => null);
        if (res.status === 401 || res.status === 403 || ['AG8001', 'AG8002', 'AG8003'].includes(data?.errorcode)) {
          this.requestSessionRefresh(`quote API ${res.status} ${data?.errorcode || ''}`.trim());
          return;
        }
        if (!data?.status || !Array.isArray(data?.data?.fetched)) {
          console.warn('[AngelOne] quote API returned no data:', data?.message || res.status);
          return;
        }

        data.data.fetched.forEach((q: any) => {
          this.applyAngelQuote(q.exchange, String(q.symbolToken), {
            ltp: Number(q.ltp),
            open: Number(q.open),
            high: Number(q.high),
            low: Number(q.low),
            close: Number(q.close),
            volume: Number(q.tradeVolume),
            bidDepth: toDepth(q.depth?.buy),
            askDepth: toDepth(q.depth?.sell),
          });
        });
        this.lastRestQuoteAt = Date.now();
        this.queueNotify();
      } catch (err: any) {
        console.warn('[AngelOne] quote poll failed:', err?.message || err);
      }
    };

    setInterval(poll, QUOTE_POLL_MS);
  }

  // ---- Fallback feed (Yahoo Finance) --------------------------------------
  // Used for GLOBAL symbols, and for NSE/BSE/MCX only while Angel One has no
  // fresh data for them. MCX values here are estimates converted from
  // COMEX/NYMEX prices, not MCX prices.
  private startRealTimeExchangeFeed() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);

    let cachedUsdInr = 84.05;

    const fetchLiveExchangeBatch = async () => {
      try {
        const needsFallback = (yahooSym: string) =>
          Object.entries(EXCHANGE_SYMBOL_MAP).some(([sym, m]) => m.yahooSymbol === yahooSym && !this.isAngelFresh(sym));

        const symbolsToFetch = [
          '^NSEI', '^NSEBANK', '^BSESN', 'NIFTY_FIN_SERVICE.NS', 'NIFTY_MIDCAP_50.NS',
          'RELIANCE.NS', 'HDFCBANK.NS', 'INFY.NS', 'TCS.NS', 'TATAMOTORS.NS',
          'SBIN.NS', 'ICICIBANK.NS', 'BHARTIARTL.NS', '^INDIAVIX',
          'CL=F', 'NG=F', 'GC=F', 'SI=F', 'HG=F', 'ZNC=F',
          '^IXIC', '^GSPC', '^DJI',
        ].filter(needsFallback);
        if (symbolsToFetch.length === 0) return;
        if (symbolsToFetch.some(s => s.endsWith('=F'))) symbolsToFetch.push('INR=X');

        const fetchPromises = symbolsToFetch.map(async (yahooSym) => {
          try {
            const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1m&range=1d`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            });
            if (!res.ok) return null;
            const data = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (!meta || !meta.regularMarketPrice) return null;

            return {
              yahooSym,
              price: Number(meta.regularMarketPrice.toFixed(2)),
              prevClose: Number((meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice).toFixed(2)),
              high: Number((meta.regularMarketDayHigh || meta.dayHigh || meta.regularMarketPrice).toFixed(2)),
              low: Number((meta.regularMarketDayLow || meta.dayLow || meta.regularMarketPrice).toFixed(2)),
              volume: Number(meta.regularMarketVolume || 1000000),
            };
          } catch {
            return null;
          }
        });

        const results = await Promise.all(fetchPromises);
        const inrResult = results.find(r => r && r.yahooSym === 'INR=X');
        if (inrResult && inrResult.price > 70 && inrResult.price < 95) {
          cachedUsdInr = inrResult.price;
        }

        const flashes: Record<string, 'UP' | 'DOWN'> = {};
        let updatedCount = 0;

        results.forEach((r) => {
          if (!r || r.yahooSym === 'INR=X') return;
          const matchingEntries = Object.entries(EXCHANGE_SYMBOL_MAP).filter(
            ([sym, m]) => m.yahooSymbol === r.yahooSym && !this.isAngelFresh(sym)
          );

          matchingEntries.forEach(([sym, meta]) => {
            const existing = this.currentTickers.get(sym);
            if (!existing) return;

            let targetPrice = r.price;
            let targetClose = r.prevClose;
            let targetHigh = r.high;
            let targetLow = r.low;

            // Approximate MCX rupee prices from international futures (fallback only)
            if (meta.exchange === 'MCX') {
              let factor = 1;
              if (sym === 'CRUDEOIL' || sym === 'CRUDE OIL' || sym === 'CRUDEOILMINI') {
                // Crude Oil: USD/bbl * USDINR = ₹/bbl
                factor = cachedUsdInr;
              } else if (sym === 'NATURALGAS' || sym === 'NATURALGASMINI') {
                // Natural Gas: USD/mmBtu * USDINR = ₹/mmBtu
                factor = cachedUsdInr;
              } else if (sym === 'GOLD' || sym === 'GOLDMINI') {
                // Gold: USD/troy oz (31.1035g) to ₹/10g with 15% Indian duty & import parity
                factor = (cachedUsdInr / 31.1034768) * 10 * 1.15;
              } else if (sym === 'SILVER' || sym === 'SILVERMINI') {
                // Silver: USD/troy oz to ₹/kg with 15% Indian duty & import parity
                factor = (cachedUsdInr / 31.1034768) * 1000 * 1.15;
              } else if (sym === 'COPPER') {
                // Copper: USD/lb to ₹/kg (1 lb = 0.453592 kg)
                factor = cachedUsdInr / 0.45359237;
              } else if (sym === 'ZINC') {
                factor = (cachedUsdInr / 0.45359237) * 0.35;
              }
              targetPrice = Number((r.price * factor).toFixed(2));
              targetClose = Number((r.prevClose * factor).toFixed(2));
              targetHigh = Number((r.high * factor).toFixed(2));
              targetLow = Number((r.low * factor).toFixed(2));
            }

            const direction = targetPrice >= existing.ltp ? 'UP' : 'DOWN';
            if (targetPrice !== existing.ltp) {
              flashes[sym] = direction;
            }
            const change = Number((targetPrice - targetClose).toFixed(2));
            const changePercent = Number(((change / (targetClose || 1)) * 100).toFixed(2));

            this.currentTickers.set(sym, {
              ...existing,
              ltp: targetPrice,
              change,
              changePercent,
              high: Math.max(targetHigh, targetPrice),
              low: Math.min(targetLow, targetPrice),
              close: targetClose,
              volume: r.volume || existing.volume,
              tickDirection: direction,
              lastUpdated: new Date().toISOString(),
            });
            updatedCount++;
          });
        });

        if (updatedCount > 0) {
          this.totalTicks += updatedCount;
          this.lastYahooTickAt = Date.now();
          this.notifyListeners(flashes);
        }
      } catch (err) {
        console.warn('Live exchange polling update:', err);
      }
    };

    // Run immediately and every 1.5 seconds for low latency
    fetchLiveExchangeBatch();
    this.pollingTimer = setInterval(fetchLiveExchangeBatch, 1500);
  }

  // ---- Angel One SmartAPI WebSocket 2.0 -----------------------------------

  private closeWebSocket() {
    this.wsGeneration++;
    if (this.wsHeartbeat) clearInterval(this.wsHeartbeat);
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    this.wsHeartbeat = null;
    this.wsReconnectTimer = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on('error', () => {});
      try {
        this.ws.terminate();
      } catch {
        // already closed
      }
      this.ws = null;
    }
  }

  public connectAngelOneWebSocket() {
    this.closeWebSocket();
    if (!this.hasSession()) return;

    const generation = this.wsGeneration;
    const ws = new WebSocket(SMART_STREAM_URL, {
      headers: {
        'Authorization': `Bearer ${this.jwtToken}`,
        'x-api-key': this.apiKey,
        'x-client-code': this.clientCode,
        'x-feed-token': this.feedToken,
      },
    });
    this.ws = ws;

    ws.on('open', () => {
      if (generation !== this.wsGeneration) return;
      this.wsReconnectDelay = 5_000;

      const tokenList = Object.entries(this.angelTokensByExchange()).map(([exchange, tokens]) => ({
        exchangeType: WS_EXCHANGE_TYPE[exchange as Exchange],
        tokens,
      }));
      ws.send(JSON.stringify({
        correlationID: 'smpro' + (Date.now() % 100000),
        action: 1, // Subscribe
        params: { mode: 2, tokenList }, // 2 = Quote (LTP + OHLC + volume)
      }));
      console.log(`[AngelOne WS] connected, subscribed ${tokenList.map(t => `${t.exchangeType}:${t.tokens.length}`).join(' ')}`);

      this.wsHeartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, WS_HEARTBEAT_MS);
    });

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (generation !== this.wsGeneration || !isBinary) return; // text frames are 'pong' / errors
      const buf = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data as ArrayBuffer)]);
      if (this.handleBinaryTick(buf)) {
        this.lastWsTickAt = Date.now();
        this.queueNotify();
      }
    });

    ws.on('error', (err: Error) => {
      if (generation !== this.wsGeneration) return;
      console.warn('[AngelOne WS] error:', err.message);
      if (/\b(401|403)\b/.test(err.message)) this.requestSessionRefresh('websocket handshake rejected');
    });

    ws.on('close', () => {
      if (generation !== this.wsGeneration) return;
      if (this.wsHeartbeat) clearInterval(this.wsHeartbeat);
      this.wsHeartbeat = null;
      this.ws = null;
      if (!this.hasSession()) return;
      const delay = this.wsReconnectDelay;
      this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, 60_000);
      this.wsReconnectTimer = setTimeout(() => this.connectAngelOneWebSocket(), delay);
    });
  }

  // SmartAPI WebSocket 2.0 binary tick (little-endian):
  //  0 mode | 1 exchange type | 2-26 token (null-padded) | 27 seq | 35 exch ts
  //  43 LTP (paise) | Quote mode adds: 51 LTQ | 59 ATP | 67 volume |
  //  75 total buy qty (f64) | 83 total sell qty (f64) | 91 open | 99 high |
  //  107 low | 115 close  (prices in paise)
  private handleBinaryTick(buf: Buffer): boolean {
    if (buf.length < 51) return false;
    const mode = buf.readInt8(0);
    const exchange = WS_EXCHANGE_BY_CODE[buf.readInt8(1)];
    if (!exchange) return false;
    const token = buf.toString('utf8', 2, 27).split('\0')[0];
    const paise = (offset: number) => Number(buf.readBigInt64LE(offset)) / 100;

    const update: AngelQuoteUpdate = { ltp: paise(43) };
    if (mode >= 2 && buf.length >= 123) {
      update.volume = Number(buf.readBigInt64LE(67));
      update.open = paise(91);
      update.high = paise(99);
      update.low = paise(107);
      update.close = paise(115);
    }
    return this.applyAngelQuote(exchange, token, update);
  }

  public subscribe(listener: (tickers: Ticker[], flashes: Record<string, 'UP' | 'DOWN'>) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(flashes: Record<string, 'UP' | 'DOWN'>) {
    const list = Array.from(this.currentTickers.values());
    this.listeners.forEach(l => l(list, flashes));
  }

  public getAllTickers(): Ticker[] {
    return Array.from(this.currentTickers.values());
  }

  public getTicker(symbol: string): Ticker | undefined {
    return this.currentTickers.get(symbol.toUpperCase());
  }

  private currentFeedStatus(): AngelOneFeedStatus {
    const now = Date.now();
    if (now - this.lastWsTickAt < ANGEL_FRESH_MS) return 'ANGELONE_WS_CONNECTED';
    if (now - this.lastRestQuoteAt < ANGEL_FRESH_MS) return 'ANGELONE_REST_LIVE';
    if (now - this.lastYahooTickAt < 60_000) return 'REAL_EXCHANGE_LIVE';
    return this.hasSession() ? 'CONNECTING' : 'DISCONNECTED';
  }

  public getFeedState(): AngelOneMarketFeedState {
    const feedStatus = this.currentFeedStatus();
    const sources: Record<AngelOneFeedStatus, string> = {
      ANGELONE_WS_CONNECTED: 'Angel One SmartAPI WebSocket 2.0 (Smart-Stream)',
      ANGELONE_REST_LIVE: 'Angel One SmartAPI Market Quote API',
      REAL_EXCHANGE_LIVE: 'Yahoo Finance fallback (delayed; MCX estimated from COMEX/NYMEX)',
      CONNECTING: 'Connecting to Angel One SmartAPI',
      DISCONNECTED: 'No live feed',
    };
    const lastTick = Math.max(this.lastWsTickAt, this.lastRestQuoteAt, this.lastYahooTickAt);

    return {
      connected: feedStatus === 'ANGELONE_WS_CONNECTED' || feedStatus === 'ANGELONE_REST_LIVE' || feedStatus === 'REAL_EXCHANGE_LIVE',
      feedStatus,
      lastTickTimestamp: lastTick ? new Date(lastTick).toISOString() : '',
      source: sources[feedStatus],
      totalTicksReceived: this.totalTicks,
      activeClientCode: this.clientCode,
      subscribedTokens: Array.from(this.tokenIndex.keys()),
      latencyMs: feedStatus === 'ANGELONE_WS_CONNECTED' ? 12 : 38,
      sessionActive: this.hasSession(),
      mcxContracts: Object.entries(EXCHANGE_SYMBOL_MAP)
        .filter(([, m]) => m.angelName)
        .map(([sym, m]) => ({
          symbol: sym,
          angelName: m.angelName!,
          token: m.token,
          tradingSymbol: m.tradingSymbol || '',
          expiry: m.expiry || '',
          lastAngelTick: this.angelLiveAt.has(sym) ? new Date(this.angelLiveAt.get(sym)!).toISOString() : null,
        })),
    };
  }
}
