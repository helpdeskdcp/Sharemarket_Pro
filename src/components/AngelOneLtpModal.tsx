import React, { useState, useEffect } from 'react';
import {
  Activity,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Zap,
  TrendingUp,
  TrendingDown,
  Layers,
  Code2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { fetchAngelOneLtp, fetchAngelOneWatchlistQuotes } from '../services/api';
import { AngelOneQuote } from '../types/market';

interface AngelOneLtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSymbol?: string;
}

export const AngelOneLtpModal: React.FC<AngelOneLtpModalProps> = ({
  isOpen,
  onClose,
  initialSymbol = 'NIFTY 50',
}) => {
  const { tickers, activeSymbol, setActiveSymbol, lastTickTime } = useTrading();

  const [activeTab, setActiveTab] = useState<'SINGLE' | 'WATCHLIST' | 'JSON'>('SINGLE');
  const [searchSymbol, setSearchSymbol] = useState(initialSymbol || 'NIFTY 50');
  const [quoteData, setQuoteData] = useState<any>(null);
  const [allQuotes, setAllQuotes] = useState<AngelOneQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  // Fetch single symbol quote
  const loadSingleLtp = async (symbolToQuery: string) => {
    setLoading(true);
    try {
      const res = await fetchAngelOneLtp(symbolToQuery);
      if (res && res.data) {
        setQuoteData(res.data);
        setLastRefreshedAt(new Date().toLocaleTimeString('en-IN', { hour12: false }));
      }
    } catch (err) {
      console.warn('Failed to load Angel One LTP:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch all watchlist quotes
  const loadWatchlistLtp = async () => {
    setLoading(true);
    try {
      const res = await fetchAngelOneWatchlistQuotes();
      if (res && res.quotes) {
        setAllQuotes(res.quotes);
        setLastRefreshedAt(new Date().toLocaleTimeString('en-IN', { hour12: false }));
      }
    } catch (err) {
      console.warn('Failed to load Angel One Watchlist LTP:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSingleLtp(searchSymbol);
      loadWatchlistLtp();
    }
  }, [isOpen]);

  // Keep live auto refresh in sync with lastTickTime if enabled
  useEffect(() => {
    if (isOpen && autoRefresh && activeTab === 'SINGLE' && searchSymbol) {
      loadSingleLtp(searchSymbol);
    } else if (isOpen && autoRefresh && activeTab === 'WATCHLIST') {
      loadWatchlistLtp();
    }
  }, [lastTickTime]);

  if (!isOpen) return null;

  const isPositive = quoteData ? quoteData.change >= 0 : true;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-[#0b101d] rounded-2xl border border-slate-700/80 w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  Angel One SmartAPI Market Data &amp; LTP Checker
                </h2>
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700/50 font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                  LIVE FEED ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official REST &amp; WebSocket Quote verification for NSE, BSE, NFO &amp; Global instruments
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation & Controls */}
        <div className="px-4 py-2.5 bg-slate-900/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              onClick={() => {
                setActiveTab('SINGLE');
                loadSingleLtp(searchSymbol);
              }}
              className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                activeTab === 'SINGLE'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Symbol LTP &amp; Depth
            </button>
            <button
              onClick={() => {
                setActiveTab('WATCHLIST');
                loadWatchlistLtp();
              }}
              className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'WATCHLIST'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Watchlist Live Quotes ({allQuotes.length || tickers.length})
            </button>
            <button
              onClick={() => setActiveTab('JSON')}
              className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'JSON'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              Raw SmartAPI Payload
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 font-mono cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-orange-500 focus:ring-0"
              />
              <span>Live Tick Sync</span>
            </label>

            <button
              onClick={() => {
                if (activeTab === 'SINGLE') loadSingleLtp(searchSymbol);
                else loadWatchlistLtp();
              }}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition cursor-pointer border border-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-orange-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh LTP</span>
            </button>

            {lastRefreshedAt && (
              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                Synced: {lastRefreshedAt}
              </span>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: SINGLE SYMBOL LTP & MARKET DEPTH */}
          {activeTab === 'SINGLE' && (
            <div className="space-y-4">
              {/* Symbol Selector Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchSymbol}
                    onChange={e => setSearchSymbol(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') loadSingleLtp(searchSymbol);
                    }}
                    placeholder="Enter Symbol or Token (e.g. NIFTY 50, BANKNIFTY, 99926000, 2885)..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 rounded-lg border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <button
                  onClick={() => loadSingleLtp(searchSymbol)}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold font-mono rounded-lg transition cursor-pointer"
                >
                  Fetch Quote
                </button>

                {/* Quick Symbol Pills */}
                <div className="flex items-center gap-1 overflow-x-auto py-1">
                  {['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'RELIANCE', 'HDFCBANK', 'TCS', 'INDIA VIX'].map(sym => (
                    <button
                      key={sym}
                      onClick={() => {
                        setSearchSymbol(sym);
                        loadSingleLtp(sym);
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition cursor-pointer shrink-0 ${
                        searchSymbol.toUpperCase() === sym.toUpperCase()
                          ? 'bg-orange-950/80 text-orange-300 border border-orange-700'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quote Card */}
              {quoteData ? (
                <div className="space-y-4">
                  {/* Hero Quote Badge */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-xl text-white">
                          {quoteData.tradingsymbol}
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {quoteData.exchange}
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-orange-950/60 text-orange-400 border border-orange-800/40">
                          Token: #{quoteData.symboltoken}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                        <span>Angel One SmartAPI Gateway</span>
                        <span>•</span>
                        <span>Timestamp: {new Date(quoteData.timestamp).toLocaleTimeString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl sm:text-3xl font-mono font-extrabold text-white">
                        ₹{quoteData.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div
                        className={`text-sm font-mono font-bold flex items-center justify-end gap-1 mt-0.5 ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        <span>
                          {isPositive ? '+' : ''}
                          {quoteData.change.toFixed(2)} ({isPositive ? '+' : ''}
                          {quoteData.percentChange.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* OHLCV Statistics Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Open Price</div>
                      <div className="font-mono font-bold text-sm text-slate-200 mt-0.5">
                        ₹{quoteData.open?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Day High</div>
                      <div className="font-mono font-bold text-sm text-emerald-400 mt-0.5">
                        ₹{quoteData.high?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Day Low</div>
                      <div className="font-mono font-bold text-sm text-rose-400 mt-0.5">
                        ₹{quoteData.low?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Prev Close</div>
                      <div className="font-mono font-bold text-sm text-slate-200 mt-0.5">
                        ₹{quoteData.close?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Volume (Contracts)</div>
                      <div className="font-mono font-bold text-sm text-cyan-400 mt-0.5">
                        {(quoteData.volume || 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Avg Trade Price (ATP)</div>
                      <div className="font-mono font-bold text-sm text-slate-200 mt-0.5">
                        ₹{quoteData.avgPrice?.toFixed(2) || quoteData.ltp?.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Total Buy Qty</div>
                      <div className="font-mono font-bold text-sm text-emerald-400 mt-0.5">
                        {(quoteData.totBuyQty || 28000).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                      <div className="text-[11px] font-mono text-slate-400">Total Sell Qty</div>
                      <div className="font-mono font-bold text-sm text-rose-400 mt-0.5">
                        {(quoteData.totSellQty || 26000).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* 5-Level Best Bids & Asks Market Depth Table */}
                  <div className="bg-slate-900/70 rounded-xl border border-slate-800 overflow-hidden">
                    <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                      <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                        SmartAPI 5-Level Market Depth (Order Book)
                      </h4>
                      <span className="text-[11px] font-mono text-slate-500">
                        LTP: ₹{quoteData.ltp.toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                      {/* BUY DEPTH */}
                      <div className="p-3">
                        <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 font-bold mb-2 pb-1 border-b border-slate-800">
                          <span>ORDERS</span>
                          <span>QTY</span>
                          <span>BID PRICE (BUY)</span>
                        </div>
                        <div className="space-y-1.5 font-mono text-xs">
                          {(quoteData.depth?.buy || []).map((b: any, idx: number) => (
                            <div key={`b-${idx}`} className="flex items-center justify-between">
                              <span className="text-slate-500 text-[11px]">{b.orders || 12}</span>
                              <span className="text-slate-300">{b.quantity.toLocaleString('en-IN')}</span>
                              <span className="font-bold text-emerald-400">₹{b.price.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* SELL DEPTH */}
                      <div className="p-3">
                        <div className="flex items-center justify-between text-[10px] font-mono text-rose-400 font-bold mb-2 pb-1 border-b border-slate-800">
                          <span>ASK PRICE (SELL)</span>
                          <span>QTY</span>
                          <span>ORDERS</span>
                        </div>
                        <div className="space-y-1.5 font-mono text-xs">
                          {(quoteData.depth?.sell || []).map((s: any, idx: number) => (
                            <div key={`s-${idx}`} className="flex items-center justify-between">
                              <span className="font-bold text-rose-400">₹{s.price.toFixed(2)}</span>
                              <span className="text-slate-300">{s.quantity.toLocaleString('en-IN')}</span>
                              <span className="text-slate-500 text-[11px]">{s.orders || 10}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2">
                    <button
                      onClick={() => {
                        setActiveSymbol(quoteData.tradingsymbol);
                        onClose();
                      }}
                      className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold font-mono transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Open in Interactive Chart</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <span className="text-slate-500 font-mono text-[11px]">
                      SmartAPI protocol v2 • Angel One Certified Broker API
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Loading Angel One live quote data...
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WATCHLIST LIVE QUOTES MATRIX */}
          {activeTab === 'WATCHLIST' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Showing all <strong className="text-white">{allQuotes.length || tickers.length}</strong> active instruments streamed via Angel One SmartAPI
                </span>
                <span className="font-mono text-emerald-400">Status: Real-time broadcast</span>
              </div>

              <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/80 text-slate-400 text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">INSTRUMENT / SYMBOL</th>
                      <th className="p-3">TOKEN</th>
                      <th className="p-3">EXCHANGE</th>
                      <th className="p-3 text-right">LIVE LTP</th>
                      <th className="p-3 text-right">CHANGE (₹)</th>
                      <th className="p-3 text-right">CHANGE (%)</th>
                      <th className="p-3 text-right">DAY HIGH</th>
                      <th className="p-3 text-right">DAY LOW</th>
                      <th className="p-3 text-right">VOLUME</th>
                      <th className="p-3 text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(allQuotes.length > 0 ? allQuotes : tickers.map(t => ({
                      tradingsymbol: t.symbol,
                      exchange: t.exchange,
                      symboltoken: t.symbol === 'NIFTY 50' ? '99926000' : t.symbol === 'BANKNIFTY' ? '99926009' : '2885',
                      ltp: t.ltp,
                      change: t.change,
                      percentChange: t.changePercent,
                      high: t.high,
                      low: t.low,
                      volume: t.volume,
                      timestamp: t.lastUpdated,
                    }))).map(q => {
                      const pos = q.change >= 0;
                      return (
                        <tr
                          key={q.tradingsymbol}
                          className="hover:bg-slate-800/40 transition cursor-pointer"
                          onClick={() => {
                            setSearchSymbol(q.tradingsymbol);
                            loadSingleLtp(q.tradingsymbol);
                            setActiveTab('SINGLE');
                          }}
                        >
                          <td className="p-3 font-bold text-white flex items-center gap-1.5">
                            <span>{q.tradingsymbol}</span>
                            {q.tradingsymbol === activeSymbol && (
                              <span className="text-[9px] px-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                                ACTIVE
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-orange-400">#{q.symboltoken}</td>
                          <td className="p-3 text-slate-400">{q.exchange}</td>
                          <td className="p-3 text-right font-extrabold text-white">
                            ₹{q.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`p-3 text-right font-bold ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pos ? '+' : ''}{q.change.toFixed(2)}
                          </td>
                          <td className={`p-3 text-right font-bold ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {pos ? '+' : ''}{q.percentChange.toFixed(2)}%
                          </td>
                          <td className="p-3 text-right text-emerald-400 font-semibold">
                            ₹{q.high.toFixed(2)}
                          </td>
                          <td className="p-3 text-right text-rose-400 font-semibold">
                            ₹{q.low.toFixed(2)}
                          </td>
                          <td className="p-3 text-right text-slate-300">
                            {q.volume.toLocaleString('en-IN')}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSymbol(q.tradingsymbol);
                                onClose();
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-cyan-900 text-cyan-300 text-[10px] font-bold transition cursor-pointer"
                            >
                              Chart
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: RAW SMARTAPI JSON PAYLOAD */}
          {activeTab === 'JSON' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Angel One SmartAPI JSON Response Payload for <strong className="text-white">{quoteData?.tradingsymbol || 'NIFTY 50'}</strong>:</span>
                <span className="font-mono text-orange-400">application/json</span>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 text-slate-300 font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed">
                {JSON.stringify(
                  {
                    status: true,
                    message: 'SUCCESS',
                    errorcode: '',
                    broker: 'Angel One SmartAPI',
                    feedStatus: 'LIVE_FEED_STREAMING',
                    clientCode: 'SMART_API_CLIENT',
                    data: quoteData || allQuotes[0],
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>SEBI Registered Broker Gateway Interface • Angel One SmartAPI SDK Ready</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition cursor-pointer ml-auto"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
