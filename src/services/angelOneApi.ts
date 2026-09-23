// Server-side Angel One SmartAPI REST helpers shared by the market feed,
// chart candles and the live signal engine.

export const SMARTAPI_BASE = 'https://apiconnect.angelone.in';

export interface SmartApiAuth {
  apiKey: string;
  jwtToken: string;
}

export interface AngelCandle {
  ts: number; // candle start, epoch ms
  dateKey: string; // IST trading date, YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type AngelCandleInterval =
  | 'ONE_MINUTE'
  | 'THREE_MINUTE'
  | 'FIVE_MINUTE'
  | 'TEN_MINUTE'
  | 'FIFTEEN_MINUTE'
  | 'THIRTY_MINUTE'
  | 'ONE_HOUR'
  | 'ONE_DAY';

export function smartApiHeaders(apiKey: string, jwtToken?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': 'fe80::1',
    'X-PrivateKey': apiKey,
    ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {}),
  };
}

// SmartAPI's historical endpoint allows only a few calls per second per
// account (shared with any other app on the same account), so every
// candle request goes through one queue with spacing between calls.
let historicalQueue: Promise<unknown> = Promise.resolve();

function queueHistoricalCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = historicalQueue.then(fn, fn);
  const spacing = () => new Promise(resolve => setTimeout(resolve, 1000));
  historicalQueue = run.then(spacing, spacing);
  return run;
}

// "yyyy-MM-dd HH:mm" in IST, as getCandleData expects
function formatCandleDate(ms: number): string {
  return new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

export async function getAngelCandles(
  auth: SmartApiAuth,
  exchange: string,
  symbolToken: string,
  interval: AngelCandleInterval,
  fromMs: number,
  toMs: number
): Promise<AngelCandle[] | null> {
  return queueHistoricalCall(async () => {
    const request = () =>
      fetch(`${SMARTAPI_BASE}/rest/secure/angelbroking/historical/v1/getCandleData`, {
        method: 'POST',
        headers: smartApiHeaders(auth.apiKey, auth.jwtToken),
        body: JSON.stringify({
          exchange,
          symboltoken: symbolToken,
          interval,
          fromdate: formatCandleDate(fromMs),
          todate: formatCandleDate(toMs),
        }),
      });

    try {
      let res = await request();
      // 403 = "exceeding access rate"; the quota is per account and shared
      // with other apps on it, so back off and retry twice.
      for (const waitMs of [2000, 4000]) {
        if (res.status !== 403) break;
        await new Promise(resolve => setTimeout(resolve, waitMs));
        res = await request();
      }
      if (!res.ok) {
        console.warn(`[AngelOne] candles ${exchange}:${symbolToken} ${interval} HTTP ${res.status}`);
        return null;
      }
      const json: any = await res.json().catch(() => null);
      const rows: any[] = Array.isArray(json?.data) ? json.data : [];
      return rows.map(([ts, o, h, l, c, v]) => ({
        ts: new Date(ts).getTime(),
        dateKey: String(ts).slice(0, 10),
        open: Number(o),
        high: Number(h),
        low: Number(l),
        close: Number(c),
        volume: Number(v) || 0,
      }));
    } catch (err: any) {
      console.warn(`[AngelOne] candles ${exchange}:${symbolToken} failed:`, err?.message || err);
      return null;
    }
  });
}

// Market quotes for up to 50 tokens across exchanges (NSE/BSE/NFO/BFO/MCX).
export async function getAngelQuotes(
  auth: SmartApiAuth,
  exchangeTokens: Record<string, string[]>,
  mode: 'LTP' | 'OHLC' | 'FULL' = 'FULL'
): Promise<any[] | null> {
  try {
    const res = await fetch(`${SMARTAPI_BASE}/rest/secure/angelbroking/market/v1/quote`, {
      method: 'POST',
      headers: smartApiHeaders(auth.apiKey, auth.jwtToken),
      body: JSON.stringify({ mode, exchangeTokens }),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.status || !Array.isArray(json?.data?.fetched)) {
      console.warn('[AngelOne] quote request failed:', res.status, json?.message || '');
      return null;
    }
    return json.data.fetched;
  } catch (err: any) {
    console.warn('[AngelOne] quote request error:', err?.message || err);
    return null;
  }
}
