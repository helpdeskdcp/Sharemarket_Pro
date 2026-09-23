import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket as WSClient } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import * as OTPAuth from 'otpauth';
import crypto from 'crypto';
import { generateOptionChain, generateCandleHistory, WORLD_CLASS_STRATEGIES, DEFAULT_WEBHOOK_SETTINGS, DEFAULT_ENGINE_SETTINGS } from './src/data/marketData';
import { AuditLog, DeveloperSettings, GttOrder, BacktestResult, AlertWebhookSettings, Ticker } from './src/types/market';
import { AngelOneLiveStreamer, EXCHANGE_SYMBOL_MAP } from './src/services/angelOneLiveService';
import { PriceActionStrategyEngine } from './src/services/priceActionEngine';

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
app.get('/api/market/option-chain', (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string) || 'NIFTY 50';
  const ticker = serverLiveTickers.find(t => t.symbol.toUpperCase() === symbol.toUpperCase()) || serverLiveTickers[0];
  const optionChain = generateOptionChain(ticker.symbol, ticker.ltp);
  res.json({ success: true, data: optionChain });
});

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
      // Calculate 20 EMA
      const k20 = 2 / (20 + 1);
      let ema20 = candles[0].close;
      for (let i = 0; i < candles.length; i++) {
        ema20 = candles[i].close * k20 + ema20 * (1 - k20);
        candles[i].ema20 = Number(ema20.toFixed(2));
      }
      return candles;
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
  const liveCandles = await fetchLiveCandleHistory(symbol, timeframe);
  const candles = liveCandles || generateCandleHistory(ticker.ltp, points, timeframe);
  
  res.json({
    success: true,
    symbol: ticker.symbol,
    timeframe,
    source: liveCandles ? 'EXCHANGE_LIVE_HISTORY' : 'QUANT_FALLBACK',
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
  "winProbabilityPercent": number between 48.0 and 78.0,
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
  'CRUDE OIL': { token: 'MCX_CRUDE', exchange: 'MCX', name: 'Crude Oil Futures' },
  'GOLD': { token: 'MCX_GOLD', exchange: 'MCX', name: 'Gold Futures' },
};

function formatAngelOneQuote(ticker: Ticker) {
  const meta = ANGEL_ONE_TOKEN_MAP[ticker.symbol.toUpperCase()] || {
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
    const mappedSymbol = Object.keys(ANGEL_ONE_TOKEN_MAP).find(k => ANGEL_ONE_TOKEN_MAP[k].token === query);
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
  angelOneStreamer.updateCredentials(targetClient, targetKey, feedToken);

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

function formatPriceActionSignalTelegramHtml(signal: any, channelName?: string): string {
  const isBuy = signal.action === 'BUY';
  const signalEmoji = isBuy ? '🟢 🚀' : '🔴 🔻';
  const actionLabel = isBuy ? 'BUY / LONG CALL' : 'SELL / SHORT PUT';

  const cmp = Number(signal.entryPrice || signal.currentPrice || 0).toFixed(2);
  const sl = Number(signal.stopLoss || 0).toFixed(2);
  const t1 = signal.targets?.t1 ? Number(signal.targets.t1).toFixed(2) : '-';
  const t2 = signal.targets?.t2 ? Number(signal.targets.t2).toFixed(2) : '-';
  const t3 = signal.targets?.t3 ? Number(signal.targets.t3).toFixed(2) : '-';
  const t4 = signal.targets?.t4 ? Number(signal.targets.t4).toFixed(2) : '-';

  return `
<b>${signalEmoji} ${actionLabel} - ${signal.indexSymbol || 'NIFTY 50'}</b>
━━━━━━━━━━━━━━━━━━━━━
🎯 <b>Signal Type:</b> BREAKOUT
💎 <b>Conviction:</b> ${signal.probabilityPercent || 88}% High Probability
⚡ <b>Volume Surge:</b> ${signal.volumeMultiplier || 2.4}x vs 20-EMA

<b>📍 TRADE LEVELS (Strict Execution):</b>
• <b>Entry Trigger:</b> ₹${cmp}
• <b>Strict Stop Loss (SL):</b> ₹${sl}
• <b>Target 1 (1:1.5):</b> ₹${t1}
• <b>Target 2 (1:2.0):</b> ₹${t2}
• <b>Target 3 (1:3.0):</b> ₹${t3}
• <b>Target 4 (Runner 1:4.0):</b> ₹${t4}
• <b>Risk-to-Reward:</b> ${signal.riskRewardRatio || '1:2.5'}

💡 <b>Strategy Rationale:</b>
${signal.rationale || 'High-volume breakout confirmed across key structural level with clean momentum.'}

━━━━━━━━━━━━━━━━━━━━━
🕒 <i>Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST | ${channelName || devSettings.webhooks?.telegram?.channelName || 'Chanakya Pro Broadcast'}</i>
⚠️ <i>SEBI Statutory Notice: We are NOT SEBI registered. Dispatched for algorithmic simulation & research. Options/Futures carry high capital risk.</i>
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
  const { signal, customChannel, customBotToken } = req.body;
  if (!signal) {
    return res.status(400).json({ success: false, error: 'Chanakya Pro signal data required' });
  }

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
    details: `Chanakya Signal [${signal.action} ${signal.indexSymbol} @ ₹${signal.entryPrice}] broadcasted to Telegram channel ${targetChat} (${dispatchResult.mode} mode)${dispatchResult.error ? ` - Notice: ${dispatchResult.error}` : ''}`,
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
app.post('/api/telegram/broadcast-target-win', async (req: Request, res: Response) => {
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
app.post('/api/strategy/backtest', (req: Request, res: Response) => {
  const { strategyId, timeframe = '1Y', symbol = 'NIFTY 50' } = req.body;

  const strat = WORLD_CLASS_STRATEGIES.find(s => s.id === strategyId) || WORLD_CLASS_STRATEGIES[0];
  const monthsCount = timeframe === '6M' ? 6 : timeframe === '1Y' ? 12 : 36;
  
  // Base realistic performance based on strategy profile
  let baseWinRate = strat.winProbabilityPercent;
  let profitFactor = strat.category === 'NON_DIRECTIONAL' ? 1.82 : 2.14;
  let cagr = strat.category === 'NON_DIRECTIONAL' ? 24.8 : 32.5;
  let maxDD = strat.category === 'NON_DIRECTIONAL' ? -6.8 : -11.4;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyBreakdown = [];
  let currentEquity = 100000;
  let benchmarkEquity = 100000;
  const equityCurve = [];

  const now = new Date();
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mName = `${months[d.getMonth()]} '${d.getFullYear().toString().slice(-2)}`;
    
    // Probabilistic monthly return
    const isWin = Math.random() < (baseWinRate / 100);
    const returnPct = isWin
      ? (1.5 + Math.random() * 4.2)
      : -(0.8 + Math.random() * 2.8);

    const monthlyPnl = Math.round(currentEquity * (returnPct / 100));
    currentEquity += monthlyPnl;

    const benchmarkReturnPct = (Math.random() - 0.42) * 3.5;
    benchmarkEquity += Math.round(benchmarkEquity * (benchmarkReturnPct / 100));

    monthlyBreakdown.push({
      month: mName,
      pnl: monthlyPnl,
      winRate: Math.round((isWin ? baseWinRate + (Math.random() * 4 - 2) : baseWinRate - 8) * 10) / 10,
      trades: Math.floor(14 + Math.random() * 12),
    });

    equityCurve.push({
      date: mName,
      equity: Math.round(currentEquity),
      benchmark: Math.round(benchmarkEquity),
    });
  }

  const totalTrades = monthlyBreakdown.reduce((acc, m) => acc + m.trades, 0);
  const winTrades = Math.round(totalTrades * (baseWinRate / 100));
  const lossTrades = totalTrades - winTrades;
  const netPnl = currentEquity - 100000;

  const result: BacktestResult = {
    strategyId: strat.id,
    strategyName: strat.name,
    timeframe,
    totalTrades,
    winTrades,
    lossTrades,
    winRatePercent: baseWinRate,
    profitFactor,
    cagrPercent: cagr,
    maxDrawdownPercent: maxDD,
    netPnl,
    sharpeRatio: 1.84,
    monthlyBreakdown,
    equityCurve,
  };

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: devSettings.angelOne.clientCode || 'operator',
    action: 'BACKTEST_EXECUTED',
    category: 'TRADE',
    status: 'SUCCESS',
    details: `Backtest executed for ${strat.name} (${timeframe}) on ${symbol}. Net P&L: ₹${netPnl.toLocaleString('en-IN')}, Win Rate: ${baseWinRate}%`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    data: result,
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

  angelOneStreamer.updateCredentials(targetClient, targetKey, targetFeed);

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
app.post('/api/price-action/backtest', (req: Request, res: Response) => {
  const { indexSymbol = 'NIFTY 50', period = '6M', customCalibration } = req.body || {};
  const result = priceActionEngine.runHistoricalEdgeBacktest(indexSymbol, period, customCalibration);

  auditLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    user: devSettings.angelOne.clientCode || 'DCP78912',
    action: 'CHANAKYA_PRO_BACKTEST',
    category: 'TRADE',
    status: 'SUCCESS',
    details: `Chanakya Pro Backtest & Edge Calibration run for ${indexSymbol} (${period}). Win Rate: ${result.winRatePercent}%, Net Points: +${result.netPointsCaptured} pts, Optimal RR: ${result.calibratedOptimalRatio}`,
    ipAddress: req.ip || '127.0.0.1',
  });

  res.json({
    success: true,
    result,
  });
});

// Calibrate index edge parameters
app.post('/api/price-action/calibrate', (req: Request, res: Response) => {
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

// Evaluate live bar for S/R Breakout / Reversal or Trap
app.post('/api/price-action/evaluate', (req: Request, res: Response) => {
  const { indexSymbol = 'NIFTY 50', currentPrice, candle } = req.body || {};
  if (!currentPrice || !candle) {
    return res.status(400).json({ success: false, error: 'currentPrice and candle required' });
  }

  const signal = priceActionEngine.evaluateLiveCandle(indexSymbol, currentPrice, candle);
  res.json({
    success: true,
    signal,
    allSignals: priceActionEngine.getSignals(indexSymbol),
    statistics: priceActionEngine.getEngineStatistics(indexSymbol),
  });
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ShareMarket Pro trading server with Angel One Live WebSocket running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
