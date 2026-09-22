import React, { useState } from 'react';
import {
  TrendingUp,
  ShieldAlert,
  Bell,
  Volume2,
  VolumeX,
  Code2,
  Lock,
  Clock,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Radio,
  FileText,
  Zap,
  RefreshCw,
  Shield,
  User,
  Sparkles,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';

interface NavbarProps {
  onOpenBrokerAuth: () => void;
  onOpenDeveloperModal: () => void;
  onOpenSubscriptionModal: () => void;
  onOpenAlertsModal: () => void;
  onOpenSebiDocModal: () => void;
  onOpenAuthModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenBrokerAuth,
  onOpenDeveloperModal,
  onOpenSubscriptionModal,
  onOpenAlertsModal,
  onOpenSebiDocModal,
  onOpenAuthModal,
}) => {
  const {
    tickers,
    activeSymbol,
    setActiveSymbol,
    brokerConnected,
    brokerName,
    brokerMode,
    setBrokerMode,
    subscription,
    alerts,
    notifications,
    markNotificationRead,
    clearAllNotifications,
    soundEnabled,
    setSoundEnabled,
    simulationEnabled,
    setSimulationEnabled,
    refreshLiveQuotes,
    tickFlashMap,
    lastTickTime,
    userSession,
    isAdmin,
    isDemoUser,
  } = useTrading();

  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const activeAlertsCount = alerts.filter(a => !a.triggered).length;

  // Major benchmark, MCX commodities, and global indices for top marquee ticker tape
  const tapeSymbols = [
    'NIFTY 50',
    'BANKNIFTY',
    'FINNIFTY',
    'MIDCPNIFTY',
    'SENSEX',
    'BANKEX',
    'CRUDEOIL',
    'NATURALGAS',
    'GOLD',
    'SILVER',
    'COPPER',
    'ZINC',
    'INDIA VIX',
    'GIFT NIFTY',
    'RELIANCE',
    'HDFCBANK',
    'INFY',
    'TCS',
    'S&P 500',
    'NASDAQ 100',
    'DOW JONES',
  ];
  const tapeTickers = tapeSymbols
    .map(sym => tickers.find(t => t.symbol.toUpperCase() === sym.toUpperCase()))
    .filter((t): t is typeof tickers[0] => Boolean(t));

  return (
    <header className="sticky top-0 z-40 bg-[#090e1a]/95 backdrop-blur-md border-b border-slate-800/80">
      {/* Top Ticker Tape */}
      <div className="bg-[#060a12] border-b border-slate-800/60 px-3 py-1.5 flex items-center gap-3 text-xs font-mono overflow-hidden">
        <div className="flex items-center gap-2 shrink-0 z-10 bg-[#060a12] pr-2 border-r border-slate-800/80">
          <button
            type="button"
            onClick={() => setSimulationEnabled(!simulationEnabled)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold text-[10px] tracking-wider uppercase transition cursor-pointer ${
              simulationEnabled
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-950'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
            title={simulationEnabled ? 'Live streaming feed active. Click to pause.' : 'Live streaming paused. Click to resume.'}
          >
            <span className="relative flex h-2 w-2">
              {simulationEnabled && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${simulationEnabled ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
            </span>
            <span>{simulationEnabled ? 'ALL INDICES LIVE' : 'FEED PAUSED'}</span>
          </button>
        </div>

        {/* Smooth Scrolling Ticker Loop Container */}
        <div className="flex-1 overflow-hidden relative">
          <div className="animate-marquee-tape flex items-center gap-4">
            {[...tapeTickers, ...tapeTickers].map((ticker, index) => {
              const isPositive = ticker.change >= 0;
              const flash = tickFlashMap[ticker.symbol];
              const isSelected = activeSymbol === ticker.symbol;

              return (
                <button
                  key={`${ticker.symbol}-${index}`}
                  onClick={() => setActiveSymbol(ticker.symbol)}
                  className={`flex items-center gap-2 px-2.5 py-1 rounded transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-slate-800 text-cyan-300 ring-1 ring-cyan-500/60 font-semibold'
                      : flash === 'UP'
                      ? 'bg-emerald-950/70 ring-1 ring-emerald-500/60'
                      : flash === 'DOWN'
                      ? 'bg-rose-950/70 ring-1 ring-rose-500/60'
                      : 'hover:bg-slate-800/50 bg-slate-900/40'
                  }`}
                >
                  <span className="text-slate-300 font-bold">{ticker.symbol}</span>
                  <span className={`font-bold transition-colors ${
                    flash === 'UP' ? 'text-emerald-300' : flash === 'DOWN' ? 'text-rose-300' : 'text-white'
                  }`}>
                    {ticker.currency === 'USD' ? '$' : '₹'}
                    {ticker.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1 py-0.2 rounded flex items-center ${
                      isPositive
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {ticker.changePercent.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Status & Quick Refresh Controls */}
        <div className="flex items-center gap-2 ml-auto shrink-0 pr-1">
          <button
            type="button"
            onClick={() => refreshLiveQuotes()}
            className="p-1 px-2.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-[10px] font-mono cursor-pointer border border-slate-700"
            title="Force refresh all authentic index quotes"
          >
            <RefreshCw className="h-2.5 w-2.5 text-cyan-400" />
            <span>Sync All</span>
          </button>
        </div>
      </div>

      {/* Main Header Row */}
      <div className="max-w-[1720px] mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Brand & Market Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white font-mono">
                  CHANAKYA<span className="text-cyan-400">.PRO</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 uppercase">
                  F&amp;O TERMINAL
                </span>
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <span className="text-emerald-400 flex items-center gap-1">
                  <Radio className="h-2.5 w-2.5 animate-pulse" />
                  Angel One SmartAPI Live Feed
                </span>
                <span>•</span>
                <span className="text-slate-400">Probabilistic Analytics Engine</span>
              </div>
            </div>
          </div>

          {/* SEBI Compliance Tag */}
          <button
            onClick={onOpenSebiDocModal}
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/20 transition group"
            title="Click to view strict SEBI regulatory compliance documentation and risk disclosures"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">Strict SEBI Guidelines Compliant</span>
            <span className="text-[10px] text-amber-400/80 underline decoration-dotted ml-1">Educational Only</span>
          </button>
        </div>

        {/* Center/Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sound alert toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg border text-xs transition ${
              soundEnabled
                ? 'border-slate-700 bg-slate-800/80 text-cyan-400 hover:bg-slate-700'
                : 'border-slate-800 bg-slate-900 text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Trading Sound Chime Enabled' : 'Trading Sound Muted'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* Price Alerts Trigger Button */}
          <button
            onClick={onOpenAlertsModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-xs font-medium text-slate-200 transition"
          >
            <Bell className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden md:inline">Price Alerts</span>
            {activeAlertsCount > 0 && (
              <span className="h-4 w-4 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center justify-center border border-amber-500/50">
                {activeAlertsCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 transition"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-[#0f172a] border border-slate-700 shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-white">System &amp; Trade Alerts</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <button
                    onClick={clearAllNotifications}
                    className="text-[11px] text-slate-400 hover:text-white"
                  >
                    Clear All
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 mt-2">
                  {notifications.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500">No active notifications</div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-2.5 rounded-lg border transition text-xs cursor-pointer ${
                          n.read
                            ? 'bg-slate-900/50 border-slate-800/80 text-slate-400'
                            : 'bg-slate-800/90 border-cyan-500/30 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold mb-1">
                          <span className="text-cyan-300 flex items-center gap-1.5">
                            {n.type === 'ALERT' ? (
                              <AlertTriangle className="h-3 w-3 text-amber-400" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            )}
                            {n.title}
                          </span>
                          <span className="text-[10px] text-slate-400">{n.timestamp}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-300">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Role-Specific Controls */}
          {isDemoUser ? (
            <>
              {/* Demo User Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/70 border border-blue-500/40 text-blue-300 text-xs font-mono">
                <User className="h-3.5 w-3.5 text-blue-400" />
                <span className="font-bold">{userSession.name || 'Demo User'}</span>
                <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-200">
                  Index Signals Only
                </span>
              </div>

              {/* Admin Login Button */}
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/70 bg-gradient-to-r from-amber-500/20 to-amber-600/30 hover:from-amber-500/30 hover:to-amber-600/40 text-amber-300 text-xs font-bold transition shadow-sm cursor-pointer"
                title="Login with Administrator credentials for full terminal access"
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                <span>Admin Login</span>
              </button>
            </>
          ) : (
            <>
              {/* Administrator Unlimited Pro Badge */}
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/60 bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 text-amber-300 hover:border-amber-400 text-xs font-bold transition shadow-md shadow-amber-950/40 cursor-pointer"
                title="Administrator Session: Unlimited Pro Trial Active. Click to manage."
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                <span>Admin: DCP Studio</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 font-mono font-bold">
                  👑 UNLIMITED
                </span>
              </button>

              {/* Paper / Live Broker Execution Mode Toggle Switch */}
              <div
                id="navbar-broker-mode-toggle"
                className="flex items-center bg-[#070c18] p-1 rounded-lg border border-slate-700/90 font-mono shadow-inner"
                title="Toggle between Virtual Paper Trading and Live Angel One Broker Orders"
              >
                <button
                  type="button"
                  onClick={() => setBrokerMode('PAPER')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    brokerMode === 'PAPER'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/60 shadow-md shadow-emerald-950/80'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Paper Trade</span>
                  <span className="hidden xl:inline text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-normal">
                    Virtual ₹2.45L
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!brokerConnected) {
                      onOpenBrokerAuth();
                    } else {
                      setBrokerMode('ANGELONE');
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                    brokerMode === 'ANGELONE'
                      ? 'bg-rose-950 text-rose-300 border border-rose-500/60 shadow-md shadow-rose-950/80'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className={`h-3.5 w-3.5 ${brokerMode === 'ANGELONE' ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
                  <span>Live Broker</span>
                  <span className="hidden xl:inline text-[9px] px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-300 font-normal">
                    Angel One
                  </span>
                </button>
              </div>

              {/* Broker Connection & Auto-TOTP Pill */}
              <button
                onClick={onOpenBrokerAuth}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                  brokerConnected
                    ? 'border-cyan-500/50 bg-cyan-950/50 text-cyan-300 hover:bg-cyan-900/50'
                    : 'border-amber-500/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40'
                }`}
                title="Angel One SmartAPI Auto-TOTP & MPIN Session"
              >
                <span className={`h-2 w-2 rounded-full ${brokerConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="hidden sm:inline font-mono">
                  {brokerConnected ? 'SmartAPI: Connected' : 'Connect SmartAPI'}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[10px] font-mono text-cyan-400 border border-cyan-500/30">
                  Auto-TOTP
                </span>
              </button>

              {/* Developer Option Button */}
              <button
                onClick={onOpenDeveloperModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/40 text-xs font-semibold transition cursor-pointer"
                title="Developer Settings & Audit Trail Logs"
              >
                <Code2 className="h-3.5 w-3.5 text-indigo-400" />
                <span className="hidden md:inline">Dev Options</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
