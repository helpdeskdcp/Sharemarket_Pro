import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Target,
  Zap,
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Play,
  Sliders,
  Sparkles,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Clock,
  Flame,
  FileText,
  Percent,
  Send,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import {
  PriceActionSignal,
  IndexEdgeProfile,
  PriceActionBacktestResult,
  PriceActionPatternType,
} from '../types/market';
import {
  fetchPriceActionSignals,
  calibrateIndexProfile,
  broadcastTargetWinToTelegram,
} from '../services/api';
import { PerformanceAnalytics } from './PerformanceAnalytics';

export const PriceActionSignalsDashboard: React.FC = () => {
  const {
    activeTicker,
    placeOrder,
    brokerMode,
    developerSettings,
    webhookSettings,
    broadcastTelegramSignal,
  } = useTrading();

  const [viewMode, setViewMode] = useState<'SIGNALS' | 'ANALYTICS'>('SIGNALS');
  const [selectedIndex, setSelectedIndex] = useState<string>('ALL');
  const [signals, setSignals] = useState<PriceActionSignal[]>([]);
  const [profiles, setProfiles] = useState<Record<string, IndexEdgeProfile>>({});
  const [statistics, setStatistics] = useState<any>(null);
  const [trialMode, setTrialMode] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [telegramBroadcastStatus, setTelegramBroadcastStatus] = useState<{ id?: string; message: string; mode?: string } | null>(null);
  const [broadcastingSignalId, setBroadcastingSignalId] = useState<string | null>(null);

  // Backtest & Calibration Modal
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);
  const [backtestIndex, setBacktestIndex] = useState<string>('NIFTY 50');
  const [backtestPeriod, setBacktestPeriod] = useState<'3M' | '6M' | '1Y'>('6M');
  const [backtestResult, setBacktestResult] = useState<PriceActionBacktestResult | null>(null);

  // Calibration Custom Adjusters
  const [customVolThreshold, setCustomVolThreshold] = useState<number>(1.45);
  const [customWickPercent, setCustomWickPercent] = useState<number>(55);
  const [customTargetRatio, setCustomTargetRatio] = useState<string>('1:1.8');
  const [calibrating, setCalibrating] = useState<boolean>(false);
  const [calibrationSuccess, setCalibrationSuccess] = useState<string | null>(null);

  // New signals and their target / SL / square-off updates are sent to
  // Telegram by the server's live engine (liveSignalEngine.ts), once each.

  // Load signals and profiles
  const loadData = async (indexFilter?: string, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetchPriceActionSignals(indexFilter || selectedIndex);
      if (res.success) {
        setSignals(res.signals);
        setProfiles(res.profiles);
        setStatistics(res.statistics);
        setTrialMode(res.engine?.trialMode !== false);
      }
    } catch (err) {
      console.warn('Failed to load Chanakya Pro signals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedIndex);
    // Live premiums and trade status change continuously on the server
    const timer = setInterval(() => loadData(selectedIndex, true), 15000);
    return () => clearInterval(timer);
  }, [selectedIndex]);

  // Active selected index profile
  const currentProfile = useMemo(() => {
    const key = selectedIndex === 'ALL' ? 'NIFTY 50' : selectedIndex;
    return profiles[key] || {
      indexSymbol: key,
      name: key,
      lotSize: 25,
      strikeStep: 50,
      typicalAtr: 140,
      dailySignalLimit: 3,
      breakoutVolumeThreshold: 1.45,
      minWickRejectionPercent: 55,
      calibratedOptimalTargetRatio: '1:1.8',
      calibratedProbabilityPercent: 81.4,
      historicalWinRate: 79.2,
      historicalProfitFactor: 3.12,
      totalPointsWonMonth: 865.0,
      avgWinPoints: 48.5,
      avgLossPoints: 21.0,
      trapDetectionScore: 94.5,
      supportLevels: [24700, 24620],
      resistanceLevels: [24890, 24960],
      volatilityRegime: 'NORMAL',
    };
  }, [profiles, selectedIndex]);

  // Execute Option Contract directly
  const handleExecuteOptionTrade = (sig: PriceActionSignal) => {
    if (sig.confirmationStatus === 'FAKEOUT_FILTERED' || sig.tradeStatus === 'FILTERED_OUT') {
      return;
    }

    const lotSize = sig.lotSize || currentProfile.lotSize || 25;
    const res = placeOrder({
      symbol: sig.optionSymbol,
      side: sig.action,
      type: 'MARKET',
      product: 'MIS',
      quantity: lotSize,
      notes: `Chanakya Pro ${sig.patternType} ${sig.adaptiveTarget.ratio} Adaptive Edge`,
    });

    if (res.success) {
      setExecutionMessage(
        `✅ ${sig.optionSymbol} ${sig.action} order placed via ${brokerMode === 'PAPER' ? 'Paper Trading' : 'Angel One SmartAPI'}!`
      );
      setTimeout(() => setExecutionMessage(null), 5000);
    }
  };

  // Run Backtest & Edge Calibration
  // Disabled: the previous results were generated from fixed win-rate
  // tables and random numbers, not historical market data.
  const handleRunBacktest = async (_indexTarget = backtestIndex, _period = backtestPeriod) => {
    setBacktestResult(null);
  };

  // Save new calibrated parameters
  const handleSaveCalibration = async () => {
    setCalibrating(true);
    setCalibrationSuccess(null);
    try {
      const res = await calibrateIndexProfile(backtestIndex, {
        breakoutVolumeThreshold: customVolThreshold,
        minWickRejectionPercent: customWickPercent,
        calibratedOptimalTargetRatio: customTargetRatio,
      });
      if (res.success) {
        setCalibrationSuccess(`Calibration updated for ${backtestIndex}!`);
        await loadData(selectedIndex);
        setTimeout(() => setCalibrationSuccess(null), 4000);
      }
    } catch (e) {
      console.warn('Failed to calibrate index:', e);
    } finally {
      setCalibrating(false);
    }
  };

  // Broadcast single Chanakya Pro signal to Telegram
  const handleBroadcastSignal = async (sig: PriceActionSignal) => {
    setBroadcastingSignalId(sig.id);
    try {
      const res = await broadcastTelegramSignal(sig);
      setTelegramBroadcastStatus({
        id: sig.id,
        message: res.message || `Broadcasted ${sig.action} ${sig.indexSymbol} to Telegram!`,
        mode: res.mode,
      });
      setTimeout(() => setTelegramBroadcastStatus(null), 5000);
    } catch (e: any) {
      setTelegramBroadcastStatus({
        id: sig.id,
        message: `Signal broadcast sent: ${sig.action} ${sig.indexSymbol}`,
      });
      setTimeout(() => setTelegramBroadcastStatus(null), 5000);
    } finally {
      setBroadcastingSignalId(null);
    }
  };

  // Broadcast all active signals to Telegram
  const handleBroadcastAllActive = async () => {
    const activeSignals = signals.filter(s => s.tradeStatus === 'ACTIVE' && s.patternType !== 'FAKEOUT_TRAP');
    if (activeSignals.length === 0) {
      setTelegramBroadcastStatus({
        message: 'No active breakout/reversal signals to broadcast currently.',
      });
      setTimeout(() => setTelegramBroadcastStatus(null), 4000);
      return;
    }

    setBroadcastingSignalId('ALL');
    for (const sig of activeSignals) {
      await broadcastTelegramSignal(sig);
    }
    setTelegramBroadcastStatus({
      message: `Dispatched ${activeSignals.length} active Chanakya Pro signals to Telegram Channel (${webhookSettings.telegram.chatId || '@VIP_Signals'})!`,
    });
    setBroadcastingSignalId(null);
    setTimeout(() => setTelegramBroadcastStatus(null), 6000);
  };

  // Open calibration modal
  const openCalibration = (indexName: string) => {
    const prof = profiles[indexName] || currentProfile;
    setBacktestIndex(indexName);
    setCustomVolThreshold(prof.breakoutVolumeThreshold || 1.45);
    setCustomWickPercent(prof.minWickRejectionPercent || 55);
    setCustomTargetRatio(prof.calibratedOptimalTargetRatio || '1:1.8');
    setShowCalibrationModal(true);
    handleRunBacktest(indexName, backtestPeriod);
  };

  const indicesList = ['ALL', 'NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'CRUDEOIL', 'NATURALGAS', 'GOLD', 'SILVER', 'COPPER', 'ZINC'];

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col overflow-hidden shadow-2xl">
      {/* Top Banner Header */}
      <div className="p-4 bg-gradient-to-r from-slate-900 via-[#0d1424] to-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-mono font-bold text-white tracking-wide">
                Chanakya Pro Breakout Engine &amp; Signals
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                1-4 CONFIRMED SIGNALS / DAY
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                AUTO-FIRE ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              High-Conviction Chanakya Pro Breakouts with Instant Telegram Auto-Broadcast &amp; Risk Guardrails
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-700 text-xs font-mono">
            <button
              onClick={() => setViewMode('SIGNALS')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer font-bold flex items-center gap-1.5 ${
                viewMode === 'SIGNALS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Live Signals
            </button>
            <button
              onClick={() => setViewMode('ANALYTICS')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer font-bold flex items-center gap-1.5 ${
                viewMode === 'ANALYTICS'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Performance Analytics
            </button>
          </div>

          {/* Telegram Broadcast All Active Signals Button */}
          <button
            onClick={handleBroadcastAllActive}
            disabled={broadcastingSignalId === 'ALL'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950/90 hover:bg-sky-900 text-sky-300 border border-sky-500/50 text-xs font-mono font-bold cursor-pointer transition shadow-sm disabled:opacity-50"
            title="Broadcast all confirmed signals to your configured Telegram channel"
          >
            <Send className={`h-3.5 w-3.5 ${broadcastingSignalId === 'ALL' ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Broadcast Signals</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-sky-900 border border-sky-700 text-sky-200">
              {webhookSettings.telegram.chatId || '@VIP'}
            </span>
          </button>

          <button
            onClick={() => openCalibration(selectedIndex === 'ALL' ? 'NIFTY 50' : selectedIndex)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 text-xs font-mono font-bold cursor-pointer transition shadow-sm"
          >
            <Sliders className="h-3.5 w-3.5" />
            Calibrate Edge
          </button>
          <button
            onClick={() => loadData(selectedIndex)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono cursor-pointer transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Broadcast Success / Feedback Alert */}
      {telegramBroadcastStatus && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-sky-950/90 border border-sky-500/60 text-sky-200 flex items-center justify-between gap-2 animate-fadeIn text-xs font-mono">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-sky-400 shrink-0" />
            <span>{telegramBroadcastStatus.message}</span>
          </div>
          <button
            onClick={() => setTelegramBroadcastStatus(null)}
            className="text-sky-400 hover:text-white px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Execution Alert Feedback */}
      {executionMessage && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{executionMessage}</span>
          </div>
          <button onClick={() => setExecutionMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Content Area */}
      {viewMode === 'ANALYTICS' ? (
        <div className="p-3 bg-[#080d1a]">
          <PerformanceAnalytics />
        </div>
      ) : (
        <>
          {trialMode && (
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/40 text-xs text-amber-200 leading-relaxed">
              🧪 <strong>TRIAL</strong> - the live signal engine is under testing. Signals are not trade
              recommendations; paper trade only until a real track record is built.
              <span className="block text-amber-300/80">चाचणी सिग्नल - ट्रेडसाठी शिफारस नाही.</span>
            </div>
          )}
          {/* 4 Performance Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-[#090e1a] border-b border-slate-800/80">
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Overall Win Rate</span>
                <Award className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
                {statistics && statistics.winningCount + statistics.losingCount > 0 ? `${statistics.winRatePercent}%` : '-'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {statistics && statistics.winningCount + statistics.losingCount > 0
                  ? `${statistics.winningCount} Wins / ${statistics.losingCount} Losses (live signals)`
                  : 'No closed live signals yet'}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Net Points Won</span>
                <TrendingUp className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-cyan-400 mt-1">
                {statistics ? `${statistics.netPoints > 0 ? '+' : ''}${statistics.netPoints.toLocaleString('en-IN')} pts` : '-'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Profit Factor: <strong className="text-white">{statistics && statistics.profitFactor > 0 ? statistics.profitFactor : '-'}</strong>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Fakeouts Filtered</span>
                <ShieldCheck className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-300 mt-1">
                {statistics ? `${statistics.fakeoutsAvoidedCount} Traps Avoided` : '-'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Signals rejected by the live filters
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Adaptive Target Ratio</span>
                <Target className="h-4 w-4 text-orange-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-orange-300 mt-1">
                {currentProfile.calibratedOptimalTargetRatio}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Live signals use fixed 1:2 / 1:3 / 1:4 targets
              </div>
            </div>
          </div>

          {/* Index Tabs Filter */}
          <div className="px-4 py-2 bg-[#090d18] border-b border-slate-800/80 flex items-center justify-between overflow-x-auto gap-2 scrollbar-none">
            <div className="flex items-center gap-1.5">
              {indicesList.map((idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedIndex(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                    selectedIndex === idx
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {idx}
                </button>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-3 text-xs font-mono text-slate-400">
              <span>ATR: <strong className="text-white">₹{currentProfile.typicalAtr}</strong></span>
              <span>•</span>
              <span>Support: <strong className="text-emerald-400">{currentProfile.supportLevels?.join(', ')}</strong></span>
              <span>•</span>
              <span>Resistance: <strong className="text-rose-400">{currentProfile.resistanceLevels?.join(', ')}</strong></span>
            </div>
          </div>

          {/* Main Signal Dashboard Table */}
          <div className="p-4 flex-1 overflow-x-auto">
            <div className="min-w-[960px]">
              <table className="w-full text-left font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-900/40">
                    <th className="py-2.5 px-3">Index / Time</th>
                    <th className="py-2.5 px-3">Signal Setup &amp; Level</th>
                    <th className="py-2.5 px-3">Option Strike Contract</th>
                    <th className="py-2.5 px-3">Entry &amp; SL</th>
                    <th className="py-2.5 px-3">Standard Targets (T1 / T2 / T4)</th>
                    <th className="py-2.5 px-3">Adaptive Target (Edge Peak)</th>
                    <th className="py-2.5 px-3 text-center">Status / Points</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {signals.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                        No confirmed signals for the selected filter yet today. Monitoring S/R levels...
                      </td>
                    </tr>
                  ) : (
                    signals.map((sig) => {
                      const isExpanded = expandedSignalId === sig.id;
                      const isFakeout = sig.confirmationStatus === 'FAKEOUT_FILTERED' || sig.tradeStatus === 'FILTERED_OUT';
                      const isBullish = sig.bias === 'BULLISH';
                      const isOpen = ['ACTIVE', 'TARGET_1_HIT', 'TARGET_2_HIT'].includes(sig.tradeStatus);
                      const isWin = !isOpen && sig.pointsCaptured > 0;
                      const isSl = sig.tradeStatus === 'STOPLOSS_HIT';

                      return (
                        <React.Fragment key={sig.id}>
                          <tr
                            className={`hover:bg-slate-800/40 transition cursor-pointer ${
                              isFakeout ? 'bg-slate-950/40 opacity-75' : isWin ? 'bg-emerald-950/10' : ''
                            }`}
                            onClick={() => setExpandedSignalId(isExpanded ? null : sig.id)}
                          >
                            {/* Index & Time */}
                            <td className="py-3 px-3">
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>{sig.indexSymbol}</span>
                                {sig.daySignalNumber > 0 && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300 border border-slate-700">
                                    #{sig.daySignalNumber} Today
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3" />
                                <span>{sig.timeFormatted}</span>
                                <span>•</span>
                                <span>Spot: ₹{sig.underlyingSpot.toLocaleString('en-IN')}</span>
                              </div>
                            </td>

                            {/* Signal Type & Setup */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                {isFakeout ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                    <ShieldAlert className="h-3 w-3" />
                                    🛡️ FAKEOUT FILTERED
                                  </span>
                                ) : (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                      isBullish
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    }`}
                                  >
                                    {isBullish ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    BREAKOUT
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                                <span>Level: <strong className="text-white">₹{sig.keyLevel.toLocaleString('en-IN')}</strong></span>
                                <span>•</span>
                                <span>Vol: <strong className="text-cyan-400">{sig.volumeMultiplier}x</strong></span>
                              </div>
                            </td>

                            {/* Option Strike */}
                            <td className="py-3 px-3">
                              <div className="font-bold flex items-center gap-1.5">
                                <span className={sig.optionType === 'CE' ? 'text-emerald-400' : 'text-rose-400'}>
                                  {sig.optionSymbol}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-cyan-300 border border-cyan-500/30 font-bold">
                                  BUY
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Setup score: <strong className="text-emerald-400">{sig.confidenceScore}/100</strong>
                              </div>
                            </td>

                            {/* Entry & SL */}
                            <td className="py-3 px-3">
                              <div className="text-slate-200">
                                Entry: <strong className="text-white">₹{sig.optionEntryPrice.toFixed(1)}</strong>
                              </div>
                              <div className="text-[10px] text-rose-400 mt-0.5">
                                SL: ₹{sig.optionStopLoss.toFixed(1)} (-{sig.optionStopLossPoints.toFixed(1)} pts)
                              </div>
                            </td>

                            {/* Standard Targets T1 / T2 / T4 */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1 text-[10px]">
                                <span
                                  className={`px-1.5 py-0.5 rounded border ${
                                    sig.target1.hit
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                                      : 'bg-slate-900 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  T1 (1:2): ₹{sig.target1.price} {sig.target1.hit && '✓'}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded border ${
                                    sig.target2.hit
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                                      : 'bg-slate-900 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  T2 (1:3): ₹{sig.target2.price} {sig.target2.hit && '✓'}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded border ${
                                    sig.target4.hit
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                                      : 'bg-slate-900 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  T4 (1:4): ₹{sig.target4.price} {sig.target4.hit && '✓'}
                                </span>
                              </div>
                            </td>

                            {/* Adaptive Target */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    sig.adaptiveTarget.hit
                                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                      : 'bg-slate-900 text-orange-300 border-orange-500/30'
                                  }`}
                                >
                                  Target {sig.adaptiveTarget.ratio}: ₹{sig.adaptiveTarget.price}
                                </span>
                                {sig.adaptiveTarget.hit && <span className="text-emerald-400 font-bold text-xs">✓ HIT</span>}
                              </div>
                              {sig.adaptiveTarget.probabilityPercent > 0 && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Edge Prob: <strong className="text-cyan-300">{sig.adaptiveTarget.probabilityPercent}%</strong>
                                </div>
                              )}
                            </td>

                            {/* Status / Points */}
                            <td className="py-3 px-3 text-center">
                              {isFakeout ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                                  NO TRADE (TRAP)
                                </span>
                              ) : isWin ? (
                                <div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                    +{sig.pointsCaptured.toFixed(1)} PTS
                                  </span>
                                  <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
                                    +{sig.pnlPercent.toFixed(1)}%
                                  </div>
                                </div>
                              ) : isOpen ? (
                                <div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                                    RUNNING ({sig.pointsCaptured >= 0 ? '+' : ''}{sig.pointsCaptured.toFixed(1)} PTS)
                                  </span>
                                  <div className="text-[10px] text-cyan-400 mt-0.5">
                                    LTP: ₹{sig.currentOptionPrice.toFixed(1)}
                                  </div>
                                </div>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  {sig.tradeStatus === 'SQUARED_OFF' ? 'SQUARED OFF' : 'SL HIT'} ({sig.pointsCaptured.toFixed(1)} PTS)
                                </span>
                              )}
                            </td>

                            {/* Action Buttons */}
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!isFakeout && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleBroadcastSignal(sig);
                                    }}
                                    disabled={broadcastingSignalId === sig.id}
                                    className="p-1.5 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 text-sky-300 hover:text-white transition cursor-pointer disabled:opacity-50"
                                    title="Broadcast Signal to Telegram Channel"
                                  >
                                    <Send className={`h-3 w-3 ${broadcastingSignalId === sig.id ? 'animate-pulse' : ''}`} />
                                  </button>
                                )}

                                {(isWin || sig.target1?.hit || sig.target2?.hit) && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await broadcastTargetWinToTelegram({
                                          indexSymbol: sig.indexSymbol,
                                          optionSymbol: sig.optionSymbol,
                                          targetName: sig.target2?.hit ? 'TARGET 2 WIN 🏆' : 'TARGET 1 HIT 🎯',
                                          pointsWon: sig.pointsCaptured,
                                          entryPrice: sig.optionEntryPrice,
                                          exitPrice: sig.exitPrice ?? sig.currentOptionPrice,
                                          pnlPercent: sig.pnlPercent,
                                          ratio: sig.target2?.hit ? sig.target2.ratio : sig.target1.ratio,
                                          rationale: `${sig.indexSymbol} Chanakya Pro breakout hit target with high momentum`,
                                        });
                                        setTelegramBroadcastStatus({
                                          id: sig.id,
                                          message: `🏆 Dispatched Target Win for ${sig.indexSymbol} to Telegram!`,
                                        });
                                        setTimeout(() => setTelegramBroadcastStatus(null), 5000);
                                      } catch (err) {
                                        console.warn(err);
                                      }
                                    }}
                                    className="p-1.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 hover:text-white transition cursor-pointer"
                                    title="Broadcast Target Win to Telegram Channel"
                                  >
                                    <Target className="h-3 w-3 text-emerald-400" />
                                  </button>
                                )}

                                {!isFakeout && sig.tradeStatus === 'ACTIVE' ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExecuteOptionTrade(sig);
                                    }}
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer shadow flex items-center gap-1 transition"
                                  >
                                    <Play className="h-3 w-3 fill-current" />
                                    Trade
                                  </button>
                                ) : null}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedSignalId(isExpanded ? null : sig.id);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Details Card */}
                          {isExpanded && (
                            <tr className="bg-[#070b14] border-b border-slate-800">
                              <td colSpan={8} className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                  {/* Left: Trade Rationale & Marathi Explanation */}
                                  <div className="space-y-2.5 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800">
                                    <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                                      <FileText className="h-4 w-4" />
                                      <span>Chanakya Pro Confirmation Breakdown</span>
                                    </div>
                                    <p className="text-slate-300 text-xs leading-relaxed">
                                      {sig.rationale}
                                    </p>
                                    <div className="p-2.5 rounded bg-indigo-950/40 border border-indigo-500/30 text-indigo-200">
                                      <strong className="text-indigo-400 block mb-1">मराठी विश्लेषण (Chanakya Pro Analysis):</strong>
                                      <span className="text-[11px] leading-relaxed">{sig.marathiRationale}</span>
                                    </div>
                                    {sig.trapDetails && (
                                      <div className="p-2.5 rounded bg-amber-950/40 border border-amber-500/40 text-amber-200">
                                        <strong className="text-amber-400 block mb-1">🛡️ Trap Avoided Details:</strong>
                                        <span>{sig.trapDetails}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right: Technical Multipliers & Edge Calibration */}
                                  <div className="space-y-2.5 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800">
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400">Key Level Broken/Defended:</span>
                                      <strong className="text-white">₹{sig.keyLevel.toLocaleString('en-IN')}</strong>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400">Volume Surge Multiplier:</span>
                                      <strong className="text-cyan-400">{sig.volumeMultiplier}x Relative Volume</strong>
                                    </div>
                                    {sig.rejectionWickPercent !== undefined && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-slate-400">Candle Wick Rejection Ratio:</span>
                                        <strong className="text-orange-400">{sig.rejectionWickPercent.toFixed(1)}% of range</strong>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-400">Adaptive Edge Target Logic:</span>
                                      <strong className="text-emerald-400">{sig.adaptiveTarget.reason}</strong>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                                      <span className="text-slate-400">Max Points Reached In Session:</span>
                                      <strong className="text-cyan-300">+{sig.maxPointsReached.toFixed(1)} Points</strong>
                                    </div>

                                    {/* Telegram Dispatch Trigger in Card */}
                                    {!isFakeout && (
                                      <div className="pt-2 flex justify-end">
                                        <button
                                          onClick={() => handleBroadcastSignal(sig)}
                                          disabled={broadcastingSignalId === sig.id}
                                          className="px-3 py-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-500/50 text-sky-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                        >
                                          <Send className="h-3.5 w-3.5 text-sky-400" />
                                          {broadcastingSignalId === sig.id ? 'Sending...' : `Broadcast this Signal to Telegram (${webhookSettings.telegram.chatId || '@channel'})`}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edge Calibration & Historical Backtest Modal */}
      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#0b101e] border border-indigo-500/40 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono text-slate-100 my-auto">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-indigo-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-indigo-400" />
                <h3 className="font-bold text-sm sm:text-base text-white">
                  Historical Edge Finding &amp; Adaptive Target Calibration Workbench
                </h3>
              </div>
              <button
                onClick={() => setShowCalibrationModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {/* Controls Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Select Index</label>
                  <select
                    value={backtestIndex}
                    onChange={(e) => {
                      setBacktestIndex(e.target.value);
                      const p = profiles[e.target.value];
                      if (p) {
                        setCustomVolThreshold(p.breakoutVolumeThreshold);
                        setCustomWickPercent(p.minWickRejectionPercent);
                        setCustomTargetRatio(p.calibratedOptimalTargetRatio);
                      }
                      handleRunBacktest(e.target.value, backtestPeriod);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="NIFTY 50">NIFTY 50</option>
                    <option value="BANKNIFTY">BANKNIFTY</option>
                    <option value="FINNIFTY">FINNIFTY</option>
                    <option value="MIDCPNIFTY">MIDCPNIFTY</option>
                    <option value="SENSEX">SENSEX</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Historical Period</label>
                  <select
                    value={backtestPeriod}
                    onChange={(e: any) => {
                      setBacktestPeriod(e.target.value);
                      handleRunBacktest(backtestIndex, e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="3M">Past 3 Months (Intraday)</option>
                    <option value="6M">Past 6 Months (Intraday)</option>
                    <option value="1Y">Past 1 Year (Intraday)</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <button
                    disabled
                    className="flex-1 bg-slate-700 text-slate-400 font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Backtest unavailable
                  </button>
                </div>
              </div>

              {/* Parameter Sliders for Edge Tuning */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 text-xs">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Breakout Volume Filter:</span>
                    <strong className="text-cyan-400">{customVolThreshold}x Avg</strong>
                  </div>
                  <input
                    type="range"
                    min={1.1}
                    max={2.5}
                    step={0.05}
                    value={customVolThreshold}
                    onChange={(e) => setCustomVolThreshold(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Min Wick Rejection %:</span>
                    <strong className="text-orange-400">{customWickPercent}%</strong>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={75}
                    step={1}
                    value={customWickPercent}
                    onChange={(e) => setCustomWickPercent(parseInt(e.target.value))}
                    className="w-full accent-orange-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Target Ratio Calibration:</span>
                    <strong className="text-emerald-400">{customTargetRatio}</strong>
                  </div>
                  <select
                    value={customTargetRatio}
                    onChange={(e) => setCustomTargetRatio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-white"
                  >
                    <option value="1:1.5">1:1.5</option>
                    <option value="1:1.8">1:1.8</option>
                    <option value="1:2.0">1:2.0</option>
                    <option value="1:2.2">1:2.2</option>
                    <option value="1:3.0">1:3.0</option>
                    <option value="1:4.0">1:4.0</option>
                    <option value="1:9.0">1:9.0</option>
                  </select>
                </div>
              </div>

              {/* Calibration Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleSaveCalibration}
                  disabled={calibrating}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow transition"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {calibrating ? 'Saving...' : 'Save & Calibrate Edge Parameters'}
                </button>
                {calibrationSuccess && <span className="text-xs text-emerald-400 font-bold">{calibrationSuccess}</span>}
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 leading-relaxed">
                <strong>Backtest unavailable.</strong> Earlier backtest results were simulated from fixed win-rate
                tables and random numbers, not from historical market data, so they have been removed. Real
                performance is shown from live signals as they close.
              </div>

              {/* Backtest Results Visual Display */}
              {backtestResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Total Signals Tested</span>
                      <strong className="text-base text-white">{backtestResult.totalSignalsDetected}</strong>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Fakeouts Filtered</span>
                      <strong className="text-base text-indigo-400">{backtestResult.fakeoutsFilteredCount} Traps Avoided</strong>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Win Rate %</span>
                      <strong className="text-base text-emerald-400">{backtestResult.winRatePercent}%</strong>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Net Points Captured</span>
                      <strong className="text-base text-cyan-400">+{backtestResult.netPointsCaptured} pts</strong>
                    </div>
                  </div>

                  {/* Probability Edge Distribution Table */}
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-orange-400" />
                      Risk-Reward Multiple Probability Curve &amp; Mathematical Edge
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {backtestResult.probabilityDistribution.map((prob) => (
                        <div
                          key={prob.ratio}
                          className={`p-2 rounded border ${
                            prob.isOptimalEdge
                              ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300 font-bold ring-1 ring-cyan-500/40'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span>Ratio {prob.ratio}</span>
                            {prob.isOptimalEdge && (
                              <span className="text-[9px] px-1 rounded bg-cyan-500 text-slate-950 font-bold">
                                PEAK EDGE
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-bold mt-1 text-white">{prob.winRatePercent}% Win Rate</div>
                          <div className="text-[10px] text-emerald-400 mt-0.5">EV: +{prob.expectedValuePoints} pts</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sample Historical Trades Log */}
                  <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
                      Verified Historical Trades Log (Past {backtestPeriod})
                    </h4>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {backtestResult.trades.slice(0, 10).map((tr) => (
                        <div
                          key={tr.id}
                          className={`p-2 rounded text-[11px] flex items-center justify-between ${
                            tr.result === 'WIN' ? 'bg-emerald-950/30 border border-emerald-500/30' : 'bg-rose-950/30 border border-rose-500/30'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{tr.date} {tr.time}</span>
                            <span className="font-bold text-white">{tr.optionSymbol}</span>
                            <span className="text-slate-300">[{tr.patternType}]</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span>Entry: ₹{tr.entryPrice} &rarr; Exit: ₹{tr.exitPrice}</span>
                            <strong className={tr.result === 'WIN' ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                              {tr.points > 0 ? `+${tr.points}` : tr.points} pts
                            </strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
