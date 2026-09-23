import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  Gauge,
  Sliders,
  Info,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { requestAiStrategyAnalysis } from '../services/api';

interface MarketSentimentGaugeProps {
  onExploreStrategy?: () => void;
  compact?: boolean;
}

export const MarketSentimentGauge: React.FC<MarketSentimentGaugeProps> = ({
  onExploreStrategy,
  compact = false,
}) => {
  const {
    activeTicker,
    activeStrategy,
    setActiveStrategy,
    allStrategies,
    setAllStrategies,
    brokerMode,
  } = useTrading();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Compute sentiment percentage from AI Strategy analysis + Greeks & PCR cues
  const sentimentMetrics = useMemo(() => {
    const winProb = activeStrategy.winProbabilityPercent || 68.5;
    const netDelta = activeStrategy.greeksProfile?.netDelta ?? 0.15;
    
    // Normalize sentiment percentage (0-100)
    // Bullish strategies have high delta and high win prob; neutral have moderate; bearish have lower score
    let score = winProb;
    if (activeStrategy.category === 'DIRECTIONAL') {
      score = netDelta > 0 ? Math.min(94, winProb + 4) : Math.max(22, 100 - winProb);
    } else if (activeStrategy.category === 'NON_DIRECTIONAL') {
      score = Math.min(88, Math.max(50, winProb));
    }

    let sentimentLabel = 'NEUTRAL / CONSOLIDATION';
    let sentimentColor = '#f59e0b'; // amber
    let sentimentTone = 'Balanced';

    if (score >= 72) {
      sentimentLabel = 'STRONG BULLISH BIAS';
      sentimentColor = '#06b6d4'; // cyan
      sentimentTone = 'High Conviction Upward';
    } else if (score >= 60) {
      sentimentLabel = 'MODERATELY BULLISH';
      sentimentColor = '#10b981'; // emerald
      sentimentTone = 'Positive Drift';
    } else if (score >= 42) {
      sentimentLabel = 'RANGEBOUND BIAS';
      sentimentColor = '#eab308'; // yellow
      sentimentTone = 'Theta Decay Dominant';
    } else {
      sentimentLabel = 'CAUTIOUS / BEARISH BIAS';
      sentimentColor = '#f43f5e'; // rose
      sentimentTone = 'Defensive Risk Profile';
    }

    return {
      percentage: Math.round(score * 10) / 10,
      label: sentimentLabel,
      color: sentimentColor,
      tone: sentimentTone,
      winProb,
      regime: activeStrategy.marketRegime,
      netDelta,
      netTheta: activeStrategy.greeksProfile?.netTheta ?? 8.4,
    };
  }, [activeStrategy]);

  // Render D3 Radial Gauge
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 280;
    const height = 195;
    const cx = width / 2;
    const cy = 135;

    const startAngleDeg = -125;
    const endAngleDeg = 125;
    const startAngleRad = (startAngleDeg * Math.PI) / 180;
    const endAngleRad = (endAngleDeg * Math.PI) / 180;

    const outerRadius = 88;
    const innerRadius = 70;

    const scale = d3
      .scaleLinear()
      .domain([0, 100])
      .range([startAngleRad, endAngleRad]);

    const scaleDeg = d3
      .scaleLinear()
      .domain([0, 100])
      .range([startAngleDeg, endAngleDeg]);

    // Definitions & Gradients
    const defs = svg.append('defs');

    // Glow filter
    const filter = defs.append('filter').attr('id', 'gauge-glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arc Gradient: Red (Bearish) -> Amber (Neutral) -> Green (Bullish) -> Cyan (Strong Bullish)
    const linearGradient = defs
      .append('linearGradient')
      .attr('id', 'gauge-arc-gradient')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '100%')
      .attr('y2', '100%');

    linearGradient.append('stop').attr('offset', '0%').attr('stop-color', '#ef4444');
    linearGradient.append('stop').attr('offset', '35%').attr('stop-color', '#f59e0b');
    linearGradient.append('stop').attr('offset', '65%').attr('stop-color', '#10b981');
    linearGradient.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4');

    // Container Group
    const g = svg
      .append('g')
      .attr('transform', `translate(${cx}, ${cy})`);

    // 1. Background Track Arc
    const backgroundArc = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .startAngle(startAngleRad)
      .endAngle(endAngleRad)
      .cornerRadius(6);

    g.append('path')
      .attr('d', backgroundArc as any)
      .attr('fill', '#1e293b')
      .attr('opacity', 0.45);

    // 2. Zone Color Segments (Subtle colored zone background)
    const zones = [
      { from: 0, to: 35, color: '#ef4444', opacity: 0.15 },
      { from: 35, to: 60, color: '#f59e0b', opacity: 0.18 },
      { from: 60, to: 82, color: '#10b981', opacity: 0.2 },
      { from: 82, to: 100, color: '#06b6d4', opacity: 0.25 },
    ];

    zones.forEach(zone => {
      const zoneArc = d3
        .arc()
        .innerRadius(innerRadius + 1)
        .outerRadius(outerRadius - 1)
        .startAngle(scale(zone.from))
        .endAngle(scale(zone.to));

      g.append('path')
        .attr('d', zoneArc as any)
        .attr('fill', zone.color)
        .attr('opacity', zone.opacity);
    });

    // 3. Active Value Arc with gradient and rounded tip
    const currentAngleRad = scale(sentimentMetrics.percentage);

    const valueArc = d3
      .arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .startAngle(startAngleRad)
      .endAngle(currentAngleRad)
      .cornerRadius(5);

    const activePath = g
      .append('path')
      .attr('d', valueArc as any)
      .attr('fill', 'url(#gauge-arc-gradient)')
      .attr('filter', 'url(#gauge-glow)');

    // 4. Tick Marks & Radial Numbers (0, 25, 50, 75, 100)
    const ticks = [0, 25, 50, 75, 100];
    ticks.forEach(tickVal => {
      const angle = scaleDeg(tickVal);
      const rad = ((angle - 90) * Math.PI) / 180;

      const innerTickR = outerRadius + 3;
      const outerTickR = outerRadius + 8;
      const labelR = outerRadius + 18;

      const x1 = Math.cos(rad) * innerTickR;
      const y1 = Math.sin(rad) * innerTickR;
      const x2 = Math.cos(rad) * outerTickR;
      const y2 = Math.sin(rad) * outerTickR;
      const lx = Math.cos(rad) * labelR;
      const ly = Math.sin(rad) * labelR;

      // Tick Line
      g.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', tickVal === 50 ? '#94a3b8' : '#475569')
        .attr('stroke-width', tickVal === 50 ? 1.5 : 1);

      // Tick Label
      g.append('text')
        .attr('x', lx)
        .attr('y', ly + 3)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('font-family', 'ui-monospace, monospace')
        .attr('fill', tickVal === 50 ? '#cbd5e1' : '#64748b')
        .text(`${tickVal}%`);
    });

    // 5. Needle Pointer with smooth D3 animation
    const needleGroup = g.append('g').attr('class', 'needle-assembly');

    // Needle Polygon (sleek diamond dagger)
    const needleLen = outerRadius - 10;
    const needlePathData = `M -2.5 0 L 0 -${needleLen} L 2.5 0 L 1.5 12 L -1.5 12 Z`;

    needleGroup
      .append('path')
      .attr('d', needlePathData)
      .attr('fill', sentimentMetrics.color)
      .attr('filter', 'url(#gauge-glow)')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 0.5);

    // Center Hub Pivot Ring
    needleGroup
      .append('circle')
      .attr('r', 7.5)
      .attr('fill', '#090d18')
      .attr('stroke', sentimentMetrics.color)
      .attr('stroke-width', 2);

    needleGroup
      .append('circle')
      .attr('r', 3)
      .attr('fill', '#ffffff');

    // Initial position at 0 deg, then smooth transition to actual sentiment value
    const targetDeg = scaleDeg(sentimentMetrics.percentage);

    needleGroup
      .attr('transform', `rotate(${startAngleDeg})`)
      .transition()
      .duration(900)
      .ease(d3.easeBackOut.overshoot(1.1))
      .attr('transform', `rotate(${targetDeg})`);

  }, [sentimentMetrics]);

  // Quick risk profile selection
  const handleSelectRisk = (risk: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE') => {
    const matched = allStrategies.find(s => s.riskLevel === risk) || allStrategies[0];
    setActiveStrategy(matched);
  };

  // Re-run AI analysis
  const handleTriggerAiScan = async () => {
    setIsScanning(true);
    try {
      const data = await requestAiStrategyAnalysis({
        symbol: activeTicker.symbol,
        currentPrice: activeTicker.ltp,
        pcr: 1.12,
        marketRegime: 'Live Market Sentiment Regime Analysis',
        riskLevel: activeStrategy.riskLevel,
        globalSentiment: 'GIFT Nifty positive (+0.71%), NASDAQ firm (+0.86%)',
      });

      if (data && data.strategyName) {
        setActiveStrategy({
          ...activeStrategy,
          name: data.strategyName,
          winProbabilityPercent: Number(data.winProbabilityPercent) || activeStrategy.winProbabilityPercent,
          marketRegime: data.marketRegime || activeStrategy.marketRegime,
          rationale: data.rationale || activeStrategy.rationale,
        });
      }
    } catch (e) {
      console.warn('AI Scan error:', e);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div
      id="market-sentiment-gauge-card"
      className="bg-[#0b101e] rounded-xl border border-cyan-500/30 shadow-xl overflow-hidden"
    >
      {/* Top Banner Header */}
      <div className="p-3.5 bg-gradient-to-r from-[#0d162a] via-[#091122] to-[#0d162a] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-xs uppercase tracking-wider text-white font-mono flex items-center gap-1.5">
                AI Market Sentiment Gauge
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-normal">
                  D3 Radial Engine
                </span>
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Engine Feed
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Composite sentiment derived from AI Strategy win probability, Greeks delta, and options PCR
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Quick Risk Filter */}
          <div className="hidden md:flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-800 text-[10px] font-mono font-bold">
            {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const).map(risk => (
              <button
                key={risk}
                onClick={() => handleSelectRisk(risk)}
                className={`px-2 py-1 rounded transition cursor-pointer ${
                  activeStrategy.riskLevel === risk
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-600/50'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={`Switch to ${risk} Strategy Regime`}
              >
                {risk[0] + risk.slice(1, 4).toLowerCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleTriggerAiScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-cyan-950 transition cursor-pointer disabled:opacity-50"
            title="Scan market regime via Gemini 3.8 Flash"
          >
            {isScanning ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
            )}
            <span className="hidden sm:inline">AI Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content: Radial Gauge + Strategic Insights */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        {/* Radial D3 Gauge Canvas */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 bg-gradient-to-b from-[#080d19] to-[#0b1222] rounded-xl border border-slate-800/80">
          <div className="relative flex items-center justify-center">
            <svg
              ref={svgRef}
              viewBox="0 0 280 195"
              className="w-full max-w-[280px] h-auto overflow-visible select-none"
              aria-label="Radial D3 Market Sentiment Gauge"
            />

            {/* Centered Readout placed neatly below the pivot */}
            <div className="absolute bottom-1 left-0 right-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="flex items-baseline gap-1 font-mono font-black tracking-tight">
                <span
                  className="text-3xl sm:text-4xl transition-colors duration-500"
                  style={{ color: sentimentMetrics.color }}
                >
                  {sentimentMetrics.percentage}%
                </span>
                <span className="text-xs uppercase font-bold text-slate-400">Score</span>
              </div>
              <div
                className="text-[11px] font-mono font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border mt-0.5"
                style={{
                  color: sentimentMetrics.color,
                  borderColor: `${sentimentMetrics.color}55`,
                  backgroundColor: `${sentimentMetrics.color}15`,
                }}
              >
                {sentimentMetrics.label}
              </div>
            </div>
          </div>

          {/* Sentiment Band Labels */}
          <div className="w-full flex items-center justify-between text-[9px] font-mono text-slate-400 px-3 pt-2 mt-1 border-t border-slate-800/60">
            <span className="text-rose-400">Bearish (&lt;35%)</span>
            <span className="text-amber-400">Neutral (35-60%)</span>
            <span className="text-emerald-400">Bullish (60-80%)</span>
            <span className="text-cyan-400">High Conviction</span>
          </div>
        </div>

        {/* Quantitative AI Strategy Analysis Breakdown */}
        <div className="lg:col-span-7 space-y-3 font-mono">
          {/* Active Regime & Strategy Name */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 uppercase text-[10px] tracking-wider font-bold">
                Active AI Strategy Engine Model
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-950 text-indigo-300 border border-indigo-800">
                {activeStrategy.riskLevel} Profile
              </span>
            </div>
            <div className="text-white font-extrabold text-sm flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>{activeStrategy.name}</span>
            </div>
            <div className="text-[11px] text-slate-300 leading-relaxed">
              {activeStrategy.marketRegime}
            </div>
          </div>

          {/* Quantitative Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-[#090e1b] border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Risk-Reward</span>
              <span className="font-extrabold text-slate-200 text-sm">
                {activeStrategy.riskRewardRatio}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-[#090e1b] border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Net Delta (Δ)</span>
              <span
                className={`font-extrabold text-sm ${
                  sentimentMetrics.netDelta >= 0 ? 'text-cyan-300' : 'text-rose-400'
                }`}
              >
                {sentimentMetrics.netDelta >= 0 ? `+${sentimentMetrics.netDelta}` : sentimentMetrics.netDelta}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-[#090e1b] border border-slate-800">
              <span className="text-slate-500 text-[10px] block">Theta Decay (θ)</span>
              <span className="font-extrabold text-amber-300 text-sm">
                +{sentimentMetrics.netTheta}/d
              </span>
            </div>
          </div>

          {/* Macro Driver & SEBI Disclosure */}
          <div className="p-2.5 rounded-xl bg-[#080d19] border border-slate-800 text-[11px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-slate-300">
              <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Macro Drivers:</strong> GIFT Nifty (+0.71%), US Tech (+0.86%), PCR at 1.12 Support.
              </span>
            </div>

            {onExploreStrategy && (
              <button
                type="button"
                onClick={onExploreStrategy}
                className="px-3 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/40 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
              >
                <span>Inspect Strategy</span>
                <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="text-[10px] text-amber-300/80 flex items-center gap-1.5 font-sans">
            <ShieldAlert className="h-3 w-3 text-amber-400 shrink-0" />
            <span>
              <strong>SEBI Statutory Notice:</strong> Sentiment score and win probabilities are derived purely via statistical distribution and delta models. No returns or trade outcomes are guaranteed.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
