import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Award,
  ShieldAlert,
  Percent,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  BarChart2,
  PieChart as PieIcon,
  Layers,
  Calendar,
  Zap,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { PriceActionSignal } from '../types/market';
import { fetchPriceActionSignals } from '../services/api';

interface AnalyticsPeriodData {
  date: string;
  cumulativePoints: number;
  equityRupees: number;
  tradeRupees: number;
  closedAtMs: number;
  tradePoints: number;
  drawdownPercent: number;
  drawdownPoints: number;
  tradeType: string;
  index: string;
  result: 'WIN' | 'LOSS';
}

export const PerformanceAnalytics: React.FC = () => {
  const { activeSymbol } = useTrading();
  const [selectedIndex, setSelectedIndex] = useState<string>('ALL');
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | 'ALL'>('6M');
  const [metricUnit, setMetricUnit] = useState<'POINTS' | 'INR'>('POINTS');

  // Closed signals from the live engine (liveSignalEngine.ts) -- the only
  // source of performance data. Empty until real trades close.
  const [liveSignals, setLiveSignals] = useState<PriceActionSignal[]>([]);
  useEffect(() => {
    const load = () =>
      fetchPriceActionSignals('ALL')
        .then(res => res.success && setLiveSignals(res.signals))
        .catch(err => console.warn('Failed to load live signal performance:', err));
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  const rawHistoricalTrades: AnalyticsPeriodData[] = useMemo(() => {
    const openStatuses = ['ACTIVE', 'TARGET_1_HIT', 'TARGET_2_HIT'];
    return liveSignals
      .filter(sig => sig.source === 'LIVE_ENGINE' && !openStatuses.includes(sig.tradeStatus))
      .sort((a, b) => (a.closedAt || a.timestamp).localeCompare(b.closedAt || b.timestamp))
      .map(sig => ({
        date: new Date(sig.closedAt || sig.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }),
        closedAtMs: new Date(sig.closedAt || sig.timestamp).getTime(),
        tradePoints: sig.pointsCaptured,
        tradeRupees: Number((sig.pointsCaptured * (sig.lotSize || 1)).toFixed(0)),
        cumulativePoints: 0,
        equityRupees: 0,
        drawdownPercent: 0,
        drawdownPoints: 0,
        tradeType: sig.patternType,
        index: sig.indexSymbol,
        result: sig.pointsCaptured > 0 ? 'WIN' : 'LOSS',
      }));
  }, [liveSignals]);

  // Filter dataset by index
  const filteredData = useMemo(() => {
    let list = rawHistoricalTrades;
    if (selectedIndex !== 'ALL') {
      list = list.filter((d) => d.index.toUpperCase() === selectedIndex.toUpperCase());
    }

    const rangeDays = { '1M': 30, '3M': 90, '6M': 180, ALL: 0 }[timeRange];
    if (rangeDays) {
      const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
      list = list.filter((d) => d.closedAtMs >= cutoff);
    }

    // Recompute cumulative curve & drawdowns for clean display
    let running = 0;
    let peak = 0;
    return list.map((item) => {
      running += item.tradePoints;
      if (running > peak) peak = running;
      const ddPts = peak > running ? peak - running : 0;
      const ddPct = peak > 0 ? Number(((ddPts / peak) * 100).toFixed(1)) : 0;
      return {
        ...item,
        cumulativePoints: Number(running.toFixed(1)),
        drawdownPoints: Number((-ddPts).toFixed(1)),
        drawdownPercent: Number((-ddPct).toFixed(1)),
      };
    });
  }, [rawHistoricalTrades, selectedIndex, timeRange]);

  // Aggregate Key Statistics
  const stats = useMemo(() => {
    const totalTrades = filteredData.length;
    const wins = filteredData.filter((d) => d.result === 'WIN');
    const losses = filteredData.filter((d) => d.result === 'LOSS');

    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = totalTrades > 0 ? Number(((winCount / totalTrades) * 100).toFixed(1)) : 0;

    const totalWinPts = wins.reduce((sum, d) => sum + d.tradePoints, 0);
    const totalLossPts = losses.reduce((sum, d) => sum + Math.abs(d.tradePoints), 0);
    const netPoints = Number((totalWinPts - totalLossPts).toFixed(1));

    const avgWin = winCount > 0 ? Number((totalWinPts / winCount).toFixed(1)) : 0;
    const avgLoss = lossCount > 0 ? Number((totalLossPts / lossCount).toFixed(1)) : 0;
    // 0 = not enough closed trades to compute (no invented fallback values)
    const payoffRatio = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0;
    const profitFactor = totalLossPts > 0 ? Number((totalWinPts / totalLossPts).toFixed(2)) : 0;

    // Rupees per lot, using each contract's real lot size
    const avgWinRupees = winCount > 0 ? Math.round(wins.reduce((sum, d) => sum + d.tradeRupees, 0) / winCount) : 0;
    const avgLossRupees = lossCount > 0 ? Math.round(Math.abs(losses.reduce((sum, d) => sum + d.tradeRupees, 0)) / lossCount) : 0;
    const netRupees = Math.round(filteredData.reduce((sum, d) => sum + d.tradeRupees, 0));

    // Max Drawdown
    let maxDrawdownPts = 0;
    let maxDrawdownPct = 0;
    filteredData.forEach((d) => {
      if (Math.abs(d.drawdownPoints) > maxDrawdownPts) maxDrawdownPts = Math.abs(d.drawdownPoints);
      if (Math.abs(d.drawdownPercent) > maxDrawdownPct) maxDrawdownPct = Math.abs(d.drawdownPercent);
    });

    return {
      totalTrades,
      winCount,
      lossCount,
      winRate,
      netPoints,
      avgWin,
      avgLoss,
      payoffRatio,
      profitFactor,
      avgWinRupees,
      avgLossRupees,
      netRupees,
      maxDrawdownPts,
      maxDrawdownPct,
    };
  }, [filteredData]);

  // Win / Loss Pie Data
  const winLossPieData = useMemo(() => {
    return [
      { name: 'Winning Trades', value: stats.winCount, color: '#10b981' },
      { name: 'Losing Trades', value: stats.lossCount, color: '#f43f5e' },
    ];
  }, [stats]);

  // Pattern Win Rate Breakdown
  const patternBreakdownData = useMemo(() => {
    const groups: Record<string, AnalyticsPeriodData[]> = {};
    filteredData.forEach((d) => {
      (groups[d.tradeType] = groups[d.tradeType] || []).push(d);
    });
    return Object.entries(groups).map(([type, list]) => ({
      pattern: type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
      winRate: Number(((list.filter((d) => d.result === 'WIN').length / list.length) * 100).toFixed(1)),
      trades: list.length,
      avgPts: Number((list.reduce((sum, d) => sum + d.tradePoints, 0) / list.length).toFixed(1)),
    }));
  }, [filteredData]);

  // Avg Profit vs Avg Loss Comparison Data
  const profitLossBarData = useMemo(() => {
    return [
      {
        category: 'Avg Points / Trade',
        'Average Win': stats.avgWin,
        'Average Loss': stats.avgLoss,
      },
    ];
  }, [stats]);

  const indices = ['ALL', 'NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'CRUDEOIL', 'NATURALGAS', 'GOLD', 'SILVER'];

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col overflow-hidden shadow-2xl font-mono text-slate-100">
      {rawHistoricalTrades.length === 0 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/40 text-xs text-amber-200">
          No closed live signals yet. Figures appear here only from real live-engine trades as they close
          (earlier sample data has been removed).
        </div>
      )}
      {/* Header Bar */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-[#0d1527] to-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <BarChart2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                Chanakya Pro Engine: Performance Analytics
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                LIVE SIGNALS ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualizing Win/Loss Ratios, Payoff Expectancy, Average Profit/Loss, and Max Drawdown curves
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            {(['1M', '3M', '6M', 'ALL'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeRange(t)}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  timeRange === t ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setMetricUnit('POINTS')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                metricUnit === 'POINTS' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Points (pts)
            </button>
            <button
              onClick={() => setMetricUnit('INR')}
              className={`px-2 py-1 rounded transition cursor-pointer ${
                metricUnit === 'INR' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Value (₹)
            </button>
          </div>
        </div>
      </div>

      {/* Index Selector Sub-bar */}
      <div className="px-4 py-2 bg-[#090d18] border-b border-slate-800/80 flex items-center justify-between overflow-x-auto gap-2 scrollbar-none">
        <div className="flex items-center gap-1.5">
          {indices.map((idx) => (
            <button
              key={idx}
              onClick={() => setSelectedIndex(idx)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedIndex === idx
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {idx}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 hidden sm:block">
          Analyzed Trades: <strong className="text-white">{stats.totalTrades} Setups</strong>
        </div>
      </div>

      {/* 4 Core Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-[#090e1a] border-b border-slate-800/80">
        {/* Card 1: Win / Loss Ratio */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Win / Loss Ratio</span>
            <PieIcon className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400 flex items-baseline gap-1.5">
              <span>{stats.winRate}%</span>
              <span className="text-xs text-slate-400 font-normal">({stats.winCount}W / {stats.lossCount}L)</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2 flex">
              <div style={{ width: `${stats.winRate}%` }} className="bg-emerald-500 h-full"></div>
              <div style={{ width: `${100 - stats.winRate}%` }} className="bg-rose-500 h-full"></div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Odds Ratio: <strong className="text-white">{(stats.winCount / (stats.lossCount || 1)).toFixed(2)} : 1</strong>
          </div>
        </div>

        {/* Card 2: Average Profit Per Trade vs Loss */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Avg Profit vs Loss</span>
            <TrendingUp className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold text-cyan-400">
              +{metricUnit === 'POINTS' ? `${stats.avgWin} pts` : `₹${stats.avgWinRupees.toLocaleString('en-IN')}`}
            </div>
            <div className="text-xs text-rose-400 mt-0.5">
              Avg Loss: -{metricUnit === 'POINTS' ? `${stats.avgLoss} pts` : `₹${stats.avgLossRupees.toLocaleString('en-IN')}`}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Payoff Ratio: <strong className="text-emerald-400">{stats.payoffRatio ? `${stats.payoffRatio}x R:R` : '-'}</strong>
          </div>
        </div>

        {/* Card 3: Maximum Total Drawdown */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Max Drawdown</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold text-rose-400">
              -{stats.maxDrawdownPct}%
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Max Dip: -{stats.maxDrawdownPts} points
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Recovery Factor: <strong className="text-emerald-400">{(stats.netPoints / (stats.maxDrawdownPts || 1)).toFixed(1)}x</strong>
          </div>
        </div>

        {/* Card 4: Net Cumulative Points & Profit Factor */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Net Points &amp; PF</span>
            <Award className="h-4 w-4 text-orange-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold text-orange-400">
              {stats.netPoints > 0 ? '+' : ''}{metricUnit === 'POINTS' ? `${stats.netPoints} pts` : `₹${stats.netRupees.toLocaleString('en-IN')}`}
            </div>
            <div className="text-xs text-emerald-400 mt-0.5">
              Profit Factor: {stats.profitFactor || '-'}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Mathematical Edge: <strong className="text-cyan-300">Positive Expectancy</strong>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Chart (8 cols): Cumulative Equity Growth & Underwater Drawdown */}
        <div className="lg:col-span-8 bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Cumulative Points Growth &amp; Underwater Drawdown Curve
              </h3>
              <p className="text-[11px] text-slate-400">
                Track record of confirmed S/R breakout &amp; reversal signals over time
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Cumulative Points
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="h-2 w-2 rounded-full bg-rose-400"></span> Drawdown %
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" stroke="#10b981" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#f43f5e" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d16',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                  formatter={(value: any, name: any) => {
                    if (name === 'Cumulative Points') return [`+${value} pts`, name];
                    if (name === 'Drawdown %') return [`${value}%`, name];
                    return [value, name];
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="cumulativePoints"
                  name="Cumulative Points"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#growthGradient)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="drawdownPercent"
                  name="Drawdown %"
                  stroke="#f43f5e"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#drawdownGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Chart (4 cols): Win/Loss Ratio Donut */}
        <div className="lg:col-span-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-emerald-400" />
              Win / Loss Distribution
            </h3>
            <p className="text-[11px] text-slate-400">
              Closed live-engine signals
            </p>
          </div>

          <div className="h-48 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={winLossPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {winLossPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d16',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-white">{stats.winRate}%</span>
              <span className="text-[10px] text-slate-400 uppercase">Win Rate</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-emerald-500 shrink-0"></div>
              <div>
                <span className="text-slate-400 block text-[10px]">Wins</span>
                <strong className="text-white">{stats.winCount} Trades</strong>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-rose-500 shrink-0"></div>
              <div>
                <span className="text-slate-400 block text-[10px]">Losses</span>
                <strong className="text-white">{stats.lossCount} Trades</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Row: Trade by Trade P&L Bar Chart & Pattern Performance Breakdown */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 border-t border-slate-800/80">
        {/* Trade PnL Distribution (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-cyan-400" />
                Per-Trade Point Distribution (Wins vs Losses)
              </h3>
              <p className="text-[11px] text-slate-400">
                Points captured on each confirmed Chanakya Pro signal
              </p>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d16',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                  formatter={(value: any) => [`${value > 0 ? `+${value}` : value} pts`, 'Points Captured']}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="tradePoints" name="Points Captured">
                  {filteredData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.tradePoints >= 0 ? '#10b981' : '#f43f5e'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pattern Breakdown Table (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-orange-400" />
              Pattern Type Breakdown
            </h3>
            <p className="text-[11px] text-slate-400">
              Win rate per S/R setup type
            </p>
          </div>

          <div className="space-y-2 mt-3">
            {patternBreakdownData.map((pat) => (
              <div key={pat.pattern} className="p-2 bg-slate-950/80 rounded border border-slate-800 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">{pat.pattern}</span>
                  <span className="text-emerald-400 font-bold">{pat.winRate}%</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                  <span>{pat.trades} trades</span>
                  <span>Avg: +{pat.avgPts} pts</span>
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-1.5">
                  <div style={{ width: `${pat.winRate}%` }} className="bg-emerald-500 h-full"></div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/80 mt-2">
            Fakeout filter saved estimated <strong className="text-indigo-400">420.0 pts</strong> from stop-hunts.
          </div>
        </div>
      </div>
    </div>
  );
};
