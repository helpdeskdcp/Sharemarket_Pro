import React, { useState } from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  Layers,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Target,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';

export const PortfolioView: React.FC = () => {
  const {
    cashBalance,
    usedMargin,
    availableMargin,
    positions,
    holdings,
    orders,
    cancelOrder,
    squareOffPosition,
    squareOffAll,
    brokerMode,
    setBrokerMode,
    gttOrders,
    cancelGttOrder,
  } = useTrading();

  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'HOLDINGS' | 'ORDERS' | 'GTT'>('POSITIONS');

  // Total Portfolio Calculations
  const totalHoldingsValue = holdings.reduce((sum, h) => sum + h.curVal, 0);
  const totalHoldingsPnl = holdings.reduce((sum, h) => sum + h.totalPnl, 0);
  const totalPositionsPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalNetWorth = cashBalance + totalHoldingsValue + totalPositionsPnl;

  return (
    <div className="bg-[#0b101d] rounded-xl border border-slate-800/90 flex flex-col overflow-hidden">
      {/* Portfolio Header & Metrics Cards */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-emerald-500/20 text-emerald-400">
              <Briefcase className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-xs uppercase tracking-wider text-white">
                Portfolio &amp; Capital Analytics
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-400 font-mono">Routing:</span>
                <button
                  type="button"
                  onClick={() => setBrokerMode(brokerMode === 'PAPER' ? 'ANGELONE' : 'PAPER')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition cursor-pointer flex items-center gap-1 ${
                    brokerMode === 'PAPER'
                      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/90'
                      : 'bg-rose-950/90 text-rose-300 border-rose-500/50 hover:bg-rose-900/90'
                  }`}
                  title="Click to toggle between Paper and Live mode"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${brokerMode === 'PAPER' ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
                  <span>{brokerMode === 'PAPER' ? 'Paper (Virtual ₹2.45L)' : 'Live (Angel One SmartAPI)'}</span>
                </button>
              </div>
            </div>
          </div>

          {positions.length > 0 && (
            <button
              onClick={squareOffAll}
              className="px-3 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs font-mono tracking-wider transition shadow-sm"
              title="Square off all active open intraday/derivative positions"
            >
              Square Off All ({positions.length})
            </button>
          )}
        </div>

        {/* Capital Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase">Total Portfolio Value</span>
            <span className="font-extrabold text-sm text-white">
              ₹{totalNetWorth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase">Available Margin</span>
            <span className="font-extrabold text-sm text-emerald-400">
              ₹{availableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-500 block">5x Intraday Leverage</span>
          </div>

          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase">Open Positions P&amp;L</span>
            <span
              className={`font-extrabold text-sm flex items-center gap-1 ${
                totalPositionsPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalPositionsPnl >= 0 ? '+' : ''}₹
              {totalPositionsPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-500 block">Live Ticking</span>
          </div>

          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800">
            <span className="text-[10px] text-slate-400 block uppercase">Holdings Returns</span>
            <span
              className={`font-extrabold text-sm flex items-center gap-1 ${
                totalHoldingsPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalHoldingsPnl >= 0 ? '+' : ''}₹
              {totalHoldingsPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-500 block">Delivery Equity</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-4 border-b border-slate-800 pb-0">
          <button
            onClick={() => setActiveTab('POSITIONS')}
            className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'POSITIONS'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Positions
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px]">
              {positions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('HOLDINGS')}
            className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'HOLDINGS'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Holdings
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px]">
              {holdings.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'ORDERS'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Orders Book
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px]">
              {orders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('GTT')}
            className={`pb-2 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'GTT'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            GTT &amp; Trailing SL
            <span className="px-1.5 py-0.2 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/60 text-[10px]">
              {gttOrders.filter(g => g.status === 'ACTIVE').length}
            </span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[380px]">
        {activeTab === 'POSITIONS' && (
          <table className="w-full text-xs font-mono text-left">
            <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Instrument</th>
                <th className="py-2 px-3">Product</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3 text-right">Avg Price</th>
                <th className="py-2 px-3 text-right">LTP</th>
                <th className="py-2 px-3 text-right">P&amp;L (₹)</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No active open positions. Place an order or execute a strategy to begin.
                  </td>
                </tr>
              ) : (
                positions.map(pos => {
                  const isProfit = pos.pnl >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] ${
                              pos.side === 'BUY'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {pos.side}
                          </span>
                          {pos.symbol}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] border border-slate-700">
                          {pos.product}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white">
                        {pos.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        ₹{pos.avgPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white">
                        ₹{pos.currentPrice.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-extrabold ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfit ? '+' : ''}₹{pos.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        <span className="text-[10px] block font-normal">
                          ({isProfit ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => squareOffPosition(pos.id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-300 text-[11px] font-semibold border border-slate-700 transition"
                        >
                          Square Off
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'HOLDINGS' && (
          <table className="w-full text-xs font-mono text-left">
            <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Company</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3 text-right">Avg Cost</th>
                <th className="py-2 px-3 text-right">LTP</th>
                <th className="py-2 px-3 text-right">Current Value</th>
                <th className="py-2 px-3 text-right">Total P&amp;L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {holdings.map(h => {
                const isProfit = h.totalPnl >= 0;
                return (
                  <tr key={h.symbol} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">{h.symbol}</div>
                      <div className="text-[10px] text-slate-400">{h.name}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">{h.quantity}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">₹{h.avgCost.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">₹{h.ltp.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">
                      ₹{h.curVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-extrabold ${
                        isProfit ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isProfit ? '+' : ''}₹{h.totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      <span className="text-[10px] block font-normal">
                        ({isProfit ? '+' : ''}{h.totalPnlPercent.toFixed(2)}%)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {activeTab === 'ORDERS' && (
          <table className="w-full text-xs font-mono text-left">
            <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Time</th>
                <th className="py-2 px-3">Order ID</th>
                <th className="py-2 px-3">Symbol</th>
                <th className="py-2 px-3">Side</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3 text-right">Qty</th>
                <th className="py-2 px-3 text-right">Price</th>
                <th className="py-2 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2 px-3 text-slate-400 text-[11px]">{o.timestamp}</td>
                  <td className="py-2 px-3 text-slate-300 font-bold">{o.id}</td>
                  <td className="py-2 px-3 text-white font-bold">{o.symbol}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                        o.side === 'BUY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {o.side}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400">{o.type}</td>
                  <td className="py-2 px-3 text-right font-bold text-white">{o.quantity}</td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    ₹{(o.executedPrice || o.price).toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        o.status === 'EXECUTED'
                          ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60'
                          : o.status === 'PENDING'
                          ? 'bg-amber-950/70 text-amber-300 border border-amber-700/60'
                          : 'bg-rose-950/70 text-rose-300 border border-rose-700/60'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'GTT' && (
          <div>
            {gttOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                <Target className="h-8 w-8 mx-auto mb-2 text-slate-600 opacity-60" />
                <p className="font-bold text-slate-400">No Good-Till-Triggered (GTT) Orders Active</p>
                <p className="text-[11px] mt-1 text-slate-500">
                  Place a GTT order with Trailing Stop Loss from the Order Window to automate target profit exits.
                </p>
              </div>
            ) : (
              <table className="w-full text-xs font-mono text-left">
                <thead className="bg-[#090d16] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3">Side / Type</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Trigger Price</th>
                    <th className="py-2 px-3 text-right">Limit Price</th>
                    <th className="py-2 px-3 text-right">Trailing SL</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-center">Mode</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {gttOrders.map(g => (
                    <tr key={g.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <Target className="h-3 w-3 text-amber-400" />
                          <span>{g.symbol}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 block">ID: {g.id}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                              g.side === 'BUY'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {g.side}
                          </span>
                          <span className="text-[10px] text-slate-400">{g.product}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white">{g.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                        ₹{g.triggerPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        ₹{g.limitPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {g.trailingStopLossPoints ? (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/50 text-[10px] font-bold">
                            +{g.trailingStopLossPoints} pts
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Static</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            g.status === 'ACTIVE'
                              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/60'
                              : g.status === 'TRIGGERED'
                              ? 'bg-blue-950/70 text-blue-300 border border-blue-700/60'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {g.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            g.brokerMode === 'PAPER'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {g.brokerMode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {g.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => cancelGttOrder(g.id)}
                            className="p-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-400 border border-rose-800/60 transition cursor-pointer"
                            title="Cancel GTT Order"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
