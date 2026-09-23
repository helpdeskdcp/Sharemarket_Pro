// Angel One instrument master (futures and options only), downloaded about
// once a day and shared by the market feed and the live signal engine.

const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
const REFRESH_MS = 20 * 60 * 60 * 1000;

// Underlyings the app trades: index derivatives and MCX commodities.
const WANTED_NAMES = new Set([
  'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX',
  'CRUDEOIL', 'CRUDEOILM', 'NATURALGAS', 'NATGASMINI', 'GOLD', 'GOLDM',
  'SILVER', 'SILVERM', 'COPPER', 'ZINC',
]);
const WANTED_TYPES = new Set(['FUTIDX', 'OPTIDX', 'FUTCOM', 'OPTFUT']);
const WANTED_EXCHANGES = new Set(['NFO', 'BFO', 'MCX']);

export interface InstrumentRow {
  token: string;
  symbol: string; // e.g. NIFTY29SEP2623450CE
  name: string; // e.g. NIFTY
  exchange: string; // NFO | BFO | MCX
  instrumentType: string; // FUTIDX | OPTIDX | FUTCOM | OPTFUT
  expiry: string; // e.g. 29SEP2026
  expiryKey: number; // e.g. 20260929
  strike: number; // rupees (the master stores strike x 100)
  optionType: 'CE' | 'PE' | null;
  lotSize: number;
  tickSize: number; // rupees (the master stores paise)
}

// "19OCT2026" -> 20261019
export function expiryToKey(expiry: string): number {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const day = Number(expiry.slice(0, 2));
  const month = months.indexOf(expiry.slice(2, 5).toUpperCase()) + 1;
  const year = Number(expiry.slice(5));
  if (!day || !month || !year) return 0;
  return year * 10000 + month * 100 + day;
}

export function todayKeyIST(): number {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCFullYear() * 10000 + (ist.getUTCMonth() + 1) * 100 + ist.getUTCDate();
}

let rows: InstrumentRow[] = [];
let fetchedAt = 0;
let inflight: Promise<InstrumentRow[]> | null = null;

async function download(): Promise<InstrumentRow[]> {
  const res = await fetch(SCRIP_MASTER_URL);
  if (!res.ok) throw new Error(`instrument master HTTP ${res.status}`);
  const all: any[] = await res.json();
  return all
    .filter(i => WANTED_EXCHANGES.has(i.exch_seg) && WANTED_TYPES.has(i.instrumenttype) && WANTED_NAMES.has(i.name))
    .map(i => {
      const symbol = String(i.symbol);
      const isOption = i.instrumenttype === 'OPTIDX' || i.instrumenttype === 'OPTFUT';
      return {
        token: String(i.token),
        symbol,
        name: String(i.name),
        exchange: String(i.exch_seg),
        instrumentType: String(i.instrumenttype),
        expiry: String(i.expiry),
        expiryKey: expiryToKey(String(i.expiry)),
        strike: isOption ? Number(i.strike) / 100 : 0,
        optionType: isOption ? (symbol.endsWith('CE') ? 'CE' : symbol.endsWith('PE') ? 'PE' : null) : null,
        lotSize: Number(i.lotsize) || 1,
        tickSize: (Number(i.tick_size) || 5) / 100,
      } as InstrumentRow;
    })
    .filter(r => r.expiryKey > 0);
}

// Returns the cached list, refreshing it about once a day. On a failed
// refresh the previous list is kept.
export async function getInstruments(): Promise<InstrumentRow[]> {
  if (rows.length && Date.now() - fetchedAt < REFRESH_MS) return rows;
  if (!inflight) {
    inflight = download()
      .then(next => {
        rows = next;
        fetchedAt = Date.now();
        return rows;
      })
      .catch(err => {
        if (rows.length) {
          console.warn('[Instruments] refresh failed, keeping previous list:', err?.message || err);
          return rows;
        }
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// Nearest contract of a type expiring on/after (or strictly after) a date.
export function nearestExpiry(
  list: InstrumentRow[],
  filter: { name: string; exchange: string; instrumentType: string },
  minExpiryKey: number,
  strictlyAfter = false
): InstrumentRow[] {
  const matching = list.filter(
    r =>
      r.name === filter.name &&
      r.exchange === filter.exchange &&
      r.instrumentType === filter.instrumentType &&
      (strictlyAfter ? r.expiryKey > minExpiryKey : r.expiryKey >= minExpiryKey)
  );
  if (!matching.length) return [];
  const first = Math.min(...matching.map(r => r.expiryKey));
  return matching.filter(r => r.expiryKey === first);
}
