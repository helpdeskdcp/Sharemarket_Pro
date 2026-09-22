import React, { useState } from 'react';
import {
  ShieldAlert,
  X,
  FileText,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Scale,
  Download,
} from 'lucide-react';

interface SebiDocModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SebiDocumentationModal: React.FC<SebiDocModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'DISCLOSURE' | 'PROBABILITY_POLICY' | 'CHARTER'>('DISCLOSURE');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] rounded-2xl border border-amber-500/40 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border-b border-amber-500/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white font-mono">
                SEBI Mandatory Documentation &amp; Statutory Disclaimers
              </h3>
              <p className="text-[11px] text-amber-300/90 font-mono">
                Adhering to Securities and Exchange Board of India (SEBI) Guidelines
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center px-4 border-b border-slate-800 bg-[#090d16] text-xs font-mono">
          <button
            onClick={() => setActiveTab('DISCLOSURE')}
            className={`py-2.5 px-3 font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'DISCLOSURE'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Statutory Disclaimers
          </button>

          <button
            onClick={() => setActiveTab('PROBABILITY_POLICY')}
            className={`py-2.5 px-3 font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'PROBABILITY_POLICY'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            Zero Guarantees (गॅरंटी) Policy
          </button>

          <button
            onClick={() => setActiveTab('CHARTER')}
            className={`py-2.5 px-3 font-bold transition border-b-2 flex items-center gap-2 ${
              activeTab === 'CHARTER'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Investor Charter
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans text-slate-300 leading-relaxed">
          {activeTab === 'DISCLOSURE' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200">
                <h4 className="font-bold text-sm text-amber-300 font-mono mb-1">
                  1. NON-SEBI REGISTERED ENTITY DECLARATION
                </h4>
                <p>
                  <strong>We are NOT a SEBI-registered broker</strong> and{' '}
                  <strong>we are NOT SEBI-registered financial advisors, research analysts (RA), or portfolio managers (PMS)</strong>.
                  All software features, automated strategy algorithms, option chains, and analytical models provided in this terminal are{' '}
                  <strong className="underline decoration-amber-400">STRICTLY FOR EDUCATIONAL AND RESEARCH PURPOSES ONLY</strong>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <h4 className="font-bold text-sm text-white font-mono">
                  2. SEBI MANDATORY RISK DISCLOSURE ON DERIVATIVES
                </h4>
                <p className="text-slate-400">
                  As per SEBI study dated January 2023 on "Analysis of Profit and Loss of Individual Traders dealing in Equity Futures and Options (F&amp;O) Segment":
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-300 font-mono text-[11px]">
                  <li>
                    <strong>9 out of 10 individual traders</strong> in equity F&amp;O segment incurred net losses.
                  </li>
                  <li>
                    On an average, loss makers registered net trading loss close to <strong>₹50,000</strong>.
                  </li>
                  <li>
                    Over and above the net trading losses incurred, loss makers expended an additional <strong>28% of net trading losses as transaction costs</strong>.
                  </li>
                  <li>
                    Those making net trading profits incurred between 15% to 50% of such profits as transaction costs.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <h4 className="font-bold text-sm text-white font-mono mb-1">
                  3. MANDATORY PROFESSIONAL CONSULTATION
                </h4>
                <p className="text-slate-400">
                  Users MUST consult an independent SEBI-registered Investment Advisor (RIA) or licensed financial planner before making any real-world investment or trading decisions. Neither ShareMarket Pro nor its operators shall be liable for any direct or indirect capital losses incurred.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'PROBABILITY_POLICY' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 space-y-2">
                <h4 className="font-bold text-sm text-rose-300 font-mono">
                  ZERO GUARANTEE (गॅरंटी) POLICY &amp; PROBABILISTIC MODELING
                </h4>
                <p className="leading-relaxed">
                  In strict accordance with SEBI guidelines prohibiting assured, promised, or guaranteed returns in Indian securities markets,{' '}
                  <strong className="text-white underline">
                    THIS APPLICATION NEVER OFFERS GUARANTEES (गॅरंटी) OF ANY KIND.
                  </strong>
                </p>
              </div>

              <div className="space-y-2 text-slate-300 text-[11px] leading-relaxed">
                <p>
                  <strong>Mathematical Formulation of Win Probabilities:</strong>
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li>
                    All strategy indicators and AI suggestions express outcomes strictly as statistical win probabilities in percentage (e.g. 68.5%, 72.1%).
                  </li>
                  <li>
                    Probabilities are calculated dynamically using the Black-Scholes Option Pricing Model, Delta distribution, historical implied volatility (IV), and Put-Call Ratio (PCR).
                  </li>
                  <li>
                    A probability score of 75% explicitly means there is a 25% mathematical likelihood of total loss of premium on that strategy leg.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'CHARTER' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <h4 className="font-bold text-sm text-white mb-2">Investor Grievance &amp; Escalation</h4>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  For any concerns regarding algorithmic trade logs, Angel One API integration, or simulated data feeds, refer to our compliance desk:
                </p>
                <div className="mt-2 text-[11px] text-cyan-300 space-y-0.5">
                  <div>• Email: compliance@sharemarketpro.internal</div>
                  <div>• SEBI SCORES Portal: https://scores.sebi.gov.in</div>
                  <div>• Angel One Grievance Redressal: support@angelone.in</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono">
            Document Version: SEBI-COMP-2024.1 • Educational License
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold font-mono transition"
          >
            I Acknowledge &amp; Understand
          </button>
        </div>
      </div>
    </div>
  );
};
