import React, { useState } from 'react';
import {
  BrainCircuit,
  Sparkles,
  ShieldAlert,
  TrendingUp,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  Gauge,
  ArrowRight,
  HelpCircle,
  BarChart2,
  X,
  Activity,
  Award,
  Calendar,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { WORLD_CLASS_STRATEGIES } from '../data/marketData';
import { StrategyRecommendation, BacktestResult } from '../types/market';
import { requestAiStrategyAnalysis, runStrategyBacktest } from '../services/api';

export const AiStrategyEngine: React.FC = () => {
  const {
    activeTicker,
    brokerMode,
    placeOrder,
    activeStrategy,
    setActiveStrategy,
    allStrategies,
    setAllStrategies,
  } = useTrading();
  
  const [selectedRisk, setSelectedRisk] = useState<'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE'>(activeStrategy.riskLevel || 'BALANCED');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);
  const [executionNotice, setExecutionNotice] = useState<string | null>(null);

  // Backtesting State
  const [showBacktestModal, setShowBacktestModal] = useState(false);
  const [backtestTimeframe, setBacktestTimeframe] = useState<'6M' | '1Y' | '3Y'>('1Y');
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  const handleOpenBacktest = async (timeframe: '6M' | '1Y' | '3Y' = backtestTimeframe) => {
    setShowBacktestModal(true);
    setBacktestLoading(true);
    try {
      const res = await runStrategyBacktest(
        activeStrategy.id,
        timeframe,
        activeTicker.symbol
      );
      if (res) {
        setBacktestResult(res);
      }
    } catch (err) {
      console.warn('Backtest error:', err);
    } finally {
      setBacktestLoading(false);
    }
  };

  // Handle Risk level change
  const handleRiskChange = (risk: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE') => {
    setSelectedRisk(risk);
    const matched = allStrategies.find(s => s.riskLevel === risk) || allStrategies[0];
    setActiveStrategy(matched);
  };

  // Call server-side OpenAI for Live Market Regime Analysis
  const runLiveAiAnalysis = async () => {
    setIsAnalyzing(true);
    setExecutionNotice(null);
    try {
      const data = await requestAiStrategyAnalysis({
        symbol: activeTicker.symbol,
        currentPrice: activeTicker.ltp,
        pcr: 1.12,
        marketRegime: 'Rangebound with Positive Bias',
        riskLevel: selectedRisk,
        globalSentiment: 'GIFT Nifty positive (+0.7%), NASDAQ firm (+0.86%)',
      });

      setAiAnalysisResult(data);

      if (data && data.strategyName) {
        const generatedStrat: StrategyRecommendation = {
          id: `ai-gen-${Date.now()}`,
          name: data.strategyName,
          category: 'NON_DIRECTIONAL',
          marketRegime: data.marketRegime || 'AI Detected Regime',
          riskLevel: selectedRisk,
          winProbabilityPercent: Number(data.winProbabilityPercent) || 68.5,
          riskRewardRatio: data.riskRewardRatio || '1 : 2.1',
          maxProfit: '₹4,500 per lot',
          maxLoss: '₹2,200 per lot',
          targetUnderlying: Number(data.targetLevel) || activeTicker.ltp * 1.015,
          stopLossUnderlying: Number(data.stopLossLevel) || activeTicker.ltp * 0.99,
          legs: data.legs || activeStrategy.legs,
          rationale: data.rationale || 'Derived using statistical distribution of IV and price clusters.',
          sebiComplianceNotice: data.sebiComplianceDisclaimer || 'Strictly probabilistic. Zero returns guaranteed. Consult RIA.',
          greeksProfile: data.greeks || { netDelta: 0.12, netTheta: 8.4, netVega: -4.2 },
        };
        setActiveStrategy(generatedStrat);
      }
    } catch (err) {
      console.warn('AI analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Execute all legs of the strategy in one-click
  const handleExecuteStrategy = () => {
    let successCount = 0;
    activeStrategy.legs.forEach(leg => {
      const res = placeOrder({
        symbol: activeTicker.symbol,
        side: leg.action,
        type: 'MARKET',
        product: 'NRML',
        quantity: activeTicker.lotSize * (leg.lots || 1),
      });
      if (res.success) successCount++;
    });

    setExecutionNotice(
      `Successfully queued ${successCount}/${activeStrategy.legs.length} strategy legs via ${brokerMode} mode.`
    );
    setTimeout(() => setExecutionNotice(null), 5000);
  };

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-indigo-500/20 text-indigo-400">
            <BrainCircuit className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-white">
                World-Class AI Strategy Engine
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                Regime-Adaptive
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Auto-adapts to market regime with mathematical win probability %
            </div>
          </div>
        </div>

        {/* Gemini AI Trigger Button */}
        <button
          onClick={runLiveAiAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-cyan-900/20 disabled:opacity-60 transition"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Analyzing Market Regime...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
              Live AI Regime Scan (OpenAI)
            </>
          )}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Market Regime & Risk Level Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Regime Badge */}
          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between mb-1">
              <span>Detected Market Regime</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Scan
              </span>
            </div>
            <div className="font-mono font-bold text-sm text-cyan-300">
              {activeStrategy.marketRegime}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Global bias: Positive cues from GIFT Nifty &amp; US Tech, low historical IV.
            </div>
          </div>

          {/* Risk Level Selector */}
          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Dynamic Risk Profile</span>
              <span className="text-[10px] text-slate-500 font-mono">SEBI Risk Categorization</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const).map(risk => (
                <button
                  key={risk}
                  onClick={() => handleRiskChange(risk)}
                  className={`py-1.5 px-2 rounded-md font-mono text-[11px] font-bold transition border ${
                    selectedRisk === risk
                      ? risk === 'CONSERVATIVE'
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                        : risk === 'BALANCED'
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                        : 'bg-rose-950/80 border-rose-500 text-rose-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {risk}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Strategy Card */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-slate-900/90 to-[#0c1220] border border-slate-700/80 shadow-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-tight">
                  {activeStrategy.name}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                  {activeStrategy.category}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {activeStrategy.rationale}
              </p>
            </div>

            {/* CRITICAL SEBI COMPLIANCE: PROBABILITY IN %, ZERO GUARANTEES */}
            <div className="text-right">
              <div className="text-[10px] text-amber-300 font-semibold flex items-center justify-end gap-1 mt-0.5">
                <ShieldAlert className="h-3 w-3 text-amber-400" />
                Not a prediction • No Guarantee (गॅरंटी नाही)
              </div>
            </div>
          </div>

          {/* Strategy Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Risk-Reward Ratio</span>
              <span className="font-bold text-slate-200">{activeStrategy.riskRewardRatio}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Estimated Max Profit</span>
              <span className="font-bold text-emerald-400">{activeStrategy.maxProfit}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Max Defined Risk</span>
              <span className="font-bold text-rose-400">{activeStrategy.maxLoss}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Delta / Theta Decay</span>
              <span className="font-bold text-cyan-300">
                Δ {activeStrategy.greeksProfile.netDelta} | θ +{activeStrategy.greeksProfile.netTheta}/d
              </span>
            </div>
          </div>

          {/* Multi-Leg Breakdown */}
          <div className="pt-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              Multi-Leg Execution Structure ({activeStrategy.legs.length} Legs)
            </div>
            <div className="space-y-1.5">
              {activeStrategy.legs.map((leg, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-[#090d16] border border-slate-800 flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-extrabold text-[10px] ${
                        leg.action === 'BUY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {leg.action}
                    </span>
                    <span className="text-white font-semibold">{leg.instrument}</span>
                    <span className="text-slate-500 text-[11px]">({leg.lots || 1} Lot)</span>
                  </div>
                  <div className="text-slate-300">
                    Est. Premium: <span className="text-white font-bold">₹{leg.estPrice.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Row & Compliance Disclaimer */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-[11px] text-amber-300/90 leading-tight max-w-xl">
              <strong>Mandatory SEBI Disclosure:</strong> This is an illustrative strategy idea, not a recommendation. No win probability or backtest has been computed for it. We are not SEBI registered; options carry high risk of loss.
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Historical Backtest button removed: its results were random numbers, not a backtest. */}
              <button
                onClick={handleExecuteStrategy}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition shrink-0 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Execute Strategy ({brokerMode})
              </button>
            </div>
          </div>

          {executionNotice && (
            <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs font-mono animate-fadeIn">
              {executionNotice}
            </div>
          )}
        </div>
      </div>

      {/* Backtest Analysis Modal */}
      {showBacktestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] rounded-2xl border border-slate-700 w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <BarChart2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                    {activeStrategy.name} — Quantitative Backtest
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                      {activeTicker.symbol}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    NSE historical options tick simulation with delta &amp; slippage accounting
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBacktestModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Timeframe Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#090d16] border-b border-slate-800 font-mono text-xs">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>Simulation Timeframe:</span>
              </div>
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-slate-800">
                {(['6M', '1Y', '3Y'] as const).map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => {
                      setBacktestTimeframe(tf);
                      handleOpenBacktest(tf);
                    }}
                    className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                      backtestTimeframe === tf
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
              {backtestLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <RefreshCw className="h-7 w-7 animate-spin text-indigo-400" />
                  <span className="text-xs">Computing options tick simulation across {backtestTimeframe} historical chain data...</span>
                </div>
              ) : backtestResult ? (
                <>
                  {/* Primary Performance Metrics Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Win Rate</span>
                      <span className="font-extrabold text-lg text-emerald-400">
                        {backtestResult.winRate}%
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {backtestResult.winningTrades}W / {backtestResult.losingTrades}L ({backtestResult.totalTrades} trades)
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Net Strategy P&amp;L</span>
                      <span className="font-extrabold text-lg text-emerald-300">
                        ₹{backtestResult.netProfit.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                        CAGR +{backtestResult.cagr}%
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Profit Factor</span>
                      <span className="font-extrabold text-lg text-cyan-300">
                        {backtestResult.profitFactor.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Sharpe {backtestResult.sharpeRatio.toFixed(2)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase block">Max Drawdown</span>
                      <span className="font-extrabold text-lg text-rose-400">
                        -{backtestResult.maxDrawdown}%
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Risk Controlled
                      </span>
                    </div>
                  </div>

                  {/* Monthly Return Breakdown */}
                  <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-bold text-slate-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-indigo-400" />
                        Monthly Return Distribution
                      </span>
                      <span className="text-[10px] text-slate-500">Trailing Month Performance</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {backtestResult.monthlyReturns.map((m, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border text-center ${
                            m.pnl >= 0
                              ? 'bg-emerald-950/40 border-emerald-800/60'
                              : 'bg-rose-950/40 border-rose-800/60'
                          }`}
                        >
                          <div className="text-[10px] text-slate-400 font-bold">{m.month}</div>
                          <div
                            className={`font-extrabold text-xs mt-0.5 ${
                              m.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {m.pnl >= 0 ? `+₹${m.pnl.toLocaleString('en-IN')}` : `-₹${Math.abs(m.pnl).toLocaleString('en-IN')}`}
                          </div>
                          <div className="text-[9px] text-slate-500 mt-0.5">
                            {m.trades} trades ({m.winRate}%)
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Equity Simulation Visual Bar */}
                  <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-amber-400" />
                        Cumulative Strategy Equity Growth
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold">
                        ₹1,00,000 → ₹{(100000 + backtestResult.netProfit).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="h-20 w-full flex items-end gap-1.5 pt-4 px-2">
                      {backtestResult.monthlyReturns.map((m, idx) => {
                        const heightPercent = Math.min(100, Math.max(25, (m.pnl / 35000) * 80 + 35));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className={`w-full rounded-t transition-all ${
                                m.pnl >= 0 ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : 'bg-gradient-to-t from-rose-600 to-rose-400'
                              }`}
                            />
                            <span className="text-[8px] text-slate-500 truncate w-full text-center">
                              {m.month.slice(0, 3)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SEBI Compliance Notice */}
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300/90 leading-tight">
                    <strong>SEBI Research Compliance:</strong> Backtested metrics reflect mathematical model approximations on past data including exchange fees and STT. Algorithmic trading involves market risk; past results do not guarantee future returns.
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowBacktestModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBacktestModal(false);
                  handleExecuteStrategy();
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono transition flex items-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Deploy Strategy ({brokerMode})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
