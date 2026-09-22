import React, { useState } from 'react';
import {
  Bell,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Radio,
  Sliders,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';

interface PriceAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSymbol?: string;
  defaultPrice?: number;
}

export const PriceAlertsModal: React.FC<PriceAlertsModalProps> = ({
  isOpen,
  onClose,
  defaultSymbol,
  defaultPrice,
}) => {
  const { tickers, alerts, addAlert, removeAlert } = useTrading();

  const [symbol, setSymbol] = useState(defaultSymbol || 'NIFTY 50');
  const [condition, setCondition] = useState<'>=' | '<='>('>=');
  const [targetPrice, setTargetPrice] = useState(defaultPrice || 24900);
  const [note, setNote] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  React.useEffect(() => {
    if (defaultSymbol) setSymbol(defaultSymbol);
    if (defaultPrice) setTargetPrice(defaultPrice);
  }, [defaultSymbol, defaultPrice]);

  if (!isOpen) return null;

  const currentTicker = tickers.find(t => t.symbol === symbol);

  const handleRequestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);
    }
  };

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPrice || targetPrice <= 0) return;

    addAlert({
      symbol,
      targetPrice: Number(targetPrice),
      condition,
      note: note || `Alert when ${symbol} ${condition} ₹${targetPrice}`,
    });

    setNote('');
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-amber-500/20 text-amber-400">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Price Alerts &amp; Push Notifications</h3>
              <p className="text-[11px] text-slate-400">Real-time alerts with sound chime and push notifications</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs font-mono">
          {/* Native Web Push Notification Permission Pill */}
          <div className="p-3 rounded-xl bg-[#090d16] border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-200 block">Browser Push Notifications</span>
              <span className="text-[10px] text-slate-500">
                Status: {permissionStatus === 'granted' ? 'Enabled (Active)' : 'Requires Permission'}
              </span>
            </div>
            {permissionStatus !== 'granted' && (
              <button
                onClick={handleRequestPushPermission}
                className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold transition"
              >
                Enable Push
              </button>
            )}
          </div>

          {/* Create Alert Form */}
          <form onSubmit={handleCreateAlert} className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="font-bold text-slate-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-cyan-400" />
              Set New Alert
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Symbol</label>
                <select
                  value={symbol}
                  onChange={e => {
                    setSymbol(e.target.value);
                    const matched = tickers.find(t => t.symbol === e.target.value);
                    if (matched) setTargetPrice(matched.ltp);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-bold focus:outline-none focus:border-cyan-500/60"
                >
                  {tickers.map(t => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-1">
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Condition</label>
                <select
                  value={condition}
                  onChange={e => setCondition(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-bold focus:outline-none focus:border-cyan-500/60"
                >
                  <option value=">=">&gt;= (Greater / Equal)</option>
                  <option value="<=">&lt;= (Less / Equal)</option>
                </select>
              </div>

              <div className="col-span-1">
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Target Price (₹)</label>
                <input
                  type="number"
                  step="0.05"
                  value={targetPrice}
                  onChange={e => setTargetPrice(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-bold focus:outline-none focus:border-cyan-500/60"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Alert Note / Tag</label>
              <input
                type="text"
                placeholder="e.g., Breakout retest level, take partial profit"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-md"
            >
              + Activate Price Alert
            </button>
          </form>

          {/* Active Alerts List */}
          <div>
            <div className="font-bold text-slate-300 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Active Alerts ({alerts.length})</span>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {alerts.length === 0 ? (
                <div className="text-center py-6 text-slate-500">No active price alerts.</div>
              ) : (
                alerts.map(a => {
                  const ticker = tickers.find(t => t.symbol === a.symbol);
                  return (
                    <div
                      key={a.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between transition ${
                        a.triggered
                          ? 'bg-slate-900/50 border-slate-800 opacity-60'
                          : 'bg-slate-900 border-slate-700/80'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{a.symbol}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-amber-300 font-bold border border-amber-500/30">
                            {a.condition} ₹{a.targetPrice.toFixed(2)}
                          </span>
                          {a.triggered && (
                            <span className="text-[10px] px-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                              TRIGGERED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {a.note || 'Target price alert'} • Current: ₹{ticker?.ltp.toFixed(2) || '---'}
                        </div>
                      </div>

                      <button
                        onClick={() => removeAlert(a.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition"
                        title="Delete Alert"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
