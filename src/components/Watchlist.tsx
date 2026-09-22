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
}

export const Watchlist: React.FC<WatchlistProps> = ({ onQuickOrder }) => {
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
        ['RELIANCE', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'SBIN', 'ICICIBANK', 'BHARTIARTL', 'TCS'].includes(ticker.symbol)
      );
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
          </div>
        </div>

        {/* Angel One SmartAPI Feed Live Status Pill */}
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-slate-900/95 border border-emerald-900/50 flex items-center justify-between text-[10px] font-mono shadow-inner">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${feedStatus === 'ANGELONE_WS_CONNECTED' ? 'bg-emerald-400' : 'bg-cyan-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${feedStatus === 'ANGELONE_WS_CONNECTED' ? 'bg-emerald-500' : 'bg-cyan-500'}`}></span>
            </span>
            <div className="flex flex-col">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                {feedStatus === 'ANGELONE_WS_CONNECTED' ? 'Angel One SmartAPI WebSocket: LIVE' : 'Real Exchange Feed: LIVE'}
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
        <div className="grid grid-cols-5 gap-1 p-0.5 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setWatchlistType('INDICES')}
            className={`py-1.5 px-1.5 rounded-md font-bold transition text-center truncate cursor-pointer ${
              watchlistType === 'INDICES'
                ? 'bg-slate-800 text-cyan-400 shadow-sm border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Indices
          </button>
          <button
            onClick={() => setWatchlistType('NIFTY50')}
            className={`py-1.5 px-1.5 rounded-md font-semibold transition text-center truncate cursor-pointer ${
              watchlistType === 'NIFTY50'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Stocks
          </button>
          <button
            onClick={() => setWatchlistType('FO')}
            className={`py-1.5 px-1.5 rounded-md font-semibold transition text-center truncate cursor-pointer ${
              watchlistType === 'FO'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            F&amp;O
          </button>
          <button
            onClick={() => setWatchlistType('GLOBAL')}
            className={`py-1.5 px-1.5 rounded-md font-semibold transition text-center truncate flex items-center justify-center gap-1 cursor-pointer ${
              watchlistType === 'GLOBAL'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-3 w-3" />
            Global
          </button>
          <button
            onClick={() => setWatchlistType('CUSTOM')}
            className={`py-1.5 px-1.5 rounded-md font-semibold transition text-center truncate flex items-center justify-center gap-1 cursor-pointer ${
              watchlistType === 'CUSTOM'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className="h-3 w-3 text-amber-400" />
            Custom
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

