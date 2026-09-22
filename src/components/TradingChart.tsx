import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  SlidersHorizontal,
  Maximize2,
  TrendingUp,
  BarChart2,
  Layers,
  Sparkles,
  RefreshCw,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { fetchCandleHistory } from '../services/api';
import { HistoricalCandle } from '../types/market';

interface TradingChartProps {
  onQuickOrder: (symbol: string, side: 'BUY' | 'SELL') => void;
  onOpenAlertModal: (symbol: string, price: number) => void;
}

export const TradingChart: React.FC<TradingChartProps> = ({ onQuickOrder, onOpenAlertModal }) => {
  const { activeTicker, activeSymbol } = useTrading();
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | '1Y'>('1D');
  const [chartType, setChartType] = useState<'CANDLE' | 'LINE'>('CANDLE');
  const [candles, setCandles] = useState<HistoricalCandle[]>([]);
  const [loading, setLoading] = useState(false);

  // Technical Indicator toggles
  const [showEMA, setShowEMA] = useState(true);
  const [showBB, setShowBB] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showMACD, setShowMACD] = useState(false);

  // Hover Crosshair
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Fetch candle data when activeSymbol or timeframe changes
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchCandleHistory(activeSymbol, timeframe)
      .then(data => {
        if (isMounted) {
          setCandles(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.warn('Error fetching chart data:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeSymbol, timeframe]);

  // Keep latest candle updated with activeTicker LTP & roll new candle periodically
  useEffect(() => {
    if (candles.length === 0) return;
    setCandles(prev => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      const updatedClose = activeTicker.ltp;
      const updatedHigh = Math.max(last.high, updatedClose);
      const updatedLow = Math.min(last.low, updatedClose);
      return [
        ...prev.slice(0, prev.length - 1),
        {
          ...last,
          close: updatedClose,
          high: updatedHigh,
          low: updatedLow,
          volume: last.volume + Math.round(Math.random() * 80),
        }
      ];
    });
  }, [activeTicker.ltp]);

  // Roll a new minute candle every 60s for 1D timeframe
  useEffect(() => {
    if (timeframe !== '1D') return;

    const candleInterval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const newCandle: HistoricalCandle = {
          time: timeStr,
          timestamp: Date.now(),
          open: activeTicker.ltp,
          high: activeTicker.ltp,
          low: activeTicker.ltp,
          close: activeTicker.ltp,
          volume: 1500,
          ema20: activeTicker.ltp,
          ema50: activeTicker.ltp,
          rsi: last.rsi || 52,
          histogram: 0,
        };
        // Keep max 70 candles in view for smooth rendering
        const sliced = prev.length > 70 ? prev.slice(1) : prev;
        return [...sliced, newCandle];
      });
    }, 60000);

    return () => clearInterval(candleInterval);
  }, [timeframe, activeTicker.ltp]);

  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : candles[candles.length - 1];

  // Price Extents
  const { minPrice, maxPrice, maxVol } = useMemo(() => {
    if (candles.length === 0) return { minPrice: 100, maxPrice: 200, maxVol: 1000 };
    let min = Infinity;
    let max = -Infinity;
    let mv = 0;

    candles.forEach(c => {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (showBB && c.upperBB && c.upperBB > max) max = c.upperBB;
      if (showBB && c.lowerBB && c.lowerBB < min) min = c.lowerBB;
      if (c.volume > mv) mv = c.volume;
    });

    const padding = (max - min) * 0.05 || 10;
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      maxVol: mv || 1,
    };
  }, [candles, showBB]);

  // Chart coordinate mapping
  const chartWidth = 900;
  const mainHeight = 320;
  const rsiHeight = showRSI ? 80 : 0;
  const macdHeight = showMACD ? 80 : 0;
  const totalSvgHeight = mainHeight + rsiHeight + macdHeight;

  const candleSpacing = chartWidth / (candles.length || 1);
  const candleWidth = Math.max(2, candleSpacing * 0.65);

  const getY = (price: number) => {
    if (maxPrice === minPrice) return mainHeight / 2;
    return mainHeight - ((price - minPrice) / (maxPrice - minPrice)) * (mainHeight - 30) - 15;
  };

  const isPositiveOverall = activeTicker.change >= 0;

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col overflow-hidden">
      {/* Chart Top Header Controls */}
      <div className="p-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        {/* Symbol & Price HUD */}
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-extrabold text-base text-white">
                {activeTicker.symbol}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {activeTicker.exchange}
              </span>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                {activeTicker.name}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono font-extrabold text-lg text-white">
                {activeTicker.currency === 'USD' ? '$' : '₹'}
                {activeTicker.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span
                className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                  isPositiveOverall
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                    : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                }`}
              >
                {isPositiveOverall ? '+' : ''}
                {activeTicker.change.toFixed(2)} ({isPositiveOverall ? '+' : ''}
                {activeTicker.changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        {/* OHLCV live crosshair stats & Streaming indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800/40 text-[11px] font-mono text-emerald-400 font-bold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>LIVE TICKS (800ms)</span>
          </div>

          {activeCandle && (
            <div className="hidden lg:flex items-center gap-4 text-xs font-mono bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500">O: </span>
                <span className="text-slate-200 font-semibold">{activeCandle.open.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">H: </span>
                <span className="text-emerald-400 font-semibold">{activeCandle.high.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">L: </span>
                <span className="text-rose-400 font-semibold">{activeCandle.low.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">C: </span>
                <span className="text-white font-semibold">{activeCandle.close.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">Vol: </span>
                <span className="text-cyan-400 font-semibold">
                  {(activeCandle.volume / 1000).toFixed(1)}k
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Chart Actions & Timeframes */}
        <div className="flex items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800 text-xs font-mono font-semibold">
            {(['1D', '1W', '1M', '1Y'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded transition ${
                  timeframe === tf ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Type Toggle */}
          <div className="flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setChartType('CANDLE')}
              className={`px-2 py-1 rounded transition ${
                chartType === 'CANDLE' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
              title="Candlestick Chart"
            >
              Candles
            </button>
            <button
              onClick={() => setChartType('LINE')}
              className={`px-2 py-1 rounded transition ${
                chartType === 'LINE' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-white'
              }`}
              title="Line Chart"
            >
              Line
            </button>
          </div>

          {/* Quick Buy / Sell */}
          <div className="flex items-center gap-1.5 pl-1">
            <button
              onClick={() => onQuickOrder(activeTicker.symbol, 'BUY')}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono tracking-wider transition shadow-sm"
            >
              BUY
            </button>
            <button
              onClick={() => onQuickOrder(activeTicker.symbol, 'SELL')}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold font-mono tracking-wider transition shadow-sm"
            >
              SELL
            </button>
          </div>
        </div>
      </div>

      {/* Indicator Controls Bar */}
      <div className="px-3 py-1.5 bg-[#090d17] border-b border-slate-800/60 flex items-center justify-between text-xs font-mono overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-slate-500 flex items-center gap-1">
            <SlidersHorizontal className="h-3 w-3" />
            Indicators:
          </span>

          <button
            onClick={() => setShowEMA(!showEMA)}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
              showEMA
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            EMA (20 / 50)
          </button>

          <button
            onClick={() => setShowBB(!showBB)}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
              showBB
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Bollinger Bands (20,2)
          </button>

          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
              showVolume
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Volume
          </button>

          <button
            onClick={() => setShowRSI(!showRSI)}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
              showRSI
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            RSI (14)
          </button>

          <button
            onClick={() => setShowMACD(!showMACD)}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition ${
              showMACD
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            MACD (12,26,9)
          </button>
        </div>

        <button
          onClick={() => onOpenAlertModal(activeTicker.symbol, activeTicker.ltp)}
          className="text-amber-400 hover:text-amber-300 text-[11px] font-semibold flex items-center gap-1"
        >
          + Set Alert at ₹{activeTicker.ltp.toFixed(2)}
        </button>
      </div>

      {/* SVG Canvas Chart Area */}
      <div className="relative flex-1 p-2 bg-[#090d16] select-none">
        {loading && (
          <div className="absolute inset-0 bg-[#090d16]/70 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading real-time tick history...
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${chartWidth} ${totalSvgHeight}`}
          className="w-full h-auto max-h-[460px] overflow-visible"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="bullishGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="bearishGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map(ratio => {
            const y = mainHeight * ratio;
            const priceVal = maxPrice - ratio * (maxPrice - minPrice);
            return (
              <g key={ratio}>
                <line
                  x1={0}
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={chartWidth - 5}
                  y={y - 4}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="JetBrains Mono"
                  textAnchor="end"
                >
                  ₹{priceVal.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Bollinger Bands Fill */}
          {showBB && candles.length > 1 && (
            <polygon
              points={`
                ${candles.map((c, i) => `${i * candleSpacing + candleSpacing / 2},${getY(c.upperBB || c.high)}`).join(' ')}
                ${candles
                  .slice()
                  .reverse()
                  .map((c, i) => {
                    const originalIdx = candles.length - 1 - i;
                    return `${originalIdx * candleSpacing + candleSpacing / 2},${getY(c.lowerBB || c.low)}`;
                  })
                  .join(' ')}
              `}
              fill="#6366f1"
              fillOpacity="0.08"
            />
          )}

          {/* Bollinger Bands Lines */}
          {showBB && (
            <>
              <polyline
                points={candles
                  .map((c, i) => `${i * candleSpacing + candleSpacing / 2},${getY(c.upperBB || c.high)}`)
                  .join(' ')}
                fill="none"
                stroke="#818cf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <polyline
                points={candles
                  .map((c, i) => `${i * candleSpacing + candleSpacing / 2},${getY(c.lowerBB || c.low)}`)
                  .join(' ')}
                fill="none"
                stroke="#818cf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            </>
          )}

          {/* Volume Bars */}
          {showVolume &&
            candles.map((c, i) => {
              const vHeight = (c.volume / maxVol) * 55;
              const x = i * candleSpacing + (candleSpacing - candleWidth) / 2;
              const y = mainHeight - vHeight;
              const isUp = c.close >= c.open;
              return (
                <rect
                  key={`vol-${i}`}
                  x={x}
                  y={y}
                  width={candleWidth}
                  height={vHeight}
                  fill={isUp ? '#10b981' : '#f43f5e'}
                  opacity={0.25}
                />
              );
            })}

          {/* Candles or Line rendering */}
          {chartType === 'CANDLE' ? (
            candles.map((c, i) => {
              const isUp = c.close >= c.open;
              const color = isUp ? '#10b981' : '#f43f5e';
              const xCenter = i * candleSpacing + candleSpacing / 2;
              const xLeft = i * candleSpacing + (candleSpacing - candleWidth) / 2;
              const yHigh = getY(c.high);
              const yLow = getY(c.low);
              const yOpen = getY(c.open);
              const yClose = getY(c.close);
              const bodyY = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

              return (
                <g key={`candle-${i}`}>
                  {/* Wick */}
                  <line
                    x1={xCenter}
                    y1={yHigh}
                    x2={xCenter}
                    y2={yLow}
                    stroke={color}
                    strokeWidth="1.5"
                  />
                  {/* Body */}
                  <rect
                    x={xLeft}
                    y={bodyY}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="1"
                  />
                </g>
              );
            })
          ) : (
            <>
              {/* Line Area */}
              <polygon
                points={`
                  0,${mainHeight}
                  ${candles.map((c, i) => `${i * candleSpacing + candleSpacing / 2},${getY(c.close)}`).join(' ')}
                  ${chartWidth},${mainHeight}
                `}
                fill={isPositiveOverall ? 'url(#bullishGradient)' : 'url(#bearishGradient)'}
              />
              <polyline
                points={candles
                  .map((c, i) => `${i * candleSpacing + candleSpacing / 2},${getY(c.close)}`)
                  .join(' ')}
                fill="none"
                stroke={isPositiveOverall ? '#10b981' : '#f43f5e'}
                strokeWidth="2.2"
              />
            </>
          )}

          {/* EMA Lines */}
          {showEMA && (
            <>
              {/* EMA 20 (Cyan) */}
              <polyline
                points={candles
                  .map((c, i) => `${i * candleSpacing + candleSpacing / 2},${getY(c.ema20 || c.close)}`)
                  .join(' ')}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.6"
              />
              {/* EMA 50 (Amber) */}
              <polyline
                points={candles
                  .map((c, i) => `${i * candleSpacing + candleSpacing / 2},${getY(c.ema50 || c.close)}`)
                  .join(' ')}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.6"
              />
            </>
          )}

          {/* RSI Sub-Chart */}
          {showRSI && (
            <g transform={`translate(0, ${mainHeight})`}>
              <line x1={0} y1={0} x2={chartWidth} y2={0} stroke="#334155" strokeWidth="1" />
              <rect x={0} y={0} width={chartWidth} height={rsiHeight} fill="#060a12" opacity="0.6" />

              {/* 70 / 30 reference lines */}
              <line
                x1={0}
                y1={rsiHeight * 0.3}
                x2={chartWidth}
                y2={rsiHeight * 0.3}
                stroke="#f43f5e"
                strokeDasharray="2 2"
                strokeWidth="0.8"
                opacity="0.6"
              />
              <line
                x1={0}
                y1={rsiHeight * 0.7}
                x2={chartWidth}
                y2={rsiHeight * 0.7}
                stroke="#10b981"
                strokeDasharray="2 2"
                strokeWidth="0.8"
                opacity="0.6"
              />

              <text x={8} y={14} fill="#a855f7" fontSize="10" fontFamily="JetBrains Mono" fontWeight="bold">
                RSI (14): {activeCandle?.rsi?.toFixed(1) || '52.0'}
              </text>
              <text x={chartWidth - 5} y={rsiHeight * 0.3 - 2} fill="#f43f5e" fontSize="9" textAnchor="end">
                OB 70
              </text>
              <text x={chartWidth - 5} y={rsiHeight * 0.7 - 2} fill="#10b981" fontSize="9" textAnchor="end">
                OS 30
              </text>

              {/* RSI Curve */}
              <polyline
                points={candles
                  .map((c, i) => {
                    const rsiVal = c.rsi || 50;
                    const y = rsiHeight - (rsiVal / 100) * rsiHeight;
                    return `${i * candleSpacing + candleSpacing / 2},${y}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#c084fc"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* MACD Sub-Chart */}
          {showMACD && (
            <g transform={`translate(0, ${mainHeight + rsiHeight})`}>
              <line x1={0} y1={0} x2={chartWidth} y2={0} stroke="#334155" strokeWidth="1" />
              <rect x={0} y={0} width={chartWidth} height={macdHeight} fill="#060a12" opacity="0.6" />
              <text x={8} y={14} fill="#38bdf8" fontSize="10" fontFamily="JetBrains Mono" fontWeight="bold">
                MACD (12, 26, 9)
              </text>

              {/* Histogram bars */}
              {candles.map((c, i) => {
                const hist = c.histogram || 0;
                const hHeight = Math.min(30, Math.abs(hist) * 2.5);
                const isHistUp = hist >= 0;
                const y = isHistUp ? macdHeight / 2 - hHeight : macdHeight / 2;
                return (
                  <rect
                    key={`hist-${i}`}
                    x={i * candleSpacing + (candleSpacing - candleWidth) / 2}
                    y={y}
                    width={candleWidth}
                    height={Math.max(1, hHeight)}
                    fill={isHistUp ? '#10b981' : '#f43f5e'}
                    opacity={0.7}
                  />
                );
              })}
            </g>
          )}

          {/* Live Real-time LTP Horizontal Beacon Line */}
          {activeTicker && (
            <g pointerEvents="none">
              {/* Pulsing horizontal line across chart */}
              <line
                x1={0}
                y1={getY(activeTicker.ltp)}
                x2={chartWidth}
                y2={getY(activeTicker.ltp)}
                stroke={isPositiveOverall ? '#10b981' : '#f43f5e'}
                strokeDasharray="4 3"
                strokeWidth="1.5"
                opacity="0.85"
              />

              {/* Pulsing beacon radar dot at current price edge */}
              <circle
                cx={chartWidth - 75}
                cy={getY(activeTicker.ltp)}
                r="4.5"
                fill={isPositiveOverall ? '#10b981' : '#f43f5e'}
                className="animate-pulse"
              />
              <circle
                cx={chartWidth - 75}
                cy={getY(activeTicker.ltp)}
                r="8"
                fill="none"
                stroke={isPositiveOverall ? '#10b981' : '#f43f5e'}
                strokeWidth="1.2"
                opacity="0.5"
              />

              {/* Glowing live price badge on Y-axis */}
              <rect
                x={chartWidth - 70}
                y={getY(activeTicker.ltp) - 10}
                width={70}
                height={20}
                fill={isPositiveOverall ? '#064e3b' : '#881337'}
                stroke={isPositiveOverall ? '#10b981' : '#f43f5e'}
                strokeWidth="1.2"
                rx="3"
              />
              <text
                x={chartWidth - 35}
                y={getY(activeTicker.ltp) + 4}
                fill="#ffffff"
                fontSize="10"
                fontFamily="JetBrains Mono"
                fontWeight="900"
                textAnchor="middle"
              >
                ₹{activeTicker.ltp.toFixed(2)}
              </text>
            </g>
          )}

          {/* Mouse Hover Crosshair Overlay */}
          {candles.map((c, i) => (
            <rect
              key={`overlay-${i}`}
              x={i * candleSpacing}
              y={0}
              width={candleSpacing}
              height={totalSvgHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {hoverIndex !== null && candles[hoverIndex] && (
            <g pointerEvents="none">
              {/* Vertical line */}
              <line
                x1={hoverIndex * candleSpacing + candleSpacing / 2}
                y1={0}
                x2={hoverIndex * candleSpacing + candleSpacing / 2}
                y2={totalSvgHeight}
                stroke="#38bdf8"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {/* Horizontal line */}
              <line
                x1={0}
                y1={getY(candles[hoverIndex].close)}
                x2={chartWidth}
                y2={getY(candles[hoverIndex].close)}
                stroke="#38bdf8"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {/* Price badge on axis */}
              <rect
                x={chartWidth - 65}
                y={getY(candles[hoverIndex].close) - 10}
                width={65}
                height={20}
                fill="#0284c7"
                rx="3"
              />
              <text
                x={chartWidth - 32}
                y={getY(candles[hoverIndex].close) + 4}
                fill="#ffffff"
                fontSize="10"
                fontFamily="JetBrains Mono"
                fontWeight="bold"
                textAnchor="middle"
              >
                ₹{candles[hoverIndex].close.toFixed(2)}
              </text>
              {/* Time badge at bottom */}
              <rect
                x={Math.max(5, Math.min(chartWidth - 65, hoverIndex * candleSpacing - 30))}
                y={mainHeight - 18}
                width={60}
                height={16}
                fill="#1e293b"
                rx="3"
              />
              <text
                x={Math.max(35, Math.min(chartWidth - 35, hoverIndex * candleSpacing))}
                y={mainHeight - 6}
                fill="#cbd5e1"
                fontSize="9"
                fontFamily="JetBrains Mono"
                textAnchor="middle"
              >
                {candles[hoverIndex].time}
              </text>
            </g>
          )}
        </svg>

        {/* Legend pills at bottom */}
        <div className="flex items-center gap-4 text-[10px] font-mono mt-1 text-slate-400 px-1">
          {showEMA && (
            <>
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="h-2 w-2 rounded-full bg-cyan-400 inline-block" /> EMA 20
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> EMA 50
              </span>
            </>
          )}
          {showBB && (
            <span className="flex items-center gap-1 text-indigo-400">
              <span className="h-2 w-2 rounded-full bg-indigo-400 inline-block" /> Bollinger Bands (20,2)
            </span>
          )}
          <span className="text-slate-500 ml-auto">Data source: Angel One SmartAPI Feed</span>
        </div>
      </div>
    </div>
  );
};
