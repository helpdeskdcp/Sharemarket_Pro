import React, { useState } from 'react';
import {
  X,
  TrendingUp,
  ShieldAlert,
  Zap,
  Info,
  CheckCircle2,
  AlertTriangle,
  Target,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSymbol?: string;
  defaultSide?: 'BUY' | 'SELL';
  defaultPrice?: number;
}

export const OrderExecutionModal: React.FC<OrderModalProps> = ({
  isOpen,
  onClose,
  defaultSymbol,
  defaultSide = 'BUY',
  defaultPrice,
}) => {
  const { tickers, placeOrder, placeGttOrder, availableMargin, brokerMode, setBrokerMode } = useTrading();

  const [symbol, setSymbol] = useState(defaultSymbol || 'NIFTY 50');
  const [side, setSide] = useState<'BUY' | 'SELL'>(defaultSide);
  const [type, setType] = useState<'MARKET' | 'LIMIT' | 'SL' | 'GTT'>('MARKET');
  const [product, setProduct] = useState<'MIS' | 'CNC' | 'NRML'>('MIS');
  const [quantity, setQuantity] = useState(50);
  const [limitPrice, setLimitPrice] = useState(defaultPrice || 24824.50);
  const [triggerPrice, setTriggerPrice] = useState(defaultPrice ? defaultPrice * 0.98 : 24320);
  const [trailingSlPoints, setTrailingSlPoints] = useState<number>(20);
  const [trailingTargetPrice, setTrailingTargetPrice] = useState<number>(defaultPrice ? defaultPrice * 1.05 : 25500);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Sync state if default props change
  React.useEffect(() => {
    if (defaultSymbol) setSymbol(defaultSymbol);
    if (defaultSide) setSide(defaultSide);
    const matchedTicker = tickers.find(t => t.symbol === defaultSymbol);
    if (matchedTicker) {
      setQuantity(matchedTicker.lotSize || 1);
      setLimitPrice(defaultPrice || matchedTicker.ltp);
      setTriggerPrice(matchedTicker.ltp * 0.98);
    }
  }, [defaultSymbol, defaultSide, defaultPrice]);

  if (!isOpen) return null;

  const currentTicker = tickers.find(t => t.symbol === symbol);
  const ltp = currentTicker ? currentTicker.ltp : limitPrice;
  const executionPrice = type === 'MARKET' ? ltp : limitPrice;
  
  // Margin calculation with 5x leverage for MIS intraday
  const leverageMultiplier = product === 'MIS' ? 0.2 : 1.0;
  const marginRequired = quantity * executionPrice * leverageMultiplier;

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSuccessNotice(null);

    if (quantity <= 0) {
      setErrorNotice('Order quantity must be greater than 0');
      return;
    }

    if (type === 'GTT') {
      const gttRes = await placeGttOrder({
        symbol,
        side,
        product,
        quantity,
        triggerPrice,
        limitPrice,
        trailingStopLossPoints: trailingSlPoints > 0 ? trailingSlPoints : undefined,
        trailingTargetPrice: trailingTargetPrice > 0 ? trailingTargetPrice : undefined,
      });

      if (gttRes.success) {
        setSuccessNotice(`GTT armed! Automated trigger at ₹${triggerPrice} with ${trailingSlPoints || 0} pts Trailing SL`);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorNotice(gttRes.message);
      }
      return;
    }

    const res = placeOrder({
      symbol,
      side,
      type,
      product,
      quantity,
      price: executionPrice,
      triggerPrice: type === 'SL' ? triggerPrice : undefined,
    });

    if (res.success) {
      setSuccessNotice(`Order placed successfully! ID: ${res.orderId}`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorNotice(res.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header with Side Color Accent */}
        <div
          className={`p-4 flex items-center justify-between text-white ${
            side === 'BUY' ? 'bg-emerald-950/80 border-b border-emerald-800/60' : 'bg-rose-950/80 border-b border-rose-800/60'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base font-mono">{side} ORDER</span>
              <span className="text-xs px-2 py-0.5 rounded bg-black/40 font-mono font-bold">
                {symbol}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-slate-300 font-mono">
                {brokerMode}
              </span>
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              Live LTP: <span className="font-bold text-white font-mono">₹{ltp.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-black/30 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleExecute} className="p-5 space-y-4 font-mono text-xs">
          {/* Execution Environment Switcher */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${brokerMode === 'ANGELONE' ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-[11px] text-slate-300 font-medium">Order Routing:</span>
            </div>
            <div className="flex items-center gap-1 bg-black/50 p-0.5 rounded-lg border border-slate-700/80">
              <button
                type="button"
                onClick={() => setBrokerMode('PAPER')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                  brokerMode === 'PAPER'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Paper Trading
              </button>
              <button
                type="button"
                onClick={() => setBrokerMode('ANGELONE')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                  brokerMode === 'ANGELONE'
                    ? 'bg-rose-950 text-rose-300 border border-rose-500/50 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Live Angel One
              </button>
            </div>
          </div>

          {/* Side Toggle Button */}
          <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSide('BUY')}
              className={`py-2 rounded-lg font-bold transition text-center ${
                side === 'BUY'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              BUY (Long)
            </button>
            <button
              type="button"
              onClick={() => setSide('SELL')}
              className={`py-2 rounded-lg font-bold transition text-center ${
                side === 'SELL'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              SELL (Short)
            </button>
          </div>

          {/* Product Type (MIS / CNC / NRML) */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase font-semibold block mb-1.5">
              Product Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'MIS', label: 'MIS (Intraday 5x)' },
                { id: 'CNC', label: 'CNC (Delivery 1x)' },
                { id: 'NRML', label: 'NRML (F&O Carry)' },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProduct(p.id as any)}
                  className={`py-1.5 px-2 rounded-lg border text-center transition ${
                    product === p.id
                      ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Order Type (MARKET / LIMIT / SL / GTT) */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase font-semibold block mb-1.5">
              Order Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['MARKET', 'LIMIT', 'SL', 'GTT'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-1.5 px-1.5 rounded-lg border text-center transition text-[11px] ${
                    type === t
                      ? t === 'GTT'
                        ? 'bg-amber-950/80 border-amber-500 text-amber-300 font-bold'
                        : 'bg-indigo-950/80 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'GTT' ? 'GTT (TSL)' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity & Lots */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">
                Quantity (Units)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold focus:outline-none focus:border-cyan-500/60"
              />
              <div className="flex gap-1 mt-1">
                {[1, 2, 5, 10].map(multiplier => {
                  const baseLot = currentTicker?.lotSize || 25;
                  return (
                    <button
                      key={multiplier}
                      type="button"
                      onClick={() => setQuantity(baseLot * multiplier)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 hover:text-white"
                    >
                      {multiplier}x Lot
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Limit Price */}
            <div>
              <label className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">
                {type === 'GTT' ? 'Limit Price (₹)' : 'Order Price (₹)'}
              </label>
              <input
                type="number"
                step="0.05"
                disabled={type === 'MARKET'}
                value={type === 'MARKET' ? ltp : limitPrice}
                onChange={e => setLimitPrice(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold disabled:opacity-50 focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>

          {/* Trigger price if SL */}
          {type === 'SL' && (
            <div>
              <label className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">
                Trigger Price (₹)
              </label>
              <input
                type="number"
                step="0.05"
                value={triggerPrice}
                onChange={e => setTriggerPrice(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          )}

          {/* GTT Specific Inputs: Trigger & Trailing Stop Loss */}
          {type === 'GTT' && (
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                <Target className="h-3.5 w-3.5" />
                <span>Good-Till-Triggered (GTT) &amp; Trailing SL Settings</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Trigger Price (₹)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={triggerPrice}
                    onChange={e => setTriggerPrice(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                  />
                  <span className="text-[9px] text-slate-500">Order fires when LTP hits this</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Trailing SL (pts)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={trailingSlPoints}
                    onChange={e => setTrailingSlPoints(Number(e.target.value))}
                    placeholder="e.g. 25"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-bold"
                  />
                  <span className="text-[9px] text-slate-500">SL adjusts upward on profit</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Target Price (Optional ₹)</label>
                <input
                  type="number"
                  step="0.05"
                  value={trailingTargetPrice}
                  onChange={e => setTrailingTargetPrice(Number(e.target.value))}
                  placeholder="e.g. 25400"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-emerald-300 font-bold"
                />
              </div>
            </div>
          )}

          {/* Margin Calculation Summary */}
          <div className="p-3 rounded-xl bg-[#090d16] border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 uppercase block">Required Margin</span>
              <span className="font-extrabold text-sm text-cyan-300">
                ₹{marginRequired.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase block">Available Margin</span>
              <span className="font-bold text-xs text-slate-300">
                ₹{availableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Error or Success Alerts */}
          {errorNotice && (
            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {successNotice && (
            <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className={`w-full py-3 rounded-xl font-extrabold text-sm tracking-wider uppercase transition shadow-lg ${
              side === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
            }`}
          >
            Confirm {side} Order ({brokerMode})
          </button>

          {/* SEBI Compliance Footnote */}
          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            Order placement routes directly via {brokerMode} engine conforming to SEBI circuit limit and margin requirements.
          </p>
        </form>
      </div>
    </div>
  );
};
