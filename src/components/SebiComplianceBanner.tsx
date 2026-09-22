import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, FileText, ChevronRight, X } from 'lucide-react';

interface SebiComplianceBannerProps {
  onOpenDocModal: () => void;
}

export const SebiComplianceBanner: React.FC<SebiComplianceBannerProps> = ({ onOpenDocModal }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <div className="bg-amber-950/40 border-b border-amber-900/50 px-4 py-1 flex items-center justify-between text-[11px] text-amber-300/90 font-mono">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          <span>SEBI MANDATORY RISK DISCLOSURE: Derivatives trading carries extreme risk of capital loss. Strictly educational.</span>
        </div>
        <button
          onClick={onOpenDocModal}
          className="text-amber-200 underline hover:text-white flex items-center gap-1"
        >
          View Documentation <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-b border-amber-500/40 px-4 py-2 text-xs">
      <div className="max-w-[1720px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                SEBI Regulatory Compliance &amp; Mandatory Risk Disclosure
              </span>
              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold border border-rose-500/30">
                NO गॅरंटी (ZERO GUARANTEES) • PROBABILITIES IN % ONLY
              </span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed mt-0.5">
              <strong className="text-amber-200 font-semibold">Strictly for educational &amp; research purposes only.</strong> We are <span className="underline decoration-amber-400">NOT a SEBI-registered broker</span> and <span className="underline decoration-amber-400">NOT a SEBI-registered Research Analyst or Investment Advisor (RIA)</span>. Users must consult a certified financial advisor before taking real market positions.
              <span className="hidden sm:inline text-amber-200/90 font-mono ml-1.5">
                (SEBI Study: 9 out of 10 individual traders in equity F&amp;O incurred net losses, averaging ₹50,000+ loss per trader).
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
          <button
            onClick={onOpenDocModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/40 transition"
          >
            <FileText className="h-3.5 w-3.5 text-amber-400" />
            Compliance Docs
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Minimize Banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
