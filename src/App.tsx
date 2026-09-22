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
import {
  LayoutDashboard,
  Layers,
  BrainCircuit,
  Briefcase,
  Globe,
  ShieldAlert,
  Info,
} from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { activeSymbol, activeTicker, brokerMode, simulationEnabled } = useTrading();

  // Navigation tab for center stage
  const [mainView, setMainView] = useState<'OVERVIEW' | 'FO_CHAIN' | 'AI_STRATEGY' | 'PORTFOLIO' | 'GLOBAL'>('OVERVIEW');

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
      <div className="bg-[#090d18] border-b border-slate-800/80 px-4 py-1.5">
        <div className="max-w-[1720px] mx-auto flex items-center justify-between overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMainView('OVERVIEW')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap ${
                mainView === 'OVERVIEW'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Terminal Overview
            </button>

            <button
              onClick={() => setMainView('FO_CHAIN')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap ${
                mainView === 'FO_CHAIN'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              F&amp;O Options Matrix
            </button>

            <button
              onClick={() => setMainView('AI_STRATEGY')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap ${
                mainView === 'AI_STRATEGY'
                  ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <BrainCircuit className="h-3.5 w-3.5 text-indigo-400" />
              AI Strategy Engine (% Prob)
            </button>

            <button
              onClick={() => setMainView('PORTFOLIO')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap ${
                mainView === 'PORTFOLIO'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 text-emerald-400" />
              Portfolio &amp; Orders
            </button>

            <button
              onClick={() => setMainView('GLOBAL')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition whitespace-nowrap ${
                mainView === 'GLOBAL'
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Angel One Global Macro
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span>Active: <strong className="text-white">{activeSymbol}</strong></span>
            <span>•</span>
            <span>Mode: <strong className={brokerMode === 'PAPER' ? 'text-emerald-400' : 'text-rose-400 font-bold'}>{brokerMode === 'PAPER' ? 'Paper Trading (Virtual)' : 'Live Angel One'}</strong></span>
            <span>•</span>
            <span className="text-cyan-400">Feed: Authentic Quotes</span>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <main className="max-w-[1720px] w-full mx-auto p-3 sm:p-4 flex-1">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left Column: Watchlist (Always accessible) */}
          <div className="xl:col-span-3 h-[600px] xl:h-[calc(100vh-170px)] sticky top-[108px]">
            <Watchlist onQuickOrder={handleQuickOrder} />
          </div>

          {/* Right Column: Dynamic Workspace Content */}
          <div className="xl:col-span-9 space-y-4">
            {/* View 1: Terminal Overview (Comprehensive Full Dashboard) */}
            {mainView === 'OVERVIEW' && (
              <>
                {/* Radial D3 Market Sentiment Gauge based on AI Strategy Engine */}
                <MarketSentimentGauge onExploreStrategy={() => setMainView('AI_STRATEGY')} />

                {/* Real-time Technical Trend Chart */}
                <TradingChart
                  onQuickOrder={handleQuickOrder}
                  onOpenAlertModal={handleOpenAlert}
                />

                {/* F&O Options Trading Chain */}
                <OptionChain onSelectOptionTrade={handleSelectOptionTrade} />

                {/* World-Class AI Strategy Engine */}
                <AiStrategyEngine />

                {/* Global Markets & Macro Analysis */}
                <GlobalMarketMacro />

                {/* Portfolio & Order Book */}
                <PortfolioView />
              </>
            )}

            {/* View 2: F&O Options Matrix */}
            {mainView === 'FO_CHAIN' && (
              <div className="space-y-4">
                <OptionChain onSelectOptionTrade={handleSelectOptionTrade} />
                <AiStrategyEngine />
              </div>
            )}

            {/* View 3: AI Strategy Lab */}
            {mainView === 'AI_STRATEGY' && (
              <div className="space-y-4">
                <MarketSentimentGauge />
                <AiStrategyEngine />
                <TradingChart
                  onQuickOrder={handleQuickOrder}
                  onOpenAlertModal={handleOpenAlert}
                />
              </div>
            )}

            {/* View 4: Portfolio & Positions */}
            {mainView === 'PORTFOLIO' && (
              <div className="space-y-4">
                <PortfolioView />
              </div>
            )}

            {/* View 5: Global Markets */}
            {mainView === 'GLOBAL' && (
              <div className="space-y-4">
                <GlobalMarketMacro />
                <TradingChart
                  onQuickOrder={handleQuickOrder}
                  onOpenAlertModal={handleOpenAlert}
                />
              </div>
            )}
          </div>
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
