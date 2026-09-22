export type Exchange = 'NSE' | 'BSE' | 'GLOBAL' | 'MCX';
export type InstrumentType = 'EQUITY' | 'INDEX' | 'FUT' | 'OPT' | 'GLOBAL' | 'COMMODITY';

export interface MarketDepthItem {
  price: number;
  orders: number;
  quantity: number;
}

export interface Ticker {
  symbol: string;
  name: string;
  exchange: Exchange;
  ltp: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  close: number;
  volume: number;
  lotSize: number;
  instrumentType: InstrumentType;
  currency: string;
  marketCap?: string;
  peRatio?: number;
  sector?: string;
  category?: 'BENCHMARK' | 'SECTORAL' | 'GLOBAL' | 'EQUITY' | 'COMMODITY';
  tickDirection?: 'UP' | 'DOWN' | 'EQUAL';
  bidDepth?: MarketDepthItem[];
  askDepth?: MarketDepthItem[];
  lastUpdated: string;
}

export interface HistoricalCandle {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20?: number;
  ema50?: number;
  upperBB?: number;
  lowerBB?: number;
  rsi?: number;
  macd?: number;
  signalLine?: number;
  histogram?: number;
}

export interface OptionLegData {
  ltp: number;
  change: number;
  changePercent: number;
  oi: number;
  oiChange: number;
  volume: number;
  iv: number;
  delta: number;
  theta: number;
  gamma: number;
  vega: number;
  bid: number;
  ask: number;
}

export interface OptionStrike {
  strikePrice: number;
  call: OptionLegData;
  put: OptionLegData;
}

export interface OptionChainData {
  underlyingSymbol: string;
  underlyingPrice: number;
  expiryDates: string[];
  selectedExpiry: string;
  strikes: OptionStrike[];
  pcr: number; // Put-Call Ratio
  maxPain: number;
  totalCallOI: number;
  totalPutOI: number;
  highestCallOIStrike: number;
  highestPutOIStrike: number;
  atmStrike: number;
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type ProductType = 'MIS' | 'CNC' | 'NRML';
export type OrderStatus = 'EXECUTED' | 'PENDING' | 'CANCELLED' | 'REJECTED';
export type ExecutionMode = 'PAPER' | 'ANGELONE';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  product: ProductType;
  quantity: number;
  price: number;
  triggerPrice?: number;
  status: OrderStatus;
  executedPrice?: number;
  timestamp: string;
  brokerMode: ExecutionMode;
  notes?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: OrderSide;
  product: ProductType;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  instrumentType: InstrumentType;
}

export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  ltp: number;
  curVal: number;
  totalPnl: number;
  totalPnlPercent: number;
  dayPnl: number;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'GTE' | 'LTE';
  note: string;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

export interface GttOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  product: ProductType;
  quantity: number;
  triggerPrice: number;
  limitPrice: number;
  trailingStopLossPoints?: number; // points to trail stop loss upwards
  trailingTargetPrice?: number;
  highestLtpSeen?: number;
  status: 'ACTIVE' | 'TRIGGERED' | 'CANCELLED' | 'EXPIRED';
  createdAt: string;
  triggeredAt?: string;
  brokerMode: ExecutionMode;
}

export interface AlertWebhookSettings {
  telegram: {
    enabled: boolean;
    botToken: string;
    chatId: string;
    isConnected: boolean;
  };
  whatsapp: {
    enabled: boolean;
    webhookUrl: string;
    recipientNumber: string;
    isConnected: boolean;
  };
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  timeframe: '6M' | '1Y' | '3Y';
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRatePercent: number;
  profitFactor: number;
  cagrPercent: number;
  maxDrawdownPercent: number;
  netPnl: number;
  sharpeRatio: number;
  monthlyBreakdown: { month: string; pnl: number; winRate: number; trades: number }[];
  equityCurve: { date: string; equity: number; benchmark: number }[];
}

export interface StrategyLeg {
  action: 'BUY' | 'SELL';
  instrument: string;
  strike?: number;
  optionType?: 'CE' | 'PE';
  expiry?: string;
  lots: number;
  estPrice: number;
}

export interface StrategyRecommendation {
  id: string;
  name: string;
  category: 'DIRECTIONAL' | 'NON_DIRECTIONAL' | 'VOLATILITY' | 'MOMENTUM';
  marketRegime: string;
  riskLevel: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';
  winProbabilityPercent: number; // strictly % probability, NEVER guarantees
  riskRewardRatio: string;
  maxProfit: string;
  maxLoss: string;
  targetUnderlying: number;
  stopLossUnderlying: number;
  legs: StrategyLeg[];
  rationale: string;
  sebiComplianceNotice: string;
  greeksProfile: {
    netDelta: number;
    netTheta: number;
    netVega: number;
  };
}

export type AuditCategory = 'AUTH' | 'TRADE' | 'ALERT' | 'DEVELOPER' | 'PAYMENT' | 'SYSTEM';
export type AuditStatus = 'SUCCESS' | 'WARNING' | 'FAILED';

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  category: AuditCategory;
  status: AuditStatus;
  details: string;
  ipAddress: string;
}

export interface AngelOneCredentials {
  apiKey: string;
  clientCode: string;
  secretKey: string;
  mpin?: string;
  totpSecret?: string;
  autoTotp?: boolean;
  feedToken: string;
  jwtToken?: string;
  refreshToken?: string;
  isLive: boolean;
  connected: boolean;
  lastConnected?: string;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  isLive: boolean;
}

export interface DeveloperSettings {
  angelOne: AngelOneCredentials;
  razorpay: RazorpayCredentials;
  executionMode: ExecutionMode;
  webhooks?: AlertWebhookSettings;
}

export interface SubscriptionStatus {
  isTrial: boolean;
  trialDaysLeft: number;
  trialExpiryDate: string;
  plan: 'TRIAL' | 'PRO_MONTHLY' | 'INSTITUTIONAL_ANNUAL';
  active: boolean;
  expiresAt: string;
  paymentId?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  tradingBalance: number;
  usedMargin: number;
  availableMargin: number;
  brokerConnected: boolean;
  brokerName: string;
  subscription: SubscriptionStatus;
}

export interface AngelOneQuote {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  percentChange: number;
  volume: number;
  lastTradedQty: number;
  totBuyQty: number;
  totSellQty: number;
  avgPrice: number;
  depth?: {
    buy: Array<{ price: number; quantity: number; orders: number }>;
    sell: Array<{ price: number; quantity: number; orders: number }>;
  };
  feedStatus: 'LIVE_FEED' | 'CONNECTED';
  timestamp: string;
}

export interface AngelOneWatchlistData {
  success: boolean;
  broker: string;
  feedStatus: string;
  clientCode: string;
  lastUpdated: string;
  totalInstruments: number;
  quotes: AngelOneQuote[];
}

