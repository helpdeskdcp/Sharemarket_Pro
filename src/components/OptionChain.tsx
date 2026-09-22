import React, { useState, useEffect } from 'react';
import {
  Layers,
  TrendingUp,
  Percent,
  Activity,
  Zap,
  Info,
  ChevronDown,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { fetchOptionChain } from '../services/api';
import { OptionChainData, OptionStrike } from '../types/market';

interface OptionChainProps {
  onSelectOptionTrade: (symbol: string, strike: number, type: 'CE' | 'PE', price: number) => void;
}

export const OptionChain: React.FC<OptionChainProps> = ({ onSelectOptionTrade }) => {
  const { activeSymbol, tickers } = useTrading();
  
  // Preferred F&O underlying index
  const [selectedUnderlying, setSelectedUnderlying] = useState<string>(
    activeSymbol === 'BANKNIFTY' ? 'BANKNIFTY' : activeSymbol === 'FINNIFTY' ? 'FINNIFTY' : 'NIFTY 50'
  );
  const [selectedExpiry, setSelectedExpiry] = useState<string>('Current Weekly (26-SEP-2024)');
  const [chainData, setChainData] = useState<OptionChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'PRICE_OI' | 'GREEKS'>('PRICE_OI');

  // Load option chain data
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchOptionChain(selectedUnderlying)
      .then(data => {
        if (isMounted) {
          setChainData(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.warn('Failed to load option chain:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedUnderlying, selectedExpiry]);

  const currentUnderlyingTicker = tickers.find(t => t.symbol.toUpperCase() === selectedUnderlying.toUpperCase());
  const underlyingLtp = currentUnderlyingTicker ? currentUnderlyingTicker.ltp : (chainData?.underlyingPrice || 24824.50);

  // PCR sentiment color
  const pcr = chainData?.pcr || 1.12;
  const pcrSentiment = pcr > 1.2 ? 'Bullish' : pcr < 0.8 ? 'Bearish' : 'Neutral / Rangebound';
  const pcrColor = pcr > 1.2 ? 'text-emerald-400' : pcr < 0.8 ? 'text-rose-400' : 'text-amber-400';

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col overflow-hidden">
      {/* Top Chain Header Bar */}
      <div className="p-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        {/* Underlying Selector & LTP */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-slate-200">
            <Zap className="h-4 w-4 text-cyan-400" />
            F&amp;O Options Chain
          </div>

          <div className="flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800 text-xs font-mono font-bold">
            {(['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'] as const).map(sym => (
              <button
                key={sym}
                onClick={() => setSelectedUnderlying(sym)}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  selectedUnderlying === sym
                    ? 'bg-cyan-500 text-slate-950 font-extrabold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          <div className="font-mono text-xs text-slate-300">
            Spot: <span className="font-bold text-white">₹{underlyingLtp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Expiry Selector & Greek View Toggle */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400 text-[11px] hidden sm:inline">Expiry:</span>
          <select
            value={selectedExpiry}
            onChange={e => setSelectedExpiry(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
          >
            {chainData?.expiryDates.map(exp => (
              <option key={exp} value={exp}>
                {exp}
              </option>
            )) || <option>Current Weekly (26-SEP-2024)</option>}
          </select>

          <button
            onClick={() => setViewMode(viewMode === 'PRICE_OI' ? 'GREEKS' : 'PRICE_OI')}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
              viewMode === 'GREEKS'
                ? 'bg-purple-950/60 border-purple-500/40 text-purple-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {viewMode === 'GREEKS' ? 'Showing: Greeks (Δ, θ, γ)' : 'Show Greeks'}
          </button>
        </div>
      </div>

      {/* Derivative Metrics Ribbon: PCR, Max Pain, Total OI */}
      {chainData && (
        <div className="px-4 py-2 bg-[#080c16] border-b border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-400">Put-Call Ratio (PCR):</span>
            <span className={`font-bold ${pcrColor}`}>
              {chainData.pcr} ({pcrSentiment})
            </span>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-400">Max Pain Strike:</span>
            <span className="font-bold text-amber-400">₹{chainData.maxPain}</span>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-400">Major Resistance:</span>
            <span className="font-bold text-rose-400">₹{chainData.highestCallOIStrike} CE</span>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-slate-400">Major Support:</span>
            <span className="font-bold text-emerald-400">₹{chainData.highestPutOIStrike} PE</span>
          </div>
        </div>
      )}

      {/* Options Chain Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[440px]">
        {loading || !chainData ? (
          <div className="flex items-center justify-center py-16 text-xs text-cyan-400 font-mono gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Generating real-time F&amp;O matrix...
          </div>
        ) : (
          <table className="w-full text-xs font-mono text-left border-collapse">
            <thead className="bg-[#0e1626] text-slate-400 sticky top-0 z-20 border-b border-slate-700">
              <tr>
                {/* Calls Column Header */}
                <th colSpan={viewMode === 'GREEKS' ? 5 : 5} className="py-1.5 px-3 text-center bg-emerald-950/40 text-emerald-300 font-bold border-r border-slate-700 uppercase tracking-wider">
                  CALLS (CE)
                </th>

                {/* Strike */}
                <th className="py-1.5 px-3 text-center bg-slate-900 text-white font-extrabold border-r border-slate-700">
                  STRIKE
                </th>

                {/* Puts Column Header */}
                <th colSpan={viewMode === 'GREEKS' ? 5 : 5} className="py-1.5 px-3 text-center bg-rose-950/40 text-rose-300 font-bold uppercase tracking-wider">
                  PUTS (PE)
                </th>
              </tr>

              <tr className="text-[11px] bg-slate-900/90 border-b border-slate-800">
                {/* Call Sub-headers */}
                {viewMode === 'PRICE_OI' ? (
                  <>
                    <th className="py-1 px-2 text-right">OI</th>
                    <th className="py-1 px-2 text-right">Chg OI</th>
                    <th className="py-1 px-2 text-right">Volume</th>
                    <th className="py-1 px-2 text-right">IV %</th>
                    <th className="py-1 px-3 text-right text-emerald-300 border-r border-slate-700 font-bold">
                      LTP (Buy)
                    </th>
                  </>
                ) : (
                  <>
                    <th className="py-1 px-2 text-right">Delta (Δ)</th>
                    <th className="py-1 px-2 text-right">Theta (θ)</th>
                    <th className="py-1 px-2 text-right">Gamma (γ)</th>
                    <th className="py-1 px-2 text-right">IV %</th>
                    <th className="py-1 px-3 text-right text-emerald-300 border-r border-slate-700 font-bold">
                      LTP
                    </th>
                  </>
                )}

                {/* Strike Center */}
                <th className="py-1 px-3 text-center bg-slate-800 text-cyan-300 font-bold border-r border-slate-700">
                  Price
                </th>

                {/* Put Sub-headers */}
                {viewMode === 'PRICE_OI' ? (
                  <>
                    <th className="py-1 px-3 text-left text-rose-300 font-bold">LTP (Buy)</th>
                    <th className="py-1 px-2 text-left">IV %</th>
                    <th className="py-1 px-2 text-left">Volume</th>
                    <th className="py-1 px-2 text-left">Chg OI</th>
                    <th className="py-1 px-2 text-left">OI</th>
                  </>
                ) : (
                  <>
                    <th className="py-1 px-3 text-left text-rose-300 font-bold">LTP</th>
                    <th className="py-1 px-2 text-left">IV %</th>
                    <th className="py-1 px-2 text-left">Delta (Δ)</th>
                    <th className="py-1 px-2 text-left">Theta (θ)</th>
                    <th className="py-1 px-2 text-left">Gamma (γ)</th>
                  </>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/40">
              {chainData.strikes.map(strike => {
                const isATM = strike.strikePrice === chainData.atmStrike;
                const isITMCall = strike.strikePrice < underlyingLtp;
                const isITMPut = strike.strikePrice > underlyingLtp;

                return (
                  <tr
                    key={strike.strikePrice}
                    className={`transition hover:bg-slate-800/40 ${
                      isATM ? 'bg-cyan-950/30 ring-1 ring-cyan-500/40' : ''
                    }`}
                  >
                    {/* Call Columns */}
                    {viewMode === 'PRICE_OI' ? (
                      <>
                        <td className={`py-1.5 px-2 text-right ${isITMCall ? 'bg-emerald-950/20' : ''}`}>
                          {(strike.call.oi / 100000).toFixed(1)}L
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-semibold ${
                            strike.call.oiChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          } ${isITMCall ? 'bg-emerald-950/20' : ''}`}
                        >
                          {strike.call.oiChange >= 0 ? '+' : ''}
                          {(strike.call.oiChange / 1000).toFixed(0)}k
                        </td>
                        <td className={`py-1.5 px-2 text-right text-slate-400 ${isITMCall ? 'bg-emerald-950/20' : ''}`}>
                          {(strike.call.volume / 1000).toFixed(0)}k
                        </td>
                        <td className={`py-1.5 px-2 text-right text-purple-300 ${isITMCall ? 'bg-emerald-950/20' : ''}`}>
                          {strike.call.iv}%
                        </td>
                        <td className={`py-1.5 px-3 text-right border-r border-slate-700 ${isITMCall ? 'bg-emerald-950/30' : ''}`}>
                          <button
                            onClick={() =>
                              onSelectOptionTrade(
                                selectedUnderlying,
                                strike.strikePrice,
                                'CE',
                                strike.call.ltp
                              )
                            }
                            className="font-bold text-emerald-400 hover:text-white hover:bg-emerald-600/80 px-1.5 py-0.5 rounded transition"
                            title={`Buy ${selectedUnderlying} ${strike.strikePrice} CE`}
                          >
                            ₹{strike.call.ltp.toFixed(2)}
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={`py-1.5 px-2 text-right text-cyan-400 ${isITMCall ? 'bg-emerald-950/20' : ''}`}>
                          +{strike.call.delta}
                        </td>
                        <td className={`py-1.5 px-2 text-right text-rose-400 ${isITMCall ? 'bg-emerald-950/20' : ''}`}>
                          {strike.call.theta}
                        </td>
                        <td className={`py-1.5 px-2 text-right text-slate-400 ${isITMCall ? 'bg-emerald-950/20' : ''}`}>
                          {strike.call.gamma}
                        </td>
                        <td className={`py-1.5 px-2 text-right text-purple-300 ${isITMCall ? 'bg-emerald-950/20' : ''}`}>
                          {strike.call.iv}%
                        </td>
                        <td className={`py-1.5 px-3 text-right border-r border-slate-700 font-bold text-emerald-400 ${isITMCall ? 'bg-emerald-950/30' : ''}`}>
                          ₹{strike.call.ltp.toFixed(2)}
                        </td>
                      </>
                    )}

                    {/* Strike Center Badge */}
                    <td
                      className={`py-1.5 px-3 text-center font-extrabold border-r border-slate-700 ${
                        isATM
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-900 text-white'
                      }`}
                    >
                      {strike.strikePrice}
                      {isATM && <span className="text-[9px] block uppercase font-bold">ATM</span>}
                    </td>

                    {/* Put Columns */}
                    {viewMode === 'PRICE_OI' ? (
                      <>
                        <td className={`py-1.5 px-3 text-left ${isITMPut ? 'bg-rose-950/30' : ''}`}>
                          <button
                            onClick={() =>
                              onSelectOptionTrade(
                                selectedUnderlying,
                                strike.strikePrice,
                                'PE',
                                strike.put.ltp
                              )
                            }
                            className="font-bold text-rose-400 hover:text-white hover:bg-rose-600/80 px-1.5 py-0.5 rounded transition"
                            title={`Buy ${selectedUnderlying} ${strike.strikePrice} PE`}
                          >
                            ₹{strike.put.ltp.toFixed(2)}
                          </button>
                        </td>
                        <td className={`py-1.5 px-2 text-left text-purple-300 ${isITMPut ? 'bg-rose-950/20' : ''}`}>
                          {strike.put.iv}%
                        </td>
                        <td className={`py-1.5 px-2 text-left text-slate-400 ${isITMPut ? 'bg-rose-950/20' : ''}`}>
                          {(strike.put.volume / 1000).toFixed(0)}k
                        </td>
                        <td
                          className={`py-1.5 px-2 text-left font-semibold ${
                            strike.put.oiChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          } ${isITMPut ? 'bg-rose-950/20' : ''}`}
                        >
                          {strike.put.oiChange >= 0 ? '+' : ''}
                          {(strike.put.oiChange / 1000).toFixed(0)}k
                        </td>
                        <td className={`py-1.5 px-2 text-left ${isITMPut ? 'bg-rose-950/20' : ''}`}>
                          {(strike.put.oi / 100000).toFixed(1)}L
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={`py-1.5 px-3 text-left font-bold text-rose-400 ${isITMPut ? 'bg-rose-950/30' : ''}`}>
                          ₹{strike.put.ltp.toFixed(2)}
                        </td>
                        <td className={`py-1.5 px-2 text-left text-purple-300 ${isITMPut ? 'bg-rose-950/20' : ''}`}>
                          {strike.put.iv}%
                        </td>
                        <td className={`py-1.5 px-2 text-left text-cyan-400 ${isITMPut ? 'bg-rose-950/20' : ''}`}>
                          {strike.put.delta}
                        </td>
                        <td className={`py-1.5 px-2 text-left text-rose-400 ${isITMPut ? 'bg-rose-950/20' : ''}`}>
                          {strike.put.theta}
                        </td>
                        <td className={`py-1.5 px-2 text-left text-slate-400 ${isITMPut ? 'bg-rose-950/20' : ''}`}>
                          {strike.put.gamma}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Compliance Note at bottom */}
      <div className="p-2 bg-[#080c16] border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1 text-amber-300/80">
          <Info className="h-3 w-3 text-amber-400" />
          Click any Call or Put LTP to configure trade execution.
        </span>
        <span className="font-mono text-slate-500">
          SEBI Rule: F&amp;O trades require sufficient margin collateral. Zero returns guaranteed.
        </span>
      </div>
    </div>
  );
};
