import React, { useState } from 'react';
import {
  Search,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Globe,
  Layers,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Activity,
  CheckCircle2,
  X,
  Flame,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { Ticker } from '../types/market';
import { AngelOneLtpModal } from './AngelOneLtpModal';

// Angel One token reference lookup for badge display
const TOKEN_BADGES: Record<string, string> = {
  'NIFTY 50': '99926000',
  'BANKNIFTY': '99926009',
  'FINNIFTY': '99926037',
  'MIDCPNIFTY': '99926074',
  'SENSEX': '99919000',
  'BANKEX': '99919012',
  'INDIA VIX': '99926017',
  'NATURALGAS': 'MCX_NG',
  'NATURALGASMINI': 'MCX_NGM',
  'CRUDEOIL': 'MCX_CRUDE',
  'CRUDEOILMINI': 'MCX_CRDM',
  'GOLD': 'MCX_GOLD',
  'GOLDMINI': 'MCX_GLDM',
  'SILVER': 'MCX_SILVER',
  'SILVERMINI': 'MCX_SLVM',
  'COPPER': 'MCX_COPPER',
  'ZINC': 'MCX_ZINC',
  'RELIANCE': '2885',
  'HDFCBANK': '1333',
  'INFY': '1594',
  'TCS': '11536',
  'TATAMOTORS': '3456',
  'SBIN': '3045',
  'ICICIBANK': '4963',
  'BHARTIARTL': '10604',
};

interface WatchlistProps {
  onQuickOrder: (symbol: string, side: 'BUY' | 'SELL') => void;
  onClose?: () => void;
  fullPageMode?: boolean;
}

export const Watchlist: React.FC<WatchlistProps> = ({ onQuickOrder, onClose, fullPageMode = false }) => {
  const {
    tickers,
    activeSymbol,
    setActiveSymbol,
    watchlistType,
    setWatchlistType,
    customWatchlist,
    addToCustomWatchlist,
    removeFromCustomWatchlist,
    tickFlashMap,
    lastTickTime,
    feedSource,
    feedStatus,
    reconnectLiveStream,
  } = useTrading();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLtpModal, setShowLtpModal] = useState(false);
  const [selectedLtpSymbol, setSelectedLtpSymbol] = useState('NIFTY 50');

  // Filter tickers based on active tab
  const filteredByTab = tickers.filter(ticker => {
    if (watchlistType === 'INDICES') {
      return ticker.instrumentType === 'INDEX';
    }
    if (watchlistType === 'NIFTY50') {
      return ticker.exchange === 'NSE' && ticker.instrumentType === 'EQUITY';
    }
    if (watchlistType === 'FO') {
      return (
        ticker.instrumentType === 'INDEX' ||
        ticker.exchange === 'MCX' ||
        ['RELIANCE', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'SBIN', 'ICICIBANK', 'BHARTIARTL', 'TCS'].includes(ticker.symbol)
      );
    }
    if (watchlistType === 'MCX') {
      return ticker.exchange === 'MCX' || ticker.instrumentType === 'COMMODITY';
    }
    if (watchlistType === 'GLOBAL') {
      return ticker.instrumentType === 'GLOBAL';
    }
    if (watchlistType === 'CUSTOM') {
      return customWatchlist.includes(ticker.symbol);
    }
    return true;
  });

  // Apply search
  const displayedTickers = filteredByTab.filter(t =>
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Top Key Indices for Header Banner in Full Page Mode
  const keyIndices = tickers.filter(t => ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'INDIA VIX'].includes(t.symbol));

  if (fullPageMode) {
    return (
      <div className="space-y-4">
        {/* Top Key Indices Ticker Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {keyIndices.map(idx => {
            const isPos = idx.change >= 0;
            const flash = tickFlashMap[idx.symbol];
            return (
              <div
                key={idx.symbol}
                onClick={() => {
                  setActiveSymbol(idx.symbol);
                  setSelectedLtpSymbol(idx.symbol);
                }}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  activeSymbol === idx.symbol
                    ? 'bg-[#0f172a] border-cyan-500/60 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/40'
                    : 'bg-[#0b101d] border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-white font-mono">{idx.symbol}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    #{TOKEN_BADGES[idx.symbol] || 'INDEX'}
                  </span>
                </div>
                <div className={`text-base font-bold font-mono transition-colors ${
                  flash === 'UP' ? 'text-emerald-300' : flash === 'DOWN' ? 'text-rose-300' : 'text-white'
                }`}>
                  ₹{idx.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-xs font-mono font-semibold flex items-center gap-1 mt-0.5 ${
                  isPos ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {isPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  <span>{isPos ? '+' : ''}{idx.change.toFixed(2)} ({isPos ? '+' : ''}{idx.changePercent.toFixed(2)}%)</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dedicated Watchlist Main Card */}
        <div className="bg-[#0b101d] rounded-2xl border border-slate-800/90 shadow-xl overflow-hidden flex flex-col">
          {/* Header Bar */}
          <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-[#0c1222]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  Market Watchlist &amp; Exchange Ticker Matrix
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 font-mono border border-slate-700">
                    {displayedTickers.length} Active Instruments
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  Real-time sub-second streaming quotes with Angel One SmartAPI depth, token mapping &amp; one-click order triggers
                </p>
              </div>
            </div>

            {/* Live Feed Status Pill */}
            <div className="flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-emerald-900/60 flex items-center gap-2 text-xs font-mono">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-400 font-semibold">{feedStatus}</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 text-[11px]">{feedSource}</span>
              </div>

              <button
                onClick={reconnectLiveStream}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition"
              >
                Reconnect
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono transition shadow-md shadow-cyan-600/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Symbol
              </button>
            </div>
          </div>

          {/* Tab Navigation & Search Bar */}
          <div className="p-3 border-b border-slate-800/80 bg-[#090d18] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {[
                { id: 'INDICES' as const, label: 'Key Indices', icon: Layers },
                { id: 'NIFTY50' as const, label: 'Nifty 50 Stocks', icon: Activity },
                { id: 'FO' as const, label: 'F&O Derivatives', icon: Zap },
                { id: 'MCX' as const, label: 'MCX Commodities', icon: Flame },
                { id: 'GLOBAL' as const, label: 'Global Markets', icon: Globe },
                { id: 'CUSTOM' as const, label: `Custom Starred (${customWatchlist.length})`, icon: Star },
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = watchlistType === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setWatchlistType(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search symbol, index, sector..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Full Page Watchlist Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-900/90 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Instrument</th>
                  <th className="py-2.5 px-3">Exchange / Token</th>
                  <th className="py-2.5 px-3 text-right">LTP</th>
                  <th className="py-2.5 px-3 text-right">Net Change</th>
                  <th className="py-2.5 px-3 text-right">% Change</th>
                  <th className="py-2.5 px-3 text-right">Today's Range (L - H)</th>
                  <th className="py-2.5 px-3 text-right">52W Range</th>
                  <th className="py-2.5 px-3 text-right">Volume</th>
                  <th className="py-2.5 px-4 text-center">Quick Trade &amp; Depth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayedTickers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No instruments found matching your search.
                    </td>
                  </tr>
                ) : (
                  displayedTickers.map(ticker => {
                    const isSelected = activeSymbol === ticker.symbol;
                    const isPositive = ticker.change >= 0;
                    const isCustom = customWatchlist.includes(ticker.symbol);
                    const flash = tickFlashMap[ticker.symbol];

                    return (
                      <tr
                        key={ticker.symbol}
                        onClick={() => setActiveSymbol(ticker.symbol)}
                        className={`hover:bg-slate-850/50 transition cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800/60 border-l-2 border-cyan-400'
                            : flash === 'UP'
                            ? 'bg-emerald-950/20'
                            : flash === 'DOWN'
                            ? 'bg-rose-950/20'
                            : ''
                        }`}
                      >
                        {/* Instrument */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (isCustom) {
                                  removeFromCustomWatchlist(ticker.symbol);
                                } else {
                                  addToCustomWatchlist(ticker.symbol);
                                }
                              }}
                              className="text-slate-500 hover:text-amber-400 transition"
                              title={isCustom ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <Star className={`h-3.5 w-3.5 ${isCustom ? 'fill-amber-400 text-amber-400' : ''}`} />
                            </button>
                            <div>
                              <span className="font-bold text-white text-xs">{ticker.symbol}</span>
                              <div className="text-[11px] text-slate-400 line-clamp-1">{ticker.name}</div>
                            </div>
                          </div>
                        </td>

                        {/* Exchange / Token */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold border border-slate-700">
                              {ticker.exchange}
                            </span>
                            {TOKEN_BADGES[ticker.symbol] && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedLtpSymbol(ticker.symbol);
                                  setShowLtpModal(true);
                                }}
                                className="px-1.5 py-0.5 rounded bg-orange-950/80 text-orange-300 text-[10px] font-bold border border-orange-800 hover:bg-orange-900 transition"
                                title="Inspect Angel One Live Quote & Order Depth"
                              >
                                #{TOKEN_BADGES[ticker.symbol]}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* LTP */}
                        <td className="py-3 px-3 text-right">
                          <span className={`font-bold text-xs transition-colors ${
                            flash === 'UP' ? 'text-emerald-300 font-extrabold' : flash === 'DOWN' ? 'text-rose-300 font-extrabold' : 'text-white'
                          }`}>
                            {ticker.currency === 'USD' ? '$' : '₹'}
                            {ticker.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* Net Change */}
                        <td className="py-3 px-3 text-right">
                          <span className={`font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}{ticker.change.toFixed(2)}
                          </span>
                        </td>

                        {/* % Change */}
                        <td className="py-3 px-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isPositive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}>
                            {isPositive ? '+' : ''}{ticker.changePercent.toFixed(2)}%
                          </span>
                        </td>

                        {/* Today's Range */}
                        <td className="py-3 px-3 text-right">
                          <div className="text-[11px] text-slate-300">
                            {ticker.currency === 'USD' ? '$' : '₹'}{ticker.low.toLocaleString('en-IN', { minimumFractionDigits: 1 })} - {ticker.currency === 'USD' ? '$' : '₹'}{ticker.high.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                          </div>
                          <div className="w-24 bg-slate-800 h-1.5 rounded-full mt-1 ml-auto overflow-hidden">
                            <div
                              className="bg-cyan-500 h-full rounded-full"
                              style={{
                                width: `${Math.min(100, Math.max(10, ((ticker.ltp - ticker.low) / ((ticker.high - ticker.low) || 1)) * 100))}%`,
                              }}
                            />
                          </div>
                        </td>

                        {/* 52W Range */}
                        <td className="py-3 px-3 text-right text-slate-400 text-[11px]">
                          {ticker.low52w ? (
                            <span>₹{ticker.low52w.toLocaleString('en-IN')} - ₹{ticker.high52w?.toLocaleString('en-IN')}</span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* Volume */}
                        <td className="py-3 px-3 text-right text-slate-400 text-[11px]">
                          {(ticker.volume / 100000).toFixed(2)} L
                        </td>

                        {/* Quick Trade & Depth */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onQuickOrder(ticker.symbol, 'BUY', ticker.ltp);
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] tracking-wider transition shadow-sm"
                            >
                              BUY
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onQuickOrder(ticker.symbol, 'SELL', ticker.ltp);
                              }}
                              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] tracking-wider transition shadow-sm"
                            >
                              SELL
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedLtpSymbol(ticker.symbol);
                                setShowLtpModal(true);
                              }}
                              className="px-2 py-1 rounded bg-orange-950 hover:bg-orange-900 text-orange-400 font-bold text-[10px] border border-orange-800 transition"
                              title="Live Order Depth & Quotes"
                            >
                              DEPTH
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Symbol Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0f172a] rounded-xl border border-slate-700 w-full max-w-md p-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-bold text-sm text-white">Add Symbol to Watchlist</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="py-3">
                <p className="text-xs text-slate-400 mb-2">
                  Select from all Indian equity, derivatives &amp; international indices:
                </p>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800 space-y-1">
                  {tickers.map(ticker => {
                    const alreadyInCustom = customWatchlist.includes(ticker.symbol);
                    return (
                      <div
                        key={ticker.symbol}
                        className="py-2 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold font-mono text-white">{ticker.symbol}</div>
                          <div className="text-[11px] text-slate-400">{ticker.name}</div>
                        </div>
                        <button
                          onClick={() => {
                            if (alreadyInCustom) {
                              removeFromCustomWatchlist(ticker.symbol);
                            } else {
                              addToCustomWatchlist(ticker.symbol);
                            }
                          }}
                          className={`px-3 py-1 rounded text-[11px] font-semibold transition ${
                            alreadyInCustom
                              ? 'bg-rose-950/70 border border-rose-700/60 text-rose-300 hover:bg-rose-900'
                              : 'bg-cyan-950/70 border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900'
                          }`}
                        >
                          {alreadyInCustom ? 'Remove' : '+ Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 text-right">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Angel One SmartAPI Live Quote & LTP Inspector Modal */}
        <AngelOneLtpModal
          isOpen={showLtpModal}
          onClose={() => setShowLtpModal(false)}
          initialSymbol={selectedLtpSymbol}
        />
      </div>
    );
  }

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col h-full overflow-hidden">
      {/* Header & Watchlist Tabs */}
      <div className="p-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-slate-200">
            <Layers className="h-4 w-4 text-cyan-400" />
            Watchlist
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              {displayedTickers.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setSelectedLtpSymbol(activeSymbol);
                setShowLtpModal(true);
              }}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-orange-950/70 hover:bg-orange-900 text-orange-300 border border-orange-700/60 font-mono font-bold transition cursor-pointer"
              title="Inspect Angel One Live LTP and Order Book Depth"
            >
              <Zap className="h-3 w-3 text-orange-400" />
              Angel One LTP
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/60 transition cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Minimize Watchlist"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Angel One SmartAPI Feed Live Status Pill */}
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-slate-900/95 border border-emerald-900/50 flex items-center justify-between text-[10px] font-mono shadow-inner">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${feedStatus.startsWith('ANGELONE') ? 'bg-emerald-400' : 'bg-cyan-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${feedStatus.startsWith('ANGELONE') ? 'bg-emerald-500' : 'bg-cyan-500'}`}></span>
            </span>
            <div className="flex flex-col">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                {feedStatus === 'ANGELONE_WS_CONNECTED'
                  ? 'Angel One SmartAPI WebSocket: LIVE'
                  : feedStatus === 'ANGELONE_REST_LIVE'
                    ? 'Angel One SmartAPI Quotes: LIVE'
                    : feedStatus === 'REAL_EXCHANGE_LIVE'
                      ? 'Fallback Feed (Yahoo): DELAYED'
                      : 'Connecting to live feed…'}
              </span>
              <span className="text-[9px] text-slate-400 truncate max-w-[170px]">{feedSource}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={reconnectLiveStream}
              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
              title="Reconnect to Angel One SmartAPI WebSocket feed"
            >
              Reconnect
            </button>
            <button
              onClick={() => {
                setSelectedLtpSymbol(activeSymbol);
                setShowLtpModal(true);
              }}
              className="text-orange-400 hover:text-orange-300 hover:underline cursor-pointer font-bold"
            >
              LTP Quotes &rarr;
            </button>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-6 gap-1 p-0.5 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setWatchlistType('INDICES')}
            className={`py-1.5 px-1 rounded-md font-bold transition text-center truncate cursor-pointer ${
              watchlistType === 'INDICES'
                ? 'bg-slate-800 text-cyan-400 shadow-sm border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Indices
          </button>
          <button
            onClick={() => setWatchlistType('NIFTY50')}
            className={`py-1.5 px-1 rounded-md font-semibold transition text-center truncate cursor-pointer ${
              watchlistType === 'NIFTY50'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Stocks
          </button>
          <button
            onClick={() => setWatchlistType('FO')}
            className={`py-1.5 px-1 rounded-md font-semibold transition text-center truncate cursor-pointer ${
              watchlistType === 'FO'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            F&amp;O
          </button>
          <button
            onClick={() => setWatchlistType('MCX')}
            className={`py-1.5 px-1 rounded-md font-semibold transition text-center truncate cursor-pointer ${
              watchlistType === 'MCX'
                ? 'bg-slate-800 text-amber-400 shadow-sm border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            MCX
          </button>
          <button
            onClick={() => setWatchlistType('GLOBAL')}
            className={`py-1.5 px-1 rounded-md font-semibold transition text-center truncate flex items-center justify-center gap-0.5 cursor-pointer ${
              watchlistType === 'GLOBAL'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-2.5 w-2.5" />
            Global
          </button>
          <button
            onClick={() => setWatchlistType('CUSTOM')}
            className={`py-1.5 px-1 rounded-md font-semibold transition text-center truncate flex items-center justify-center gap-0.5 cursor-pointer ${
              watchlistType === 'CUSTOM'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className="h-2.5 w-2.5 text-amber-400" />
            Star
          </button>
        </div>

        {/* Search input */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search index, equity, global..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 rounded-lg border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 font-mono"
          />
        </div>
      </div>

      {/* List of Tickers */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {displayedTickers.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No instruments found matching your search.
          </div>
        ) : (
          displayedTickers.map(ticker => {
            const isSelected = activeSymbol === ticker.symbol;
            const isPositive = ticker.change >= 0;
            const isCustom = customWatchlist.includes(ticker.symbol);
            const flash = tickFlashMap[ticker.symbol];

            return (
              <div
                key={ticker.symbol}
                onClick={() => setActiveSymbol(ticker.symbol)}
                className={`p-2.5 transition flex items-center justify-between cursor-pointer group ${
                  isSelected
                    ? 'bg-slate-800/80 border-l-2 border-cyan-400'
                    : flash === 'UP'
                    ? 'bg-emerald-950/40'
                    : flash === 'DOWN'
                    ? 'bg-rose-950/40'
                    : 'hover:bg-slate-900/70'
                }`}
              >
                {/* Left: Symbol details */}
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-xs text-white group-hover:text-cyan-300 transition">
                      {ticker.symbol}
                    </span>
                    <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                      {ticker.exchange}
                    </span>
                    {TOKEN_BADGES[ticker.symbol] && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedLtpSymbol(ticker.symbol);
                          setShowLtpModal(true);
                        }}
                        className="text-[9px] font-mono px-1 rounded bg-orange-950/60 hover:bg-orange-900 text-orange-400 border border-orange-850/60 cursor-pointer font-bold"
                        title="Click to inspect Angel One SmartAPI Quote & Order Book"
                      >
                        #{TOKEN_BADGES[ticker.symbol]}
                      </button>
                    )}
                    {ticker.instrumentType === 'INDEX' && (
                      <span className="text-[9px] font-mono px-1 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/40 font-semibold">
                        INDEX
                      </span>
                    )}
                    {ticker.instrumentType === 'GLOBAL' && (
                      <span className="text-[9px] font-mono px-1 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800/40">
                        GLOBAL
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[170px] mt-0.5">
                    {ticker.name}
                  </div>
                </div>

                {/* Right: LTP, Change %, Quick Order triggers */}
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className={`font-mono font-bold text-xs transition-colors ${
                      flash === 'UP' ? 'text-emerald-300' : flash === 'DOWN' ? 'text-rose-300' : 'text-white'
                    }`}>
                      {ticker.currency === 'USD' ? '$' : '₹'}
                      {ticker.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div
                      className={`text-[11px] font-mono font-semibold flex items-center justify-end gap-0.5 ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="h-3 w-3 inline" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 inline" />
                      )}
                      <span>
                        {isPositive ? '+' : ''}
                        {ticker.change.toFixed(2)} ({isPositive ? '+' : ''}
                        {ticker.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>

                  {/* Hover Quick Buy/Sell Buttons */}
                  <div className="hidden group-hover:flex items-center gap-1 pl-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onQuickOrder(ticker.symbol, 'BUY');
                      }}
                      className="px-2 py-1 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-[10px] tracking-wide transition shadow-sm cursor-pointer"
                      title={`Instant Buy ${ticker.symbol}`}
                    >
                      B
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onQuickOrder(ticker.symbol, 'SELL');
                      }}
                      className="px-2 py-1 rounded bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-[10px] tracking-wide transition shadow-sm cursor-pointer"
                      title={`Instant Sell ${ticker.symbol}`}
                    >
                      S
                    </button>
                    {watchlistType === 'CUSTOM' ? (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          removeFromCustomWatchlist(ticker.symbol);
                        }}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        title="Remove from custom watchlist"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (isCustom) {
                            removeFromCustomWatchlist(ticker.symbol);
                          } else {
                            addToCustomWatchlist(ticker.symbol);
                          }
                        }}
                        className={`p-1 rounded transition cursor-pointer ${
                          isCustom
                            ? 'bg-amber-950/60 text-amber-400 hover:bg-amber-900/60'
                            : 'bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-700'
                        }`}
                        title={isCustom ? 'Starred' : 'Add to Starred'}
                      >
                        <Star className={`h-3 w-3 ${isCustom ? 'fill-amber-400' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Symbol Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] rounded-xl border border-slate-700 w-full max-w-md p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white">Add Symbol to Watchlist</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="py-3">
              <p className="text-xs text-slate-400 mb-2">
                Select from all Indian equity, derivatives &amp; international indices:
              </p>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800 space-y-1">
                {tickers.map(ticker => {
                  const alreadyInCustom = customWatchlist.includes(ticker.symbol);
                  return (
                    <div
                      key={ticker.symbol}
                      className="py-2 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold font-mono text-white">{ticker.symbol}</div>
                        <div className="text-[11px] text-slate-400">{ticker.name}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (alreadyInCustom) {
                            removeFromCustomWatchlist(ticker.symbol);
                          } else {
                            addToCustomWatchlist(ticker.symbol);
                          }
                        }}
                        className={`px-3 py-1 rounded text-[11px] font-semibold transition ${
                          alreadyInCustom
                            ? 'bg-rose-950/70 border border-rose-700/60 text-rose-300 hover:bg-rose-900'
                            : 'bg-cyan-950/70 border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900'
                        }`}
                      >
                        {alreadyInCustom ? 'Remove' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-right">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Angel One SmartAPI Live Quote & LTP Inspector Modal */}
      <AngelOneLtpModal
        isOpen={showLtpModal}
        onClose={() => setShowLtpModal(false)}
        initialSymbol={selectedLtpSymbol}
      />
    </div>
  );
};

