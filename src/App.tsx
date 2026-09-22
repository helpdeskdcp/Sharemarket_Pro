import React, { useState } from 'react';
import { TradingProvider, useTrading } from './context/TradingContext';
import { Navbar } from './components/Navbar';
import { SebiComplianceBanner } from './components/SebiComplianceBanner';
import { Watchlist } from './components/Watchlist';
import { TradingChart } from './components/TradingChart';
import { OptionChain } from './components/OptionChain';
import { AiStrategyEngine } from './components/AiStrategyEngine';
import { MarketSentimentGauge } from './components/MarketSentimentGauge';
import { GlobalMarketMacro } from './components/GlobalMarketMacro';
import { PortfolioView } from './components/PortfolioView';
import { OrderExecutionModal } from './components/OrderExecutionModal';
import { PriceAlertsModal } from './components/PriceAlertsModal';
import { BrokerAuthModal } from './components/BrokerAuthModal';
import { DeveloperSettingsModal } from './components/DeveloperSettingsModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { SebiDocumentationModal } from './components/SebiDocumentationModal';
import { PriceActionSignalsDashboard } from './components/PriceActionSignalsDashboard';
import { PerformanceAnalytics } from './components/PerformanceAnalytics';
import {
  LayoutDashboard,
  Layers,
  BrainCircuit,
  Briefcase,
  Globe,
  ShieldAlert,
  Info,
  Zap,
  BarChart3,
  LineChart,
  ListFilter,
} from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { activeSymbol, activeTicker, brokerMode, simulationEnabled } = useTrading();

  // Navigation tab for center stage
  const [mainView, setMainView] = useState<
    'PRICE_ACTION' | 'PERFORMANCE' | 'WATCHLIST' | 'CHARTS' | 'FO_CHAIN' | 'AI_STRATEGY' | 'PORTFOLIO' | 'GLOBAL' | 'OVERVIEW'
  >('PRICE_ACTION');

  // Modal states
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderParams, setOrderParams] = useState<{
    symbol?: string;
    side?: 'BUY' | 'SELL';
    price?: number;
  }>({});

  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [alertParams, setAlertParams] = useState<{
    symbol?: string;
    price?: number;
  }>({});

  const [brokerModalOpen, setBrokerModalOpen] = useState(false);
  const [developerModalOpen, setDeveloperModalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [sebiDocModalOpen, setSebiDocModalOpen] = useState(false);

  // Quick order handler
  const handleQuickOrder = (symbol: string, side: 'BUY' | 'SELL', price?: number) => {
    setOrderParams({ symbol, side, price });
    setOrderModalOpen(true);
  };

  // Quick alert handler
  const handleOpenAlert = (symbol: string, price: number) => {
    setAlertParams({ symbol, price });
    setAlertsModalOpen(true);
  };

  // Option trade selection from Option Chain
  const handleSelectOptionTrade = (
    symbol: string,
    strike: number,
    type: 'CE' | 'PE',
    price: number
  ) => {
    const formattedSymbol = `${symbol} ${strike} ${type}`;
    setOrderParams({
      symbol: formattedSymbol,
      side: 'BUY',
      price,
    });
    setOrderModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        onOpenBrokerAuth={() => setBrokerModalOpen(true)}
        onOpenDeveloperModal={() => setDeveloperModalOpen(true)}
        onOpenSubscriptionModal={() => setSubscriptionModalOpen(true)}
        onOpenAlertsModal={() => setAlertsModalOpen(true)}
        onOpenSebiDocModal={() => setSebiDocModalOpen(true)}
      />

      {/* Mandatory SEBI Compliance Ribbon */}
      <SebiComplianceBanner onOpenDocModal={() => setSebiDocModalOpen(true)} />

      {/* Main Workspace Navigation Bar */}
      <div className="bg-[#090d18] border-b border-slate-800/80 px-4 py-1.5 sticky top-0 z-30 shadow-md">
        <div className="max-w-[1720px] mx-auto flex items-center justify-between overflow-x-auto scrollbar-none gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {/* 1. Price Action Strategy Engine */}
            <button
              onClick={() => setMainView('PRICE_ACTION')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'PRICE_ACTION'
                  ? 'bg-amber-950/90 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-900/30'
                  : 'text-amber-400/90 hover:text-amber-200 hover:bg-amber-950/40 border border-transparent'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
              Price Action Signals (1-4/Day)
            </button>

            {/* 2. Performance Analytics */}
            <button
              onClick={() => setMainView('PERFORMANCE')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'PERFORMANCE'
                  ? 'bg-indigo-950/90 text-indigo-300 border border-indigo-500/50 shadow-sm shadow-indigo-900/30'
                  : 'text-indigo-400/90 hover:text-indigo-200 hover:bg-indigo-950/40 border border-transparent'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
              Performance Analytics
            </button>

            {/* 3. Dedicated Separate Watchlist Page */}
            <button
              onClick={() => setMainView('WATCHLIST')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'WATCHLIST'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-sm shadow-cyan-900/30'
                  : 'text-cyan-400/90 hover:text-cyan-200 hover:bg-cyan-950/40 border border-transparent'
              }`}
            >
              <ListFilter className="h-3.5 w-3.5 text-cyan-400" />
              Watchlist Page
            </button>

            {/* 4. Technical Chart */}
            <button
              onClick={() => setMainView('CHARTS')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'CHARTS'
                  ? 'bg-teal-950/90 text-teal-300 border border-teal-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <LineChart className="h-3.5 w-3.5 text-teal-400" />
              Technical Chart
            </button>

            {/* 5. F&O Options Matrix */}
            <button
              onClick={() => setMainView('FO_CHAIN')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'FO_CHAIN'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              F&amp;O Options Matrix
            </button>

            {/* 6. AI Strategy Engine */}
            <button
              onClick={() => setMainView('AI_STRATEGY')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'AI_STRATEGY'
                  ? 'bg-indigo-950/90 text-indigo-300 border border-indigo-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <BrainCircuit className="h-3.5 w-3.5 text-indigo-400" />
              AI Strategy Engine
            </button>

            {/* 7. Portfolio & Orders */}
            <button
              onClick={() => setMainView('PORTFOLIO')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'PORTFOLIO'
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 text-emerald-400" />
              Portfolio &amp; Orders
            </button>

            {/* 8. Angel One Global Macro */}
            <button
              onClick={() => setMainView('GLOBAL')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'GLOBAL'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Global Macro
            </button>

            {/* 9. Terminal Overview */}
            <button
              onClick={() => setMainView('OVERVIEW')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                mainView === 'OVERVIEW'
                  ? 'bg-slate-800 text-cyan-300 border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Overview
            </button>
          </div>

          <div className="hidden xl:flex items-center gap-2.5 text-[11px] font-mono text-slate-400 shrink-0">
            <span>Symbol: <strong className="text-white">{activeSymbol}</strong></span>
            <span>•</span>
            <span>Mode: <strong className={brokerMode === 'PAPER' ? 'text-emerald-400' : 'text-rose-400 font-bold'}>{brokerMode === 'PAPER' ? 'Paper (Virtual)' : 'Angel One Live'}</strong></span>
            <span>•</span>
            <span className="text-cyan-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
              Real Exchange Feed
            </span>
          </div>
        </div>
      </div>

      {/* Main Full-Width Workspace Container */}
      <main className="max-w-[1720px] w-full mx-auto p-3 sm:p-4 flex-1">
        <div className="w-full space-y-4">
          {/* View 1: Price Action Strategy & Signals Engine (Main / Hero View) */}
          {mainView === 'PRICE_ACTION' && (
            <div className="space-y-4">
              <PriceActionSignalsDashboard />
              <TradingChart
                onQuickOrder={handleQuickOrder}
                onOpenAlertModal={handleOpenAlert}
              />
            </div>
          )}

          {/* View 2: Performance Analytics Dashboard (Pristine, Zero Duplicates) */}
          {mainView === 'PERFORMANCE' && (
            <div className="space-y-4">
              <PerformanceAnalytics />
            </div>
          )}

          {/* View 3: Dedicated Watchlist Full Page */}
          {mainView === 'WATCHLIST' && (
            <Watchlist
              fullPageMode={true}
              onQuickOrder={handleQuickOrder}
            />
          )}

          {/* View 4: Dedicated Technical Chart */}
          {mainView === 'CHARTS' && (
            <div className="space-y-4">
              <TradingChart
                onQuickOrder={handleQuickOrder}
                onOpenAlertModal={handleOpenAlert}
              />
            </div>
          )}

          {/* View 5: F&O Options Matrix */}
          {mainView === 'FO_CHAIN' && (
            <div className="space-y-4">
              <OptionChain onSelectOptionTrade={handleSelectOptionTrade} />
            </div>
          )}

          {/* View 6: AI Strategy Lab */}
          {mainView === 'AI_STRATEGY' && (
            <div className="space-y-4">
              <MarketSentimentGauge onExploreStrategy={() => setMainView('AI_STRATEGY')} />
              <AiStrategyEngine />
            </div>
          )}

          {/* View 7: Portfolio & Orders */}
          {mainView === 'PORTFOLIO' && (
            <div className="space-y-4">
              <PortfolioView />
            </div>
          )}

          {/* View 8: Global Markets */}
          {mainView === 'GLOBAL' && (
            <div className="space-y-4">
              <GlobalMarketMacro />
            </div>
          )}

          {/* View 9: Terminal Overview */}
          {mainView === 'OVERVIEW' && (
            <div className="space-y-4">
              <MarketSentimentGauge onExploreStrategy={() => setMainView('AI_STRATEGY')} />
              <PriceActionSignalsDashboard />
              <TradingChart
                onQuickOrder={handleQuickOrder}
                onOpenAlertModal={handleOpenAlert}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer Disclaimer & Regulatory Seals */}
      <footer className="bg-[#050810] border-t border-slate-800/80 py-4 px-4 text-xs font-mono text-slate-500">
        <div className="max-w-[1720px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            <span>
              <strong>Regulatory Notice:</strong> Strictly for educational, research, and algorithmic simulation purposes. We are not a SEBI-registered broker or financial advisor. No guarantees (गॅरंटी) provided.
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <button
              onClick={() => setSebiDocModalOpen(true)}
              className="hover:text-amber-300 underline"
            >
              SEBI Disclosures
            </button>
            <span>•</span>
            <button
              onClick={() => setBrokerModalOpen(true)}
              className="hover:text-cyan-300 underline"
            >
              Angel One SmartAPI
            </button>
            <span>•</span>
            <button
              onClick={() => setDeveloperModalOpen(true)}
              className="hover:text-indigo-300 underline"
            >
              Developer Audit Registry
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <OrderExecutionModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        defaultSymbol={orderParams.symbol}
        defaultSide={orderParams.side}
        defaultPrice={orderParams.price}
      />

      <PriceAlertsModal
        isOpen={alertsModalOpen}
        onClose={() => setAlertsModalOpen(false)}
        defaultSymbol={alertParams.symbol}
        defaultPrice={alertParams.price}
      />

      <BrokerAuthModal
        isOpen={brokerModalOpen}
        onClose={() => setBrokerModalOpen(false)}
      />

      <DeveloperSettingsModal
        isOpen={developerModalOpen}
        onClose={() => setDeveloperModalOpen(false)}
      />

      <SubscriptionModal
        isOpen={subscriptionModalOpen}
        onClose={() => setSubscriptionModalOpen(false)}
      />

      <SebiDocumentationModal
        isOpen={sebiDocModalOpen}
        onClose={() => setSebiDocModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <TradingProvider>
      <DashboardContent />
    </TradingProvider>
  );
}
