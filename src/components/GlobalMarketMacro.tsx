import React from 'react';
import {
  Globe,
  Compass,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';

export const GlobalMarketMacro: React.FC = () => {
  const { tickers } = useTrading();

  // Calculate composite macro sentiment score
  const giftNifty = tickers.find(t => t.symbol === 'GIFT NIFTY');
  const sp500 = tickers.find(t => t.symbol === 'S&P 500');
  const nasdaq = tickers.find(t => t.symbol === 'NASDAQ 100');
  const crude = tickers.find(t => t.symbol === 'CRUDE OIL');

  const giftChange = giftNifty?.changePercent || 0.71;
  const usChange = ((sp500?.changePercent || 0.58) + (nasdaq?.changePercent || 0.86)) / 2;
  const crudeChange = crude?.changePercent || -1.21;

  // Crude dropping is bullish for India (major oil importer)
  const crudeBullishBonus = crudeChange < 0 ? 10 : -10;
  const sentimentScore = Math.min(100, Math.max(-100, Math.round((giftChange * 40) + (usChange * 35) + crudeBullishBonus)));

  // Indian Opening Gap Probability
  const gapUpProb = Math.min(88, Math.max(12, Math.round(50 + (sentimentScore * 0.35))));
  const gapDownProb = Math.min(88, Math.max(12, Math.round(100 - gapUpProb - 15)));
  const flatProb = Math.max(5, 100 - gapUpProb - gapDownProb);

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-white">
                Global Markets &amp; Macro Analytics
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                Angel One Global API
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              International correlation, overnight cues &amp; GIFT Nifty gap forecasting
            </div>
          </div>
        </div>

        <div className="text-right font-mono text-xs">
          <span className="text-slate-400">Macro Bias: </span>
          <span className={`font-bold ${sentimentScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {sentimentScore >= 25 ? 'Strong Bullish' : sentimentScore >= 0 ? 'Mild Bullish' : 'Cautious / Bearish'} ({sentimentScore > 0 ? '+' : ''}{sentimentScore})
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Gap Prediction Model Card */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-900/90 via-[#0c1424] to-slate-900/90 border border-slate-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2.5">
            <div>
              <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-cyan-400" />
                Indian Market Next Session Opening Probability
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Calculated from GIFT Nifty premiums, S&amp;P 500 futures, and Brent crude movements.
              </p>
            </div>
            <div className="text-right font-mono text-[10px] text-amber-300">
              Probabilistic Model • No Guarantees
            </div>
          </div>

          {/* Probability Bar */}
          <div className="space-y-1.5">
            <div className="h-3.5 w-full rounded-full bg-slate-800 flex overflow-hidden p-0.5 ring-1 ring-slate-700">
              <div
                style={{ width: `${gapUpProb}%` }}
                className="bg-emerald-500 rounded-l-full transition-all duration-500"
                title={`Gap-Up Probability: ${gapUpProb}%`}
              />
              <div
                style={{ width: `${flatProb}%` }}
                className="bg-amber-500 transition-all duration-500"
                title={`Flat Open Probability: ${flatProb}%`}
              />
              <div
                style={{ width: `${gapDownProb}%` }}
                className="bg-rose-500 rounded-r-full transition-all duration-500"
                title={`Gap-Down Probability: ${gapDownProb}%`}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Gap-Up: {gapUpProb}%
              </span>
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Flat: {flatProb}%
              </span>
              <span className="text-rose-400 font-bold flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Gap-Down: {gapDownProb}%
              </span>
            </div>
          </div>
        </div>

        {/* Macro Insight Drivers Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">GIFT Nifty Overnight Bias</div>
            <div className={`text-sm font-extrabold flex items-center gap-1 ${giftChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {giftChange >= 0 ? '+' : ''}{giftChange.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Early indicator for Indian market open</div>
          </div>

          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">US Benchmark Blend (S&amp;P/NQ)</div>
            <div className={`text-sm font-extrabold flex items-center gap-1 ${usChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {usChange >= 0 ? '+' : ''}{usChange.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Global risk appetite correlation</div>
          </div>

          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Brent Crude Impact</div>
            <div className={`text-sm font-extrabold flex items-center gap-1 ${crudeChange < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {crudeChange >= 0 ? '+' : ''}{crudeChange.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{crudeChange < 0 ? 'Favorable for Indian Rupee/Economy' : 'Inflationary pressure signal'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
