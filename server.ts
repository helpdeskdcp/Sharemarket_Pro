import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WSClient } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import * as OTPAuth from 'otpauth';
import crypto from 'crypto';
import { generateCandleHistory, WORLD_CLASS_STRATEGIES, DEFAULT_WEBHOOK_SETTINGS, DEFAULT_ENGINE_SETTINGS } from './src/data/marketData';
import { AuditLog, DeveloperSettings, GttOrder, BacktestResult, AlertWebhookSettings, Ticker, PriceActionSignal } from './src/types/market';
import { AngelOneLiveStreamer, EXCHANGE_SYMBOL_MAP } from './src/services/angelOneLiveService';
import { PriceActionStrategyEngine, INITIAL_PRICE_ACTION_SIGNALS } from './src/services/priceActionEngine';
import { getAngelCandles, AngelCandleInterval } from './src/services/angelOneApi';
import { LiveSignalEngine, SignalEvent } from './src/services/liveSignalEngine';
import { getLiveOptionChain, OptionChainError } from './src/services/optionChainService';

dotenv.config();

const app = express();
const PORT = 3000;

// Admin auth gate: every endpoint that reads/writes broker credentials,
// payment gateway keys, or Telegram broadcast config previously had NO
// authentication at all -- reachable and readable/writable by anyone on
// the internet the moment this app was put behind a public domain. This
// requires a shared secret (set ADMIN_API_TOKEN in .env) sent as the
// X-Admin-Token header. If ADMIN_API_TOKEN is unset, these routes are
// refused entirely (fail closed) rather than silently left open.
function requireAdmin(req: Request, res: Response, next: () => void) {
  const configured = process.env.ADMIN_API_TOKEN;
  if (!configured) {
    res.status(503).json({ success: false, error: 'ADMIN_API_TOKEN is not configured on the server' });
    return;
  }
  const provided = req.header('X-Admin-Token');
  if (provided !== configured) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}

const priceActionEngine = PriceActionStrategyEngine.getInstance();

app.use(express.json());

// In-memory persistent stores for Developer Settings and Audit Logs
let devSettings: DeveloperSettings = {
  angelOne: {
    apiKey: process.env.ANGELONE_API_KEY || 'ANGEL_LIVE_SANDBOX_KEY_8829',
    clientCode: process.env.ANGELONE_CLIENT_CODE || 'DCP78912',
    mpin: process.env.ANGELONE_MPIN || '1982',
    totpSecret: process.env.ANGELONE_TOTP_SECRET || 'JBSWY3DPEHPK3PXP',
    autoTotp: true,
    secretKey: '••••••••••••••••',
    // No session exists until a real /api/broker/angelone/auth login
    // succeeds -- previously these were fake-looking placeholder tokens
    // with connected:true baked in, claiming a broker session that never
    // actually happened.
    feedToken: '',
    jwtToken: '',
    refreshToken: '',
    isLive: false,
    connected: false,
    lastConnected: '',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_9kLmnO2P8QvXwY',
    keySecret: process.env.RAZORPAY_KEY_SECRET ? '••••••••••••••••' : 'rzp_sec_mock_491820384',
    webhookSecret: 'whsec_99182348572198',
    isLive: false,
  },
  executionMode: 'PAPER',
  webhooks: {
    ...DEFAULT_WEBHOOK_SETTINGS,
    telegram: {
      ...DEFAULT_WEBHOOK_SETTINGS.telegram,
      // Same env-var-first pattern already used for angelOne/razorpay
      // above: a real token/chat id in .env auto-enables broadcasting;
      // otherwise this stays safely disabled (DEFAULT_WEBHOOK_SETTINGS'
      // fail-closed defaults), never the old fake-demo-token behavior.
      botToken: process.env.TELEGRAM_BOT_TOKEN || DEFAULT_WEBHOOK_SETTINGS.telegram.botToken,
      chatId: process.env.TELEGRAM_CHAT_ID || DEFAULT_WEBHOOK_SETTINGS.telegram.chatId,
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      isConnected: !!process.env.TELEGRAM_BOT_TOKEN,
      autoBroadcastSignals: !!process.env.TELEGRAM_BOT_TOKEN,
    },
  },
  engines: DEFAULT_ENGINE_SETTINGS,
};

// Start with no fabricated trading/audit history -- INITIAL_AUDIT_LOGS and
// INITIAL_GTT_ORDERS were canned demo entries (fake past trades, fake
// pending GTT triggers) that never actually happened on this deployment.
let auditLogs: AuditLog[] = [];
let gttOrders: GttOrder[] = [];

// Initialize Real-time Angel One Market Streamer & Live Exchange Gateway
const angelOneStreamer = AngelOneLiveStreamer.getInstance();

// Server-Authoritative Live Ticker State from real market data streamer
let serverLiveTickers: Ticker[] = angelOneStreamer.getAllTickers();

// Connected Client Subscribers (SSE + Native WebSocket)
const sseClients = new Set<Response>();
const wsClients = new Set<WSClient>();

// Subscribe to real-time tick events from Angel One SmartAPI / Real Exchange
angelOneStreamer.subscribe((tickers, flashes) => {
  serverLiveTickers = tickers;

  const payload = JSON.stringify({
    type: 'TICK_UPDATE',
    feedSource: angelOneStreamer.getFeedState().source,
    feedStatus: angelOneStreamer.getFeedState().feedStatus,
    tickers,
    flashes,
    timestamp: Date.now(),
  });

  // Broadcast to SSE clients
  sseClients.forEach(client => {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  });

  // Broadcast to Native WebSocket clients
  wsClients.forEach(client => {
    try {
      if (client.readyState === WSClient.OPEN) {
        client.send(payload);
      }
    } catch {
      wsClients.delete(client);
    }
  });
});

// AI Strategy Advisor now calls OpenAI directly via fetch (replacing the
// previous @google/genai Gemini client per operator instruction) --
// matches this file's existing style of plain fetch() calls (see the
// Telegram/Yahoo Finance integrations below) rather than adding a new
// SDK dependency for one endpoint.
async function callOpenAIChatJson(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`OpenAI API returned ${response.status}: ${bodyText.slice(0, 200)}`);
  }

  const json: any = await response.json();
  return json?.choices?.[0]?.message?.content || null;
}

// Angel One SmartAPI: real broker login (replaces the previous simulated
// handshake that always returned fake JWT/margin data regardless of
// whether credentials were even valid). Same header set already proven
// against Angel One's REST API by the quote-fetch code in
// angelOneLiveService.ts (X-PrivateKey/X-UserType/X-SourceID/etc).
function angelOneHeaders(apiKey: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': 'fe80::1',
    'X-PrivateKey': apiKey,
    ...extra,
  };
}

interface AngelOneLoginResult {
  ok: boolean;
  message: string;
  errorcode?: string;
  jwtToken?: string;
  refreshToken?: string;
  feedToken?: string;
}

async function angelOneLogin(clientCode: string, mpin: string, totp: string, apiKey: string): Promise<AngelOneLoginResult> {
  const response = await fetch('https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword', {
    method: 'POST',
    headers: angelOneHeaders(apiKey),
    body: JSON.stringify({ clientcode: clientCode, password: mpin, totp }),
  });

  const json: any = await response.json().catch(() => null);
  if (!response.ok || !json || json.status !== true) {
    return {
      ok: false,
      message: json?.message || `Angel One login failed (HTTP ${response.status})`,
      errorcode: json?.errorcode,
    };
  }

  return {
    ok: true,
    message: json.message || 'SUCCESS',
    jwtToken: json.data?.jwtToken,
    refreshToken: json.data?.refreshToken,
    feedToken: json.data?.feedToken,
  };
}

interface AngelOneMargins {
  availableMargin: number;
  usedMargin: number;
  collateralValue: number;
}

async function angelOneFetchMargins(jwtToken: string, apiKey: string): Promise<AngelOneMargins | null> {
  try {
    const response = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getRMS', {
      method: 'GET',
      headers: angelOneHeaders(apiKey, { 'Authorization': `Bearer ${jwtToken}` }),
    });
    const json: any = await response.json().catch(() => null);
    if (!response.ok || !json || json.status !== true || !json.data) return null;

    return {
      availableMargin: Number(json.data.availablecash ?? json.data.net ?? 0),
      usedMargin: Number(json.data.utiliseddebits ?? 0),
      collateralValue: Number(json.data.collateral ?? 0),
    };
  } catch {
    return null;
  }
}

// Razorpay: real order creation + real HMAC signature verification.
// Previously /api/subscription/create-order fabricated a local order ID
// without ever calling Razorpay, and /api/subscription/verify accepted
// ANY payment_id/order_id as valid with no signature check at all --
// combined with the frontend's "simulated checkout" fallback (which ran
// whenever no real key was configured, i.e. always, until real Razorpay
// keys are set), this meant every "Subscribe" click granted free PRO
// access with zero payment collected. These fail closed instead: with no
// real RAZORPAY_KEY_ID/SECRET configured, they refuse rather than fake success.
function razorpayConfigured(): boolean {
  return !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
}

async function createRazorpayOrder(amountPaise: number, currency: string, receipt: string): Promise<{ ok: true; id: string; amount: number; currency: string } | { ok: false; error: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency, receipt }),
  });

  const json: any = await response.json().catch(() => null);
  if (!response.ok || !json?.id) {
    return { ok: false, error: json?.error?.description || `Razorpay order creation failed (HTTP ${response.status})` };
  }
  return { ok: true, id: json.id, amount: json.amount, currency: json.currency };
}

function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    angelOneConnected: devSettings.angelOne.connected,
  });
});

// Market Quotes / Tickers (Server-authoritative live ticker snapshot)
app.get('/api/market/tickers', (req: Request, res: Response) => {
  res.json({
    success: true,
    streaming: true,
    data: serverLiveTickers,
    timestamp: Date.now(),
  });
});

// Real-Time Server-Sent Events (SSE) Live Ticker Streaming Endpoint
app.get('/api/market/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial snapshot immediately
  res.write(`data: ${JSON.stringify({
    type: 'SNAPSHOT',
    tickers: serverLiveTickers,
    timestamp: Date.now(),
  })}\n\n`);

  sseClients.add(res);

  // Keep-alive heartbeat every 15s
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Option Chain Endpoint
app.get('/api/market/option-chain', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string) || 'NIFTY 50';
  const expiry = (req.query.expiry as string) || undefined;
  try {
    const data = await getLiveOptionChain(angelOneStreamer, symbol, expiry);
    res.json({ success: true, data });
  } catch (err: any) {
    const status = err instanceof OptionChainError ? err.status : 500;
    res.status(status).json({ success: false, error: err?.message || 'Option chain unavailable' });
  }
});

// Chart candles are cached; a failed refresh serves the last good Angel One
// candles instead of dropping to the Yahoo fallback. Requests share the
// account-wide rate-limit queue in angelOneApi.ts with the signal engine.
const angelCandleCache = new Map<string, { at: number; candles: any[] }>();

async function fetchAngelOneCandles(symbol: string, timeframe: string): Promise<any[] | null> {
  const key = `${symbol.toUpperCase()}|${timeframe}|${EXCHANGE_SYMBOL_MAP[symbol.toUpperCase()]?.token || ''}`;
  const cached = angelCandleCache.get(key);
  const ttl = timeframe === '1D' || timeframe === '1W' ? 60_000 : 15 * 60_000;
  if (cached && Date.now() - cached.at < ttl) return cached.candles;

  const candles = await requestAngelOneCandles(symbol, timeframe);
  if (candles) {
    angelCandleCache.set(key, { at: Date.now(), candles });
    return candles;
  }
  return cached && Date.now() - cached.at < 60 * 60_000 ? cached.candles : null;
}

// Real NSE/BSE/MCX candles from Angel One SmartAPI historical data.
async function requestAngelOneCandles(symbol: string, timeframe: string): Promise<any[] | null> {
  const meta = EXCHANGE_SYMBOL_MAP[symbol.toUpperCase()];
  const auth = angelOneStreamer.getSessionAuth();
  if (!meta || !auth || !meta.token || !['NSE', 'BSE', 'MCX'].includes(meta.exchange)) return null;

  const day = 24 * 60 * 60 * 1000;
  const spec: Record<string, { interval: AngelCandleInterval; days: number; intraday: boolean }> = {
    '1D': { interval: 'FIVE_MINUTE', days: 4, intraday: true },
    '1W': { interval: 'FIFTEEN_MINUTE', days: 7, intraday: true },
    '1M': { interval: 'ONE_DAY', days: 31, intraday: false },
    '1Y': { interval: 'ONE_DAY', days: 365, intraday: false },
  };
  const { interval, days, intraday } = spec[timeframe] || spec['1D'];
  const now = Date.now();

  let rows = await getAngelCandles(auth, meta.exchange, meta.token, interval, now - days * day, now);
  if (!rows || rows.length === 0) return null;

  // 1D shows only the latest session present in the window
  if (timeframe === '1D') {
    const lastDate = rows[rows.length - 1].dateKey;
    rows = rows.filter(r => r.dateKey === lastDate);
  }

  const candles = rows.map(r => {
    const d = new Date(r.ts);
    return {
      time: intraday
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
        : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    };
  });
  return candles.length > 5 ? withEma20(candles) : null;
}

function withEma20(candles: any[]): any[] {
  const k20 = 2 / (20 + 1);
  let ema20 = candles[0].close;
  for (let i = 0; i < candles.length; i++) {
    ema20 = candles[i].close * k20 + ema20 * (1 - k20);
    candles[i].ema20 = Number(ema20.toFixed(2));
  }
  return candles;
}

// Helper to fetch live candle history from exchange gateways
async function fetchLiveCandleHistory(symbol: string, timeframe: string): Promise<any[] | null> {
  const meta = EXCHANGE_SYMBOL_MAP[symbol.toUpperCase()];
  if (!meta) return null;

  let interval = '5m';
  let range = '1d';
  if (timeframe === '1D') {
    interval = '5m';
    range = '1d';
  } else if (timeframe === '1W') {
    interval = '15m';
    range = '5d';
  } else if (timeframe === '1M') {
    interval = '1d';
    range = '1mo';
  } else if (timeframe === '1Y') {
    interval = '1wk';
    range = '1y';
  }

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahooSymbol)}?interval=${interval}&range=${range}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];

    const candles: any[] = [];
    const ticker = serverLiveTickers.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());

    // Scaling ratio for MCX if USD-spot
    let scaleRatio = 1;
    if (meta.exchange === 'MCX' && ticker && closes[closes.length - 1] && closes[closes.length - 1] < ticker.ltp * 0.2) {
      scaleRatio = ticker.ltp / (closes[closes.length - 1] || 1);
    }

    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        const o = Number((opens[i] * scaleRatio).toFixed(2));
        const h = Number((highs[i] * scaleRatio).toFixed(2));
        const l = Number((lows[i] * scaleRatio).toFixed(2));
        const c = Number((closes[i] * scaleRatio).toFixed(2));
        const v = Number(volumes[i] || 1000);
        const timeStr = new Date(timestamps[i] * 1000).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        });
        candles.push({
          time: timeStr,
          open: o,
          high: Math.max(h, o, c),
          low: Math.min(l, o, c),
          close: c,
          volume: v,
        });
      }
    }

    if (candles.length > 5) {
      return withEma20(candles);
    }
    return null;
  } catch {
    return null;
  }
}

// Candle History Endpoint with Live Exchange History & Quant Fallback
app.get('/api/market/candles', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string) || 'NIFTY 50';
  const timeframe = (req.query.timeframe as string) || '1D';
  const points = timeframe === '1D' ? 60 : timeframe === '1W' ? 80 : timeframe === '1M' ? 90 : 120;
  
  const ticker = serverLiveTickers.find(t => t.symbol.toUpperCase() === symbol.toUpperCase()) || serverLiveTickers[0];
  const angelCandles = await fetchAngelOneCandles(symbol, timeframe);
  const liveCandles = angelCandles || await fetchLiveCandleHistory(symbol, timeframe);
  const candles = liveCandles || generateCandleHistory(ticker.ltp, points, timeframe);

  res.json({
    success: true,
    symbol: ticker.symbol,
    timeframe,
    source: angelCandles ? 'ANGELONE_HISTORY' : liveCandles ? 'EXCHANGE_LIVE_HISTORY' : 'QUANT_FALLBACK',
    data: candles,
  });
});

// AI Market Regime & Probabilistic Strategy Advisor
app.post('/api/ai/strategy-advisor', async (req: Request, res: Response) => {
  const { symbol, currentPrice, pcr, marketRegime, riskLevel, globalSentiment } = req.body;
  const targetSymbol = symbol || 'NIFTY 50';
  const price = currentPrice || 24824.50;
  const selectedRisk = riskLevel || 'BALANCED';

  if (process.env.OPENAI_API_KEY) {
    try {
      const prompt = `You are a SEBI-compliant Quantitative Share Market Analyst and Derivatives Strategist.
Evaluate the current market context:
- Underlying: ${targetSymbol} at ₹${price}
- Put-Call Ratio (PCR): ${pcr || 1.12}
- Market Regime / Tone: ${marketRegime || 'Consolidation near all-time highs'}
- User Risk Tolerance: ${selectedRisk}
- Global Macro Backdrop: ${globalSentiment || 'GIFT Nifty positive (+0.7%), NASDAQ firm (+0.86%), Crude steady'}

STRICT SEBI & REGULATORY COMPLIANCE REQUIREMENTS:
1. NEVER give guarantees (गॅरंटी).
2. NEVER say "sure shot", "100% win", "risk-free", or promise exact monetary returns.
3. ONLY express trade outcomes in strictly probabilistic terms (% Win Probability, Risk-Reward ratio, Max Drawdown).
4. State explicitly that this is strictly for educational, research, and technical analysis purposes only.
5. Remind users that we are NOT SEBI-registered brokers or financial advisors and they must consult a SEBI-registered RIA.
6. Acknowledge the SEBI research finding that 9 out of 10 individual traders in equity F&O incur net losses.

Provide a JSON response with:
{
  "marketRegime": "detected regime name",
  "volatilityAnalysis": "2-3 sentences analyzing IV and macro cues",
  "recommendedRiskLevel": "${selectedRisk}",
  "strategyName": "e.g. Delta-Neutral Iron Condor or Bull Call Spread",
  "riskRewardRatio": "e.g. 1 : 2.2",
  "targetLevel": number,
  "stopLossLevel": number,
  "rationale": "Clear statistical and technical reason",
  "greeks": {
    "netDelta": number,
    "netTheta": number,
    "netVega": number
  },
  "legs": [
    { "action": "BUY" or "SELL", "instrument": "string", "strike": number, "optionType": "CE" or "PE", "lots": 1, "estPrice": number }
  ],
  "sebiComplianceDisclaimer": "Strict SEBI warning statement"
}`;

      const responseText = await callOpenAIChatJson(prompt);
      if (!responseText) throw new Error('OpenAI returned no content');
      const parsedData = JSON.parse(responseText);
      return res.json({ success: true, source: 'openai', data: parsedData });
    } catch (err) {
      console.warn('OpenAI API call failed or timed out, using quant fallback:', err);
    }
  }

  // Fallback Quantitative Model (strictly probabilistic)
  const defaultStrat = WORLD_CLASS_STRATEGIES.find(s => s.riskLevel === selectedRisk) || WORLD_CLASS_STRATEGIES[0];
  res.json({
    success: true,
    source: 'quant_engine_fallback',
    data: {
      marketRegime: 'Rangebound Consolidation with Positive Global Bias',
      volatilityAnalysis: 'Implied Volatility (IV) hovering near 13.8. Low volatility environment favors credit collection or defined debit spreads.',
      recommendedRiskLevel: selectedRisk,
      winProbabilityPercent: defaultStrat.winProbabilityPercent,
      strategyName: defaultStrat.name,
      riskRewardRatio: defaultStrat.riskRewardRatio,
      targetLevel: defaultStrat.targetUnderlying,
      stopLossLevel: defaultStrat.stopLossUnderlying,
      rationale: defaultStrat.rationale,
      greeks: defaultStrat.greeksProfile,
      legs: defaultStrat.legs,
      sebiComplianceDisclaimer: 'SEBI NOTICE: Derivatives trading carries high capital loss risk. As per SEBI study, 9 out of 10 individual traders in F&O incur net losses. This analysis shows estimated statistical probabilities for educational purposes only. We are not SEBI registered advisors.',
    }
  });
});

// Generate TOTP from Secret Key (RFC 6238 pyotp-compatible)
app.post('/api/broker/angelone/generate-totp', requireAdmin, (req: Request, res: Response) => {
  const { totpSecret } = req.body;
  const secretKey = (totpSecret || devSettings.angelOne.totpSecret || 'JBSWY3DPEHPK3PXP')
    .replace(/\s+/g, '')
    .toUpperCase();

  try {
    const totpInstance = new OTPAuth.TOTP({
      issuer: 'AngelOne',
      label: devSettings.angelOne.clientCode || 'SmartAPI',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretKey),
    });

    const code = totpInstance.generate();
    const now = Math.floor(Date.now() / 1000);
    const secondsRemaining = 30 - (now % 30);

    res.json({
      success: true,
      code,
      secondsRemaining,
      period: 30,
      issuer: 'AngelOne',
      secretPreview: secretKey.substring(0, 4) + '••••' + secretKey.slice(-4),
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: 'Invalid Base32 TOTP secret key format.',
    });
  }
});

// Angel One SmartAPI Symbol Token Mapping Reference
const ANGEL_ONE_TOKEN_MAP: Record<string, { token: string; exchange: string; name: string }> = {
  'NIFTY 50': { token: '99926000', exchange: 'NSE', name: 'Nifty 50 Index' },
  'NIFTY': { token: '99926000', exchange: 'NSE', name: 'Nifty 50 Index' },
  'BANKNIFTY': { token: '99926009', exchange: 'NSE', name: 'Nifty Bank Index' },
  'FINNIFTY': { token: '99926037', exchange: 'NSE', name: 'Nifty Financial Services' },
  'MIDCPNIFTY': { token: '99926074', exchange: 'NSE', name: 'Nifty Midcap Select' },
  'SENSEX': { token: '99919000', exchange: 'BSE', name: 'BSE SENSEX Index' },
  'BANKEX': { token: '99919012', exchange: 'BSE', name: 'BSE BANKEX Index' },
  'INDIA VIX': { token: '99926017', exchange: 'NSE', name: 'India Volatility Index' },
  'RELIANCE': { token: '2885', exchange: 'NSE', name: 'Reliance Industries Ltd' },
  'HDFCBANK': { token: '1333', exchange: 'NSE', name: 'HDFC Bank Ltd' },
  'INFY': { token: '1594', exchange: 'NSE', name: 'Infosys Ltd' },
  'TCS': { token: '11536', exchange: 'NSE', name: 'Tata Consultancy Services' },
  'TATAMOTORS': { token: '3456', exchange: 'NSE', name: 'Tata Motors Ltd' },
  'SBIN': { token: '3045', exchange: 'NSE', name: 'State Bank of India' },
  'ICICIBANK': { token: '4963', exchange: 'NSE', name: 'ICICI Bank Ltd' },
  'BHARTIARTL': { token: '10604', exchange: 'NSE', name: 'Bharti Airtel Ltd' },
  'GIFT NIFTY': { token: 'SGX_NIFTY_FUT', exchange: 'GLOBAL', name: 'GIFT Nifty Index' },
  'NASDAQ': { token: 'IXIC', exchange: 'GLOBAL', name: 'Nasdaq Composite' },
  'S&P 500': { token: 'SPX', exchange: 'GLOBAL', name: 'S&P 500 Index' },
  'DOW JONES': { token: 'DJI', exchange: 'GLOBAL', name: 'Dow Jones Industrial' },
};

// MCX tokens roll monthly, so they come from the streamer's resolved
// nearest-expiry contracts rather than a fixed table.
function angelOneTokenMeta(symbol: string): { token: string; exchange: string; name: string } | undefined {
  const live = angelOneStreamer.getInstrument(symbol);
  if (live && live.exchange === 'MCX' && live.token) {
    return { token: live.token, exchange: 'MCX', name: live.tradingSymbol || live.name };
  }
  return ANGEL_ONE_TOKEN_MAP[symbol.toUpperCase()];
}

function formatAngelOneQuote(ticker: Ticker) {
  const meta = angelOneTokenMeta(ticker.symbol) || {
    token: `${Math.floor(1000 + Math.random() * 9000)}`,
    exchange: ticker.exchange || 'NSE',
    name: ticker.name,
  };

  const buyDepth = ticker.bidDepth || [
    { price: Number((ticker.ltp - 0.05).toFixed(2)), quantity: 1500, orders: 12 },
    { price: Number((ticker.ltp - 0.10).toFixed(2)), quantity: 3200, orders: 24 },
    { price: Number((ticker.ltp - 0.15).toFixed(2)), quantity: 4800, orders: 38 },
    { price: Number((ticker.ltp - 0.20).toFixed(2)), quantity: 7200, orders: 49 },
    { price: Number((ticker.ltp - 0.25).toFixed(2)), quantity: 11000, orders: 76 },
  ];

  const sellDepth = ticker.askDepth || [
    { price: Number((ticker.ltp + 0.05).toFixed(2)), quantity: 1400, orders: 10 },
    { price: Number((ticker.ltp + 0.10).toFixed(2)), quantity: 2900, orders: 19 },
    { price: Number((ticker.ltp + 0.15).toFixed(2)), quantity: 5100, orders: 34 },
    { price: Number((ticker.ltp + 0.20).toFixed(2)), quantity: 6800, orders: 45 },
    { price: Number((ticker.ltp + 0.25).toFixed(2)), quantity: 10400, orders: 68 },
  ];

  return {
    exchange: meta.exchange,
    tradingsymbol: ticker.symbol,
    symboltoken: meta.token,
    ltp: ticker.ltp,
    open: ticker.open,
    high: ticker.high,
    low: ticker.low,
    close: ticker.close,
    change: ticker.change,
    percentChange: ticker.changePercent,
    volume: ticker.volume,
    lastTradedQty: 25,
    totBuyQty: buyDepth.reduce((acc, cur) => acc + cur.quantity, 0),
    totSellQty: sellDepth.reduce((acc, cur) => acc + cur.quantity, 0),
    avgPrice: Number(((ticker.high + ticker.low + ticker.ltp) / 3).toFixed(2)),
    depth: {
      buy: buyDepth,
      sell: sellDepth,
    },
    feedStatus: 'LIVE_FEED',
    timestamp: ticker.lastUpdated || new Date().toISOString(),
  };
}

// Angel One SmartAPI Market Data: Single LTP / Quote
app.post('/api/broker/angelone/market-data/ltp', (req: Request, res: Response) => {
  const { symbol, exchange, symbolToken } = req.body;
  const query = (symbol || symbolToken || 'NIFTY 50').toString().toUpperCase();

  let ticker = serverLiveTickers.find(t => 
    t.symbol.toUpperCase() === query || 
    t.symbol.toUpperCase().replace(/\s+/g, '') === query.replace(/\s+/g, '')
  );

  if (!ticker) {
    // Check by token
    const mappedSymbol =
      Object.keys(ANGEL_ONE_TOKEN_MAP).find(k => ANGEL_ONE_TOKEN_MAP[k].token === query) ||
      Object.keys(EXCHANGE_SYMBOL_MAP).find(k => EXCHANGE_SYMBOL_MAP[k].token === query);
    if (mappedSymbol) {
      ticker = serverLiveTickers.find(t => t.symbol.toUpperCase() === mappedSymbol.toUpperCase());
    }
  }

  if (!ticker) {
    ticker = serverLiveTickers[0]; // default to NIFTY 50
  }

  const quote = formatAngelOneQuote(ticker);

  res.json({
    status: true,
    message: 'SUCCESS',
    errorcode: '',
    broker: 'Angel One SmartAPI',
    clientCode: devSettings.angelOne.clientCode,
    feedTokenActive: !!devSettings.angelOne.feedToken,
    data: quote,
  });
});

// Angel One SmartAPI Market Data: Full Watchlist Quotes & LTP
app.get('/api/broker/angelone/market-data/watchlist-ltp', (req: Request, res: Response) => {
  const quotes = serverLiveTickers.map(formatAngelOneQuote);

  res.json({
    success: true,
    status: true,
    message: 'SUCCESS',
    broker: 'Angel One SmartAPI Market Feed',
    feedStatus: 'LIVE_STREAMING_ACTIVE',
    clientCode: devSettings.angelOne.clientCode,
    lastUpdated: new Date().toISOString(),
    totalInstruments: quotes.length,
    quotes,
  });
});

// Broker Authentication (Angel One SmartAPI with MPIN & Auto-TOTP)
// Calls Angel One's real loginByPassword endpoint -- this used to return a
// fabricated JWT/margin response unconditionally regardless of whether the
// credentials were valid. A failed real login now returns success:false
// with Angel One's own error instead of pretending to connect.
app.post('/api/broker/angelone/auth', requireAdmin, async (req: Request, res: Response) => {
  const { clientCode, mpin, password, totp, totpSecret, apiKey, autoTotp } = req.body;

  const targetClient = clientCode || devSettings.angelOne.clientCode;
  const targetKey = apiKey || devSettings.angelOne.apiKey;
  const targetMpin = mpin || password || devSettings.angelOne.mpin || '1982';
  const targetSecret = (totpSecret || devSettings.angelOne.totpSecret || 'JBSWY3DPEHPK3PXP')
    .replace(/\s+/g, '')
    .toUpperCase();

  // Auto-generate TOTP using Secret if requested or omitted
  let activeTotp = totp;
  if (!activeTotp || activeTotp === 'AUTO') {
    try {
      const totpInstance = new OTPAuth.TOTP({
        issuer: 'AngelOne',
        label: targetClient,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(targetSecret),
      });
      activeTotp = totpInstance.generate();
    } catch (err) {
      res.status(400).json({ success: false, error: 'Failed to generate TOTP from the configured secret' });
      return;
    }
  }

  let loginResult: AngelOneLoginResult;
  try {
    loginResult = await angelOneLogin(targetClient, targetMpin, activeTotp, targetKey);
  } catch (err: any) {
    loginResult = { ok: false, message: err?.message || 'Angel One login request failed' };
  }

  if (!loginResult.ok) {
    auditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: targetClient,
      action: 'BROKER_AUTH_REQUEST',
      category: 'AUTH',
      status: 'FAILED',
      details: `Angel One SmartAPI login rejected. Client: ${targetClient}, Error: ${loginResult.errorcode || ''} ${loginResult.message}`,
      ipAddress: req.ip || '127.0.0.1',
    });
    res.status(401).json({
      success: false,
      connected: false,
      broker: 'Angel One SmartAPI',
      error: loginResult.message,
      errorcode: loginResult.errorcode,
    });
    return;
  }

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: targetClient,
    action: 'BROKER_AUTH_REQUEST',
    category: 'AUTH',
    status: 'SUCCESS',
    details: `Angel One SmartAPI handshake executed. Client: ${targetClient}, MPIN: [••••], Auto-TOTP: [used], Protocol: RFC-6238 pyotp-compatible`,
    ipAddress: req.ip || '127.0.0.1',
  });

  devSettings.angelOne.connected = true;
  devSettings.angelOne.isLive = true;
  devSettings.angelOne.lastConnected = new Date().toISOString();
  devSettings.angelOne.apiKey = targetKey;
  devSettings.angelOne.clientCode = targetClient;
  if (mpin) devSettings.angelOne.mpin = mpin;
  if (totpSecret) devSettings.angelOne.totpSecret = targetSecret;
  if (autoTotp !== undefined) devSettings.angelOne.autoTotp = autoTotp;

  const sessionJwt = loginResult.jwtToken!;
  const refreshJwt = loginResult.refreshToken || '';
  const feedToken = loginResult.feedToken || '';

  devSettings.angelOne.jwtToken = sessionJwt;
  devSettings.angelOne.refreshToken = refreshJwt;
  devSettings.angelOne.feedToken = feedToken;

  // Hand the real session's feedToken/apiKey/clientCode to the shared
  // live streamer so its WebSocket + REST quote polling (angelOneLiveService.ts)
  // start authenticating against Angel One for real instead of falling
  // through to the Yahoo Finance fallback feed.
  angelOneStreamer.updateCredentials(targetClient, targetKey, feedToken, sessionJwt);

  const margins = feedToken ? await angelOneFetchMargins(sessionJwt, targetKey) : null;

  res.json({
    success: true,
    connected: true,
    broker: 'Angel One SmartAPI',
    clientCode: devSettings.angelOne.clientCode,
    totpGeneratedAt: new Date().toISOString(),
    sessionToken: sessionJwt,
    jwtToken: sessionJwt,
    refreshToken: refreshJwt,
    feedToken: feedToken,
    availableMargin: margins?.availableMargin ?? null,
    usedMargin: margins?.usedMargin ?? null,
    collateralValue: margins?.collateralValue ?? null,
    marginsAvailable: !!margins,
    mode: devSettings.executionMode,
    message: 'Angel One SmartAPI authenticated successfully with MPIN and Auto-generated TOTP!',
  });
});

// Server-side Angel One session for the shared market feed. Logs in with
// the .env credentials at startup and every 6 hours (SmartAPI sessions
// expire daily), and again whenever the feed reports the session rejected.
// Without this the feed only went live after an admin logged in by hand.
let angelOneAutoLoginInFlight = false;

async function autoLoginAngelOne(reason: string) {
  const env = process.env;
  if (!env.ANGELONE_API_KEY || !env.ANGELONE_CLIENT_CODE || !env.ANGELONE_MPIN || !env.ANGELONE_TOTP_SECRET) {
    console.log('[AngelOne] auto-login skipped: ANGELONE_API_KEY/CLIENT_CODE/MPIN/TOTP_SECRET not all set');
    return;
  }
  if (angelOneAutoLoginInFlight) return;
  angelOneAutoLoginInFlight = true;

  const { clientCode, apiKey, mpin, totpSecret } = devSettings.angelOne;
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'AngelOne',
      label: clientCode,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(totpSecret.replace(/\s+/g, '').toUpperCase()),
    }).generate();

    const result = await angelOneLogin(clientCode, mpin, totp, apiKey);
    if (!result.ok || !result.jwtToken || !result.feedToken) {
      console.warn(`[AngelOne] auto-login (${reason}) failed: ${result.errorcode || ''} ${result.message}`);
      return;
    }

    devSettings.angelOne.connected = true;
    devSettings.angelOne.isLive = true;
    devSettings.angelOne.lastConnected = new Date().toISOString();
    devSettings.angelOne.jwtToken = result.jwtToken;
    devSettings.angelOne.refreshToken = result.refreshToken || '';
    devSettings.angelOne.feedToken = result.feedToken;
    angelOneStreamer.updateCredentials(clientCode, apiKey, result.feedToken, result.jwtToken);
    console.log(`[AngelOne] session established for ${clientCode} (${reason})`);
  } catch (err: any) {
    console.warn(`[AngelOne] auto-login (${reason}) error:`, err?.message || err);
  } finally {
    angelOneAutoLoginInFlight = false;
  }
}

angelOneStreamer.onSessionExpired(() => autoLoginAngelOne('session expired'));
setInterval(() => autoLoginAngelOne('scheduled refresh'), 6 * 60 * 60 * 1000);

// Live option signal engine. New signals and their target / SL / square-off
// updates are sent to Telegram from here, once, with the real premiums.
async function telegramAutoSend(html: string, logDetails: string) {
  const tg = devSettings.webhooks?.telegram;
  if (!tg?.enabled || !tg.autoBroadcastSignals) return;
  const result = await sendTelegramBroadcast(html);
  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: 'chanakya_engine',
    action: 'CHANAKYA_SIGNAL_TELEGRAM_BROADCAST',
    category: 'ALERT',
    status: result.success ? 'SUCCESS' : 'WARNING',
    details: `${logDetails} (${result.mode} mode)${result.error ? ` - ${result.error}` : ''}`,
    ipAddress: '127.0.0.1',
  });
}

const liveSignalEngine = new LiveSignalEngine(angelOneStreamer, priceActionEngine, {
  onNewSignal: signal => {
    broadcastSignalIds.add(signal.id);
    telegramAutoSend(
      formatPriceActionSignalTelegramHtml(signal, devSettings.webhooks?.telegram?.channelName),
      `New signal ${signal.optionSymbol} @ ₹${signal.optionEntryPrice}`
    );
  },
  onSignalEvent: (signal, event) => {
    telegramAutoSend(
      formatSignalUpdateTelegramHtml(signal, event, devSettings.webhooks?.telegram?.channelName),
      `${event} ${signal.optionSymbol} @ ₹${signal.exitPrice ?? signal.currentOptionPrice}`
    );
  },
});

// Developer Settings Config (GET & POST)
// This endpoint is called automatically for EVERY visitor on app load
// (see TradingContext.tsx) to pick up executionMode/webhooks/engines
// display config -- it can't be admin-gated outright without breaking
// the app for ordinary users. What it must never do is hand real broker/
// payment secrets to every visitor's browser: the raw admin.angelOne and
// devSettings.razorpay fields (apiKey, mpin, totpSecret, secretKey,
// feedToken, jwtToken, refreshToken, keySecret, webhookSecret) were
// previously sent to anyone who called this, unauthenticated. A valid
// X-Admin-Token unlocks the real values (needed so the Developer
// Settings panel can display what's currently configured); everyone
// else gets a redacted view with only what the live dashboard actually
// needs (clientCode/isLive/connected, keyId, and the telegram bot token
// masked to a boolean).
app.get('/api/developer/config', (req: Request, res: Response) => {
  const isAdmin = process.env.ADMIN_API_TOKEN && req.header('X-Admin-Token') === process.env.ADMIN_API_TOKEN;

  if (isAdmin) {
    res.json({
      success: true,
      data: {
        angelOne: devSettings.angelOne,
        razorpay: devSettings.razorpay,
        executionMode: devSettings.executionMode,
        webhooks: devSettings.webhooks,
        engines: devSettings.engines,
      }
    });
    return;
  }

  res.json({
    success: true,
    data: {
      angelOne: {
        clientCode: devSettings.angelOne.clientCode,
        isLive: devSettings.angelOne.isLive,
        connected: devSettings.angelOne.connected,
        lastConnected: devSettings.angelOne.lastConnected,
      },
      razorpay: {
        keyId: devSettings.razorpay.keyId, // Razorpay's publishable key ID is meant to be client-visible
        isLive: devSettings.razorpay.isLive,
      },
      executionMode: devSettings.executionMode,
      // Preserve the FULL webhooks shape (telegram's other display fields,
      // and the whatsapp sub-object entirely) so nothing that reads
      // webhookSettings.whatsapp.* elsewhere breaks for a non-admin
      // session -- only the actual secret (botToken) is masked out.
      webhooks: {
        ...devSettings.webhooks,
        telegram: { ...devSettings.webhooks?.telegram, botToken: '' },
      },
      engines: devSettings.engines,
    }
  });
});

app.post('/api/developer/config', requireAdmin, (req: Request, res: Response) => {
  const { angelOne, razorpay, executionMode, webhooks, engines } = req.body;

  if (angelOne) {
    devSettings.angelOne = {
      ...devSettings.angelOne,
      ...angelOne,
    };
  }
  if (razorpay) {
    devSettings.razorpay = {
      ...devSettings.razorpay,
      ...razorpay,
    };
  }
  if (executionMode) {
    devSettings.executionMode = executionMode;
  }
  if (webhooks) {
    devSettings.webhooks = {
      ...devSettings.webhooks,
      ...webhooks,
      telegram: {
        ...(devSettings.webhooks?.telegram || DEFAULT_WEBHOOK_SETTINGS.telegram),
        ...(webhooks.telegram || {}),
      },
      whatsapp: {
        ...(devSettings.webhooks?.whatsapp || DEFAULT_WEBHOOK_SETTINGS.whatsapp),
        ...(webhooks.whatsapp || {}),
      },
    };
  }
  if (engines) {
    devSettings.engines = {
      ...devSettings.engines,
      ...engines,
    };
  }

  const newLog: AuditLog = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: 'developer_admin',
    action: 'DEVELOPER_CONFIG_UPDATED',
    category: 'DEVELOPER',
    status: 'SUCCESS',
    details: `API parameters updated. AngelOne Client: ${devSettings.angelOne.clientCode}, Razorpay Key: ${devSettings.razorpay.keyId.substring(0, 8)}..., ExecutionMode: ${devSettings.executionMode}, Telegram Channel: ${devSettings.webhooks?.telegram?.chatId}`,
    ipAddress: req.ip || '127.0.0.1',
  };
  auditLogs.unshift(newLog);

  res.json({
    success: true,
    message: 'Developer API parameters, Telegram broadcasting, and engine settings successfully persisted.',
    data: devSettings,
  });
});

// Audit Logs (GET & POST)
app.get('/api/developer/audit-logs', requireAdmin, (req: Request, res: Response) => {
  res.json({
    success: true,
    total: auditLogs.length,
    data: auditLogs.slice(0, 100),
  });
});

app.post('/api/developer/audit-logs', requireAdmin, (req: Request, res: Response) => {
  const { action, category, status, details, user } = req.body;
  const newLog: AuditLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    user: user || devSettings.angelOne.clientCode || 'operator',
    action: action || 'USER_ACTION',
    category: category || 'TRADE',
    status: status || 'SUCCESS',
    details: details || '',
    ipAddress: req.ip || '127.0.0.1',
  };
  auditLogs.unshift(newLog);
  res.json({ success: true, log: newLog });
});

// Razorpay Subscription Order Creation
app.post('/api/subscription/create-order', async (req: Request, res: Response) => {
  const { planId, amount, currency } = req.body;

  if (!razorpayConfigured()) {
    res.status(503).json({ success: false, error: 'Razorpay is not configured yet. Real RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are required before subscriptions can be sold.' });
    return;
  }

  const amountPaise = Math.round((amount || 999) * 100);
  const result = await createRazorpayOrder(amountPaise, currency || 'INR', `sub_${Date.now()}`);

  if (!result.ok) {
    res.status(502).json({ success: false, error: result.error });
    return;
  }

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: devSettings.angelOne.clientCode || 'operator',
    action: 'SUBSCRIPTION_ORDER_INITIATED',
    category: 'PAYMENT',
    status: 'SUCCESS',
    details: `Razorpay checkout initiated for plan ${planId || 'PRO_MONTHLY'} (₹${amount || 999}). Order ID: ${result.id}`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    orderId: result.id,
    amount: result.amount,
    currency: result.currency,
    keyId: devSettings.razorpay.keyId,
    plan: planId || 'PRO_MONTHLY',
  });
});

// Razorpay Payment Verification -- real HMAC-SHA256 signature check
// (order_id|payment_id signed with the key secret) instead of accepting
// any submitted payment_id as valid.
app.post('/api/subscription/verify', (req: Request, res: Response) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, plan } = req.body;

  if (!razorpayConfigured()) {
    res.status(503).json({ success: false, error: 'Razorpay is not configured yet.' });
    return;
  }

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400).json({ success: false, error: 'Missing payment verification fields' });
    return;
  }

  const valid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!valid) {
    auditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: devSettings.angelOne.clientCode || 'operator',
      action: 'SUBSCRIPTION_ACTIVATED',
      category: 'PAYMENT',
      status: 'FAILED',
      details: `Razorpay signature verification FAILED. Order: ${razorpayOrderId}, Payment: ${razorpayPaymentId}. Subscription NOT activated.`,
      ipAddress: req.ip || '127.0.0.1',
    });
    res.status(400).json({ success: false, error: 'Payment signature verification failed' });
    return;
  }

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: devSettings.angelOne.clientCode || 'operator',
    action: 'SUBSCRIPTION_ACTIVATED',
    category: 'PAYMENT',
    status: 'SUCCESS',
    details: `Payment verified via real Razorpay signature check. Payment ID: ${razorpayPaymentId}. Plan upgraded to ${plan || 'PRO_MONTHLY'}.`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Subscription successfully activated via Razorpay payment gateway.',
    subscription: {
      isTrial: false,
      trialDaysLeft: 0,
      plan: plan || 'PRO_MONTHLY',
      active: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      paymentId: razorpayPaymentId,
    }
  });
});

// -------------------------------------------------------------
// GTT & Trailing Stop Loss Orders
// -------------------------------------------------------------
app.get('/api/orders/gtt', (req: Request, res: Response) => {
  res.json({
    success: true,
    total: gttOrders.length,
    data: gttOrders,
  });
});

app.post('/api/orders/gtt', (req: Request, res: Response) => {
  const { symbol, side, product, quantity, triggerPrice, limitPrice, trailingStopLossPoints, trailingTargetPrice, brokerMode } = req.body;
  
  const currentTicker = serverLiveTickers.find(t => t.symbol.toUpperCase() === (symbol || 'NIFTY 50').toUpperCase());
  const ltp = currentTicker ? currentTicker.ltp : triggerPrice || 24800;

  const newGtt: GttOrder = {
    id: `gtt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    symbol: symbol || 'NIFTY 50',
    side: side || 'BUY',
    product: product || 'NRML',
    quantity: Number(quantity) || 25,
    triggerPrice: Number(triggerPrice) || ltp,
    limitPrice: Number(limitPrice) || ltp,
    trailingStopLossPoints: trailingStopLossPoints ? Number(trailingStopLossPoints) : undefined,
    trailingTargetPrice: trailingTargetPrice ? Number(trailingTargetPrice) : undefined,
    highestLtpSeen: ltp,
    status: 'ACTIVE',
    createdAt: new Date().toLocaleDateString(),
    brokerMode: brokerMode || devSettings.executionMode || 'PAPER',
  };

  gttOrders.unshift(newGtt);

  const newLog: AuditLog = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: devSettings.angelOne.clientCode || 'operator',
    action: 'GTT_ORDER_CREATED',
    category: 'TRADE',
    status: 'SUCCESS',
    details: `GTT Created: ${newGtt.side} ${newGtt.quantity} ${newGtt.symbol} Trigger: ₹${newGtt.triggerPrice}, Limit: ₹${newGtt.limitPrice}${newGtt.trailingStopLossPoints ? `, TSL: ${newGtt.trailingStopLossPoints} pts` : ''} (${newGtt.brokerMode} mode)`,
    ipAddress: req.ip || '127.0.0.1',
  };
  auditLogs.unshift(newLog);

  res.json({
    success: true,
    message: 'Good-Till-Triggered (GTT) order successfully placed on Angel One / Virtual engine.',
    data: newGtt,
  });
});

app.delete('/api/orders/gtt/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = gttOrders.findIndex(g => g.id === id);
  if (index !== -1) {
    const deleted = gttOrders[index];
    deleted.status = 'CANCELLED';
    gttOrders.splice(index, 1);

    auditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: devSettings.angelOne.clientCode || 'operator',
      action: 'GTT_ORDER_CANCELLED',
      category: 'TRADE',
      status: 'SUCCESS',
      details: `GTT Order ${id} on ${deleted.symbol} cancelled by user`,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({ success: true, message: 'GTT order cancelled.' });
  } else {
    res.status(404).json({ success: false, message: 'GTT order not found.' });
  }
});

// -------------------------------------------------------------
// Telegram Broadcast Engine & Real API Dispatcher
// -------------------------------------------------------------
async function sendTelegramBroadcast(
  messageText: string,
  customBotToken?: string,
  customChatId?: string
): Promise<{ success: boolean; mode: 'LIVE' | 'SIMULATED'; messageId?: number | string; error?: string }> {
  const token = customBotToken || devSettings.webhooks?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chat = customChatId || devSettings.webhooks?.telegram?.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    return { success: false, mode: 'SIMULATED', error: 'Telegram Bot Token or Channel Chat ID is missing.' };
  }

  // Check if token matches standard Telegram bot token pattern
  const isLiveToken = /^\d{8,12}:[A-Za-z0-9_-]{30,50}$/.test(token.trim());

  if (isLiveToken) {
    try {
      const url = `https://api.telegram.org/bot${token.trim()}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat.trim(),
          text: messageText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      const data = (await response.json()) as any;
      if (data.ok) {
        return { success: true, mode: 'LIVE', messageId: data.result?.message_id };
      } else {
        console.warn('Telegram API rejected message:', data.description);
        return { success: false, mode: 'LIVE', error: data.description || 'Telegram API returned error' };
      }
    } catch (networkErr: any) {
      console.warn('Telegram network request error:', networkErr.message);
      return { success: false, mode: 'LIVE', error: networkErr.message };
    }
  }

  // Simulated / Test Telegram Broadcast Mode
  return {
    success: true,
    mode: 'SIMULATED',
    messageId: `sim_tg_${Date.now()}`,
  };
}

// Option-premium trade levels of a PriceActionSignal (src/types/market.ts).
// Returns null when the signal lacks a real strike/side/entry/SL, so an
// incomplete signal is never broadcast with ₹0.00 levels.
const DEMO_SIGNAL_IDS = new Set(INITIAL_PRICE_ACTION_SIGNALS.map(s => s.id));
const broadcastSignalIds = new Set<string>();

function priceActionSignalLevels(signal: any) {
  const optionType = signal?.optionType === 'CE' || signal?.optionType === 'PE' ? signal.optionType : null;
  const strike = Number(signal?.strikePrice);
  const entry = Number(signal?.optionEntryPrice);
  const stopLoss = Number(signal?.optionStopLoss);
  if (!optionType || !(strike > 0) || !(entry > 0) || !(stopLoss > 0) || stopLoss >= entry) return null;

  const target = (t: any) => (t && Number(t.price) > 0 ? { price: Number(t.price), ratio: String(t.ratio || '') } : null);
  return {
    indexSymbol: String(signal.indexSymbol || ''),
    optionType,
    strike,
    optionSymbol: String(signal.optionSymbol || `${signal.indexSymbol} ${strike} ${optionType}`),
    entry,
    stopLoss,
    slPoints: Number(signal.optionStopLossPoints) || Number((entry - stopLoss).toFixed(2)),
    spot: Number(signal.underlyingSpot) || 0,
    keyLevel: Number(signal.keyLevel) || 0,
    targets: [
      ['Target 1', target(signal.target1)],
      ['Target 2', target(signal.target2)],
      ['Target 3 (Runner)', target(signal.target4)],
    ] as [string, { price: number; ratio: string } | null][],
    adaptive: target(signal.adaptiveTarget),
    confidence: Number(signal.confidenceScore) || Number(signal.adaptiveTarget?.probabilityPercent) || 0,
  };
}

function formatPriceActionSignalTelegramHtml(signal: any, channelName?: string): string {
  const lv = priceActionSignalLevels(signal)!;
  const isCall = lv.optionType === 'CE';
  const signalEmoji = isCall ? '🟢 🚀' : '🔴 🔻';
  const rupees = (n: number) => `₹${n.toFixed(2)}`;
  const patternLabel = String(signal.patternType || 'BREAKOUT').replace(/_/g, ' ');
  const targetLines = lv.targets
    .filter(([, t]) => t)
    .map(([label, t]) => `• <b>${label}${t!.ratio ? ` (${t!.ratio})` : ''}:</b> ${rupees(t!.price)}`)
    .join('\n');

  return `
<b>${signalEmoji} BUY ${lv.optionSymbol}</b>
━━━━━━━━━━━━━━━━━━━━━
📊 <b>Underlying:</b> ${lv.indexSymbol}${lv.spot ? ` @ ${lv.spot.toFixed(2)}` : ''}
🎟 <b>Strike:</b> ${lv.strike} ${lv.optionType} (${isCall ? 'Call' : 'Put'})${signal.optionExpiry ? ` | Expiry ${signal.optionExpiry}` : ''}${signal.lotSize ? ` | Lot ${signal.lotSize}` : ''}
🎯 <b>Signal Type:</b> ${patternLabel}${lv.keyLevel ? ` @ ${lv.keyLevel}` : ''}
📐 <b>Setup Score:</b> ${lv.confidence ? `${Math.round(lv.confidence)}/100 (rule-based, not a win probability)` : '-'}
⚡ <b>Volume:</b> ${signal.volumeMultiplier ? `${signal.volumeMultiplier}x the 20-candle average` : '-'}

<b>📍 OPTION PREMIUM LEVELS:</b>
• <b>Entry:</b> ${rupees(lv.entry)}
• <b>Stop Loss:</b> ${rupees(lv.stopLoss)} (-${lv.slPoints.toFixed(2)} pts)
${targetLines}${lv.adaptive ? `\n• <b>Adaptive Target (${lv.adaptive.ratio}):</b> ${rupees(lv.adaptive.price)}` : ''}

💡 <b>Strategy Rationale:</b>
${signal.rationale || 'High-volume breakout confirmed across key structural level with clean momentum.'}

━━━━━━━━━━━━━━━━━━━━━
🕒 <i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST | ${channelName || devSettings.webhooks?.telegram?.channelName || 'Chanakya Pro Broadcast'}</i>
⚠️ <i>SEBI Statutory Notice: We are NOT SEBI registered. Dispatched for algorithmic simulation & research. Options/Futures carry high capital risk.</i>
`.trim();
}

// Follow-up for a live-engine signal: target / stop loss / square-off, with
// the actual premium at the moment it happened.
function formatSignalUpdateTelegramHtml(signal: PriceActionSignal, event: SignalEvent, channelName?: string): string {
  const entry = signal.optionEntryPrice;
  const ltp = signal.exitPrice ?? signal.currentOptionPrice;
  const pts = ltp - entry;
  const pct = (pts / entry) * 100;
  const signed = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;
  const headline: Record<SignalEvent, string> = {
    T1: `🎯 TARGET 1 (${signal.target1.ratio}) HIT`,
    T2: `🎯🎯 TARGET 2 (${signal.target2.ratio}) HIT`,
    T4: `🏆 FINAL TARGET (${signal.target4.ratio}) HIT - TRADE CLOSED`,
    SL: pts >= 0 ? '🟡 TRAILING STOP HIT - TRADE CLOSED' : '🔴 STOP LOSS HIT - TRADE CLOSED',
    SQUARED_OFF: '⏹ SQUARED OFF AT SESSION END - TRADE CLOSED',
  };
  const followUp: Partial<Record<SignalEvent, string>> = {
    T1: `Stop loss moved to cost ₹${entry.toFixed(2)}.`,
    T2: `Stop loss trailed to Target 1 ₹${signal.target1.price.toFixed(2)}.`,
  };

  return `
<b>${headline[event]}</b>
<b>${signal.optionSymbol}</b>
━━━━━━━━━━━━━━━━━━━━━
• <b>Entry:</b> ₹${entry.toFixed(2)}
• <b>${signal.exitPrice !== undefined ? 'Exit' : 'Now'}:</b> ₹${ltp.toFixed(2)}
• <b>Result:</b> ${signed(pts)} pts (${signed(pct, 1)}%)${signal.lotSize ? ` = ₹${signed(pts * signal.lotSize, 0)} per lot` : ''}
${followUp[event] ? `• ${followUp[event]}
` : ''}━━━━━━━━━━━━━━━━━━━━━
🕒 <i>${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST | ${channelName || devSettings.webhooks?.telegram?.channelName || 'Chanakya Pro Broadcast'}</i>
`.trim();
}

function formatTargetWinTelegramHtml(winData: any, channelName?: string): string {
  const targetLabel = winData.targetName || 'TARGET 1 HIT 🎯';
  const symbol = winData.indexSymbol || winData.symbol || 'CRUDEOIL';
  const optionSymbol = winData.optionSymbol || `${symbol} OPTION`;
  const pointsWon = Number(winData.pointsWon || winData.pointsCaptured || 0).toFixed(2);
  const pnlPercent = Number(winData.pnlPercent || 28.5).toFixed(2);
  const entryPrice = winData.entryPrice ? Number(winData.entryPrice).toFixed(2) : '-';
  const exitPrice = winData.exitPrice ? Number(winData.exitPrice).toFixed(2) : '-';
  const ratio = winData.ratio || '1:2.0';

  return `
<b>🏆 🎯 CHANAKYA PRO — TARGET HIT & WIN! 🚀</b>
━━━━━━━━━━━━━━━━━━━━━
⚡ <b>Symbol / Contract:</b> ${symbol}
📊 <b>Option Strike:</b> ${optionSymbol}
🎯 <b>Achievement:</b> ${targetLabel} (+${pointsWon} PTS)
📈 <b>P&L Return:</b> +${pnlPercent}% Profit (R:R ${ratio})
📍 <b>Execution:</b> Entry ₹${entryPrice} ➔ Target Hit ₹${exitPrice}
🛡️ <b>Trade Action:</b> Book 50% Profits & Trail Stop-Loss to Cost!
💡 <b>Rationale:</b> ${winData.rationale || 'Key price momentum breakout target reached with exceptional accuracy.'}
━━━━━━━━━━━━━━━━━━━━━
🕒 <i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST | ${channelName || devSettings.webhooks?.telegram?.channelName || 'Chanakya Pro VIP Broadcast'}</i>
⚠️ <i>SEBI Notice: Algorithmic analysis & research simulation. Derivatives trading carries capital risk.</i>
`.trim();
}

// -------------------------------------------------------------
// Webhook & Trade Alerts Dispatch (Telegram / WhatsApp)
// -------------------------------------------------------------
app.get('/api/telegram/config', requireAdmin, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: devSettings.webhooks?.telegram || DEFAULT_WEBHOOK_SETTINGS.telegram,
  });
});

app.post('/api/telegram/config', requireAdmin, (req: Request, res: Response) => {
  const telegramConfig = req.body;
  if (devSettings.webhooks) {
    devSettings.webhooks.telegram = {
      ...devSettings.webhooks.telegram,
      ...telegramConfig,
    };
  }

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: 'developer_admin',
    action: 'TELEGRAM_CONFIG_UPDATED',
    category: 'ALERT',
    status: 'SUCCESS',
    details: `Telegram broadcast settings updated. Channel: ${devSettings.webhooks?.telegram?.chatId}, AutoBroadcast: ${devSettings.webhooks?.telegram?.autoBroadcastSignals}`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Chanakya Pro Telegram broadcast configuration saved successfully!',
    data: devSettings.webhooks?.telegram,
  });
});

// Not admin-gated: triggered automatically from any visitor's dashboard
// when a live signal fires (see TradingContext.tsx) -- never reads or
// returns the bot token to the caller, only uses it server-side.
app.post('/api/telegram/broadcast-signal', async (req: Request, res: Response) => {
  const { customChannel, customBotToken } = req.body;
  const requested = req.body?.signal;
  if (!requested?.id) {
    return res.status(400).json({ success: false, error: 'Chanakya Pro signal id required' });
  }
  // The built-in sample signals (stale prices) must never reach the channel.
  if (DEMO_SIGNAL_IDS.has(requested.id)) {
    return res.status(409).json({ success: false, skipped: true, error: 'Demo/sample signal - not broadcast' });
  }
  // Only signals the live engine generated can be sent, and always the
  // server's copy -- the request body is never trusted for trade levels.
  const signal = priceActionEngine.getSignalById(String(requested.id));
  if (!signal) {
    return res.status(404).json({ success: false, error: 'Unknown signal - only live engine signals can be broadcast' });
  }
  if (!priceActionSignalLevels(signal)) {
    return res.status(422).json({ success: false, error: 'Signal is missing strike, CE/PE, entry or stop loss - not broadcast' });
  }
  // Every open dashboard auto-fires the same signals; send each id once.
  if (signal.id && broadcastSignalIds.has(signal.id)) {
    return res.json({ success: true, duplicate: true, message: 'Signal already broadcast' });
  }
  if (signal.id) broadcastSignalIds.add(signal.id);

  const tgConfig = devSettings.webhooks?.telegram || DEFAULT_WEBHOOK_SETTINGS.telegram;
  const channelName = tgConfig.channelName || 'Chanakya Pro VIP Broadcast';
  const formattedHtml = formatPriceActionSignalTelegramHtml(signal, channelName);

  const dispatchResult = await sendTelegramBroadcast(
    formattedHtml,
    customBotToken || tgConfig.botToken,
    customChannel || tgConfig.chatId
  );

  const targetChat = customChannel || tgConfig.chatId || '@chanakya_pro_signals';

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: 'chanakya_engine',
    action: 'CHANAKYA_SIGNAL_TELEGRAM_BROADCAST',
    category: 'ALERT',
    status: dispatchResult.success ? 'SUCCESS' : 'WARNING',
    details: `Chanakya Signal [${signal.action} ${signal.optionSymbol} @ ₹${signal.optionEntryPrice}] broadcasted to Telegram channel ${targetChat} (${dispatchResult.mode} mode)${dispatchResult.error ? ` - Notice: ${dispatchResult.error}` : ''}`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: dispatchResult.success,
    mode: dispatchResult.mode,
    channel: targetChat,
    messageId: dispatchResult.messageId,
    preview: formattedHtml,
    message: dispatchResult.success
      ? `Signal broadcasted successfully to Telegram channel ${targetChat} (${dispatchResult.mode} mode)`
      : `Failed to broadcast to Telegram: ${dispatchResult.error}`,
    error: dispatchResult.error,
  });
});

// Not admin-gated: same reasoning as broadcast-signal above.
// Admin-only: the live engine posts real target/SL updates itself; this
// manual route takes free-form numbers, so it must not be open to visitors.
app.post('/api/telegram/broadcast-target-win', requireAdmin, async (req: Request, res: Response) => {
  const { winData, customChannel, customBotToken } = req.body;
  if (!winData) {
    return res.status(400).json({ success: false, error: 'Target win data required' });
  }

  const tgConfig = devSettings.webhooks?.telegram || DEFAULT_WEBHOOK_SETTINGS.telegram;
  const channelName = tgConfig.channelName || 'Chanakya Pro VIP Broadcast';
  const formattedHtml = formatTargetWinTelegramHtml(winData, channelName);

  const dispatchResult = await sendTelegramBroadcast(
    formattedHtml,
    customBotToken || tgConfig.botToken,
    customChannel || tgConfig.chatId
  );

  const targetChat = customChannel || tgConfig.chatId || '@chanakya_pro_signals';

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: 'chanakya_engine',
    action: 'CHANAKYA_TARGET_WIN_TELEGRAM_BROADCAST',
    category: 'ALERT',
    status: dispatchResult.success ? 'SUCCESS' : 'WARNING',
    details: `Target Win [${winData.indexSymbol || winData.symbol} - ${winData.targetName || 'TARGET HIT'}] broadcasted to ${targetChat}`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: dispatchResult.success,
    mode: dispatchResult.mode,
    channel: targetChat,
    messageId: dispatchResult.messageId,
    preview: formattedHtml,
    message: dispatchResult.success
      ? `Target Win update broadcasted successfully to Telegram channel ${targetChat}`
      : `Failed to broadcast to Telegram: ${dispatchResult.error}`,
    error: dispatchResult.error,
  });
});

app.post('/api/telegram/test', requireAdmin, async (req: Request, res: Response) => {
  const { botToken, chatId, channelName } = req.body || {};
  const token = botToken || devSettings.webhooks?.telegram?.botToken;
  const chat = chatId || devSettings.webhooks?.telegram?.chatId;
  const name = channelName || devSettings.webhooks?.telegram?.channelName || 'Chanakya Pro';

  const testMessage = `
<b>🚀 Chanakya Pro - Telegram Signal Broadcast Connected!</b>
━━━━━━━━━━━━━━━━━━━━━
✅ <b>Status:</b> Channel Broadcast Operational
📡 <b>Engine:</b> Chanakya Pro Breakout Engine
🎯 <b>Channel:</b> ${chat || '@chanakya_signals'}
🕒 <b>Connected At:</b> ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST

⚡ <i>All verified breakout signals will now be instantly auto-fired to this channel.</i>
━━━━━━━━━━━━━━━━━━━━━
⚠️ <i>SEBI Statutory Notice: We are NOT SEBI registered. Dispatched for algorithmic simulation & research. Options/Futures carry high capital risk.</i>
`.trim();

  const dispatchResult = await sendTelegramBroadcast(testMessage, token, chat);

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: 'developer_admin',
    action: 'TELEGRAM_TEST_DISPATCH',
    category: 'ALERT',
    status: dispatchResult.success ? 'SUCCESS' : 'WARNING',
    details: `Chanakya Telegram test message sent to ${chat} (${dispatchResult.mode} mode)`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: dispatchResult.success,
    mode: dispatchResult.mode,
    chatId: chat,
    messageId: dispatchResult.messageId,
    message: dispatchResult.success
      ? `Chanakya Telegram test alert dispatched successfully to ${chat} (${dispatchResult.mode} mode)!`
      : `Telegram dispatch notice: ${dispatchResult.error || 'Check Bot Token or Channel ID'}`,
    error: dispatchResult.error,
  });
});

app.post('/api/alerts/webhook/test', (req: Request, res: Response) => {
  const { channel, recipient, botToken, webhookUrl, customMessage } = req.body;

  const testPayload = {
    event: 'CHANAKYA_PRO_ALERT_TEST',
    timestamp: new Date().toISOString(),
    channel: channel || 'telegram',
    message: customMessage || `🚨 Chanakya Pro: Test signal alert dispatched successfully! Live pricing and AI engine alerts are operational.`,
    status: 'SENT_SIMULATED',
  };

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: 'system_admin',
    action: 'WEBHOOK_ALERT_TEST',
    category: 'ALERT',
    status: 'SUCCESS',
    details: `${(channel || 'telegram').toUpperCase()} alert test dispatched to ${recipient || '@chanakya_pro_alerts'}`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: `${(channel || 'telegram').toUpperCase()} webhook alert simulation sent successfully!`,
    details: testPayload,
  });
});

// -------------------------------------------------------------
// Strategy Backtesting Engine
// -------------------------------------------------------------
// Removed: returned random monthly results, not a backtest on market data.
app.post('/api/strategy/backtest', (req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Backtest unavailable: results were simulated (fixed win-rate tables and random numbers), not computed from historical market data',
  });
});

// Angel One WebSocket Status and Reconnect Endpoints
app.get('/api/broker/angelone/websocket-status', (req: Request, res: Response) => {
  const feedState = angelOneStreamer.getFeedState();
  res.json({
    success: true,
    feedState,
    connectedWsClients: wsClients.size,
    connectedSseClients: sseClients.size,
    activeClientCode: devSettings.angelOne.clientCode,
    feedTokenPresent: !!devSettings.angelOne.feedToken,
    timestamp: new Date().toISOString(),
  });
});

// angelOneStreamer is a single shared instance (AngelOneLiveStreamer.
// getInstance()) broadcasting to every connected visitor -- reconnecting
// using the server's OWN stored credentials is a normal, harmless action
// any visitor's client already triggers automatically (see
// TradingContext.tsx's reconnectLiveStream), so that path stays open.
// Only overriding WHICH credentials the shared feed connects with is
// admin-gated -- letting any visitor redirect the shared broker
// connection to a different account would be a real hijack risk.
app.post('/api/broker/angelone/connect-websocket', (req: Request, res: Response, next: () => void) => {
  const { clientCode, apiKey, feedToken } = req.body || {};
  const isOverride =
    (clientCode && clientCode !== devSettings.angelOne.clientCode) ||
    (apiKey && apiKey !== devSettings.angelOne.apiKey) ||
    (feedToken && feedToken !== devSettings.angelOne.feedToken);
  if (isOverride) {
    requireAdmin(req, res, next);
  } else {
    next();
  }
}, (req: Request, res: Response) => {
  const { clientCode, apiKey, feedToken } = req.body || {};
  const targetClient = clientCode || devSettings.angelOne.clientCode;
  const targetKey = apiKey || devSettings.angelOne.apiKey;
  const targetFeed = feedToken || devSettings.angelOne.feedToken;

  angelOneStreamer.updateCredentials(targetClient, targetKey, targetFeed, devSettings.angelOne.jwtToken);

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: targetClient,
    action: 'BROKER_WEBSOCKET_RECONNECT',
    category: 'AUTH',
    status: 'SUCCESS',
    details: `Angel One SmartAPI WebSocket 2.0 reconnect signal sent. Client: ${targetClient}`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    message: 'Angel One SmartAPI WebSocket 2.0 streaming initiated!',
    feedState: angelOneStreamer.getFeedState(),
  });
});

// =============================================================
// Chanakya Pro Strategy Engine & Edge Finding Endpoints
// =============================================================

// Get all verified Chanakya Pro Signals and current day track record
app.get('/api/price-action/signals', (req: Request, res: Response) => {
  const index = req.query.index as string | undefined;
  const signals = priceActionEngine.getSignals(index);
  const statistics = priceActionEngine.getEngineStatistics(index);
  const profiles = priceActionEngine.getAllProfiles();

  res.json({
    success: true,
    signals,
    statistics,
    profiles,
    engine: liveSignalEngine.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

// Get calibrated index edge profiles
app.get('/api/price-action/profiles', (req: Request, res: Response) => {
  const profiles = priceActionEngine.getAllProfiles();
  res.json({
    success: true,
    profiles,
  });
});

// Run historical edge backtest and calibration simulation
// Removed: returned fixed win-rate tables plus random noise, not a backtest.
app.post('/api/price-action/backtest', (req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Backtest unavailable: results were simulated (fixed win-rate tables and random numbers), not computed from historical market data',
  });
});

// Calibrate index edge parameters
// Admin-only: these thresholds drive the live signal engine.
app.post('/api/price-action/calibrate', requireAdmin, (req: Request, res: Response) => {
  const { indexSymbol, updates } = req.body || {};
  if (!indexSymbol) {
    return res.status(400).json({ success: false, error: 'indexSymbol is required' });
  }

  const updatedProfile = priceActionEngine.updateProfileCalibration(indexSymbol, updates || {});

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: devSettings.angelOne.clientCode || 'DCP78912',
    action: 'EDGE_CALIBRATION_UPDATED',
    category: 'DEVELOPER',
    status: 'SUCCESS',
    details: `Calibrated parameters updated for ${indexSymbol}: Optimal RR ${updatedProfile.calibratedOptimalTargetRatio}, Vol Threshold ${updatedProfile.breakoutVolumeThreshold}x`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    profile: updatedProfile,
    message: `Calibration parameters updated successfully for ${indexSymbol}`,
  });
});

// Signals are generated server-side by the live engine (liveSignalEngine.ts)
// from Angel One candles and option-chain premiums; clients can no longer
// submit candles to create signals.
app.post('/api/price-action/evaluate', (req: Request, res: Response) => {
  res.status(410).json({ success: false, error: 'Signals are generated server-side from live Angel One data' });
});

// -------------------------------------------------------------
// Vite Middleware & SPA Static Serving
// -------------------------------------------------------------
async function startServer() {
  const server = http.createServer(app);

  // Setup Native WebSocket Server for Zero-Latency Market Stream
  const wss = new WebSocketServer({ server, path: '/api/market/ws' });

  wss.on('connection', (ws: WSClient) => {
    wsClients.add(ws);

    // Send initial snapshot on connection
    const initialPayload = JSON.stringify({
      type: 'SNAPSHOT',
      feedSource: angelOneStreamer.getFeedState().source,
      feedStatus: angelOneStreamer.getFeedState().feedStatus,
      tickers: serverLiveTickers,
      timestamp: Date.now(),
    });

    if (ws.readyState === WSClient.OPEN) {
      ws.send(initialPayload);
    }

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.action === 'SUBSCRIBE_TICKER' && parsed.symbol) {
          const ticker = angelOneStreamer.getTicker(parsed.symbol);
          if (ticker && ws.readyState === WSClient.OPEN) {
            ws.send(JSON.stringify({ type: 'TICK_SINGLE', ticker }));
          }
        }
      } catch {
        // invalid message
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
    });

    ws.on('error', () => {
      wsClients.delete(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Local-only: the public site is served through Nginx (HTTPS) on this
  // host; binding 0.0.0.0 exposed plain HTTP on :3000 to the internet.
  const HOST = process.env.HOST || '127.0.0.1';
  server.listen(PORT, HOST, () => {
    console.log(`ShareMarket Pro trading server with Angel One Live WebSocket running on http://${HOST}:${PORT}`);
    autoLoginAngelOne('startup');
    liveSignalEngine.start();
    // Signals restored from disk were already sent before the restart.
    priceActionEngine.getSignals().forEach(s => broadcastSignalIds.add(s.id));
  });
}

startServer();
