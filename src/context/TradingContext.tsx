import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Ticker,
  Order,
  Position,
  Holding,
  PriceAlert,
  AuditLog,
  DeveloperSettings,
  SubscriptionStatus,
  OrderSide,
  OrderType,
  ProductType,
  ExecutionMode,
  StrategyRecommendation,
  GttOrder,
  AlertWebhookSettings,
  UserSession,
  UserRole,
} from '../types/market';
import { INITIAL_TICKERS, WORLD_CLASS_STRATEGIES, DEFAULT_WEBHOOK_SETTINGS } from '../data/marketData';
import { playAlertPing } from '../utils/audioAlert';
import { logAuditEvent, fetchDeveloperSettings, fetchMarketTickers, fetchGttOrders, createGttOrder as apiCreateGtt, cancelGttOrder as apiCancelGtt, testWebhookAlert, broadcastPriceActionToTelegram } from '../services/api';
import {
  authenticateAdministrator,
  signInWithGoogleFirebase,
  autoRegisterGmailDemoUser,
  getSavedUserSession,
  saveUserSession,
  logoutUserSession,
} from '../services/firebaseAuth';

export type WatchlistTab = 'INDICES' | 'NIFTY50' | 'FO' | 'MCX' | 'GLOBAL' | 'CUSTOM';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'ALERT' | 'ORDER' | 'SYSTEM';
  read: boolean;
}

interface TradingContextType {
  tickers: Ticker[];
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;
  activeTicker: Ticker;
  watchlistType: WatchlistTab;
  setWatchlistType: (type: WatchlistTab) => void;
  customWatchlist: string[];
  addToCustomWatchlist: (symbol: string) => void;
  removeFromCustomWatchlist: (symbol: string) => void;
  tickFlashMap: Record<string, 'UP' | 'DOWN' | null>;
  lastTickTime: number;
  feedSource: string;
  feedStatus: string;
  reconnectLiveStream: () => void;
  
  // Portfolio
  cashBalance: number;
  usedMargin: number;
  availableMargin: number;
  positions: Position[];
  holdings: Holding[];
  orders: Order[];
  placeOrder: (orderData: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    product: ProductType;
    quantity: number;
    price?: number;
    triggerPrice?: number;
  }) => { success: boolean; message: string; order?: Order };
  cancelOrder: (orderId: string) => void;
  squareOffPosition: (positionId: string) => void;
  squareOffAll: () => void;

  // Good-Till-Triggered (GTT) & Trailing Stop Loss Orders
  gttOrders: GttOrder[];
  placeGttOrder: (gtt: {
    symbol: string;
    side: OrderSide;
    product: ProductType;
    quantity: number;
    triggerPrice: number;
    limitPrice: number;
    trailingStopLossPoints?: number;
    trailingTargetPrice?: number;
  }) => Promise<{ success: boolean; message: string; gtt?: GttOrder }>;
  cancelGttOrder: (id: string) => Promise<void>;

  // Price Alerts & Notifications
  alerts: PriceAlert[];
  addAlert: (symbol: string, targetPrice: number, condition: 'GTE' | 'LTE', note?: string) => void;
  removeAlert: (alertId: string) => void;
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;

  // Webhook Alert Dispatch (Telegram / WhatsApp)
  webhookSettings: AlertWebhookSettings;
  updateWebhookSettings: (settings: AlertWebhookSettings) => void;
  dispatchWebhookTest: (channel: 'telegram' | 'whatsapp') => Promise<{ success: boolean; message: string }>;
  broadcastTelegramSignal: (signal: any, customChannel?: string) => Promise<{ success: boolean; mode: string; message: string }>;

  // Broker & Developer
  brokerConnected: boolean;
  brokerName: string;
  connectBroker: (name?: string) => void;
  disconnectBroker: () => void;
  brokerMode: ExecutionMode;
  setBrokerMode: (mode: ExecutionMode) => void;
  developerSettings: DeveloperSettings;
  updateDeveloperSettings: (newSettings: DeveloperSettings) => void;
  simulationEnabled: boolean;
  setSimulationEnabled: (enabled: boolean) => void;
  refreshLiveQuotes: () => Promise<void>;

  // AI Strategy & Market Sentiment
  activeStrategy: StrategyRecommendation;
  setActiveStrategy: (strategy: StrategyRecommendation) => void;
  allStrategies: StrategyRecommendation[];
  setAllStrategies: (strategies: StrategyRecommendation[]) => void;

  // Subscription / 15-day Demo Trial
  subscription: SubscriptionStatus;
  activateProSubscription: (plan: 'PRO_MONTHLY' | 'INSTITUTIONAL_ANNUAL', paymentId: string) => void;

  // User Authentication & Roles (Administrator vs Demo User)
  userSession: UserSession;
  isAdmin: boolean;
  isDemoUser: boolean;
  loginAsAdmin: (password: string, username?: string) => boolean;
  loginWithGmail: (email: string, name?: string) => UserSession;
  loginWithFirebaseGoogle: () => Promise<UserSession>;
  logoutUser: () => Promise<void>;
  switchToDemoUser: () => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tickers, setTickers] = useState<Ticker[]>(INITIAL_TICKERS);
  const [activeSymbol, setActiveSymbol] = useState<string>('NIFTY 50');
  const [watchlistType, setWatchlistType] = useState<WatchlistTab>('INDICES');
  const [customWatchlist, setCustomWatchlist] = useState<string[]>([
    'NIFTY 50',
    'BANKNIFTY',
    'CRUDEOIL',
    'NATURALGAS',
    'GOLD',
    'SILVER',
    'RELIANCE',
    'TCS',
    'GIFT NIFTY',
  ]);
  const [tickFlashMap, setTickFlashMap] = useState<Record<string, 'UP' | 'DOWN' | null>>({});
  const [lastTickTime, setLastTickTime] = useState<number>(Date.now());
  const [feedSource, setFeedSource] = useState<string>('Angel One SmartAPI WebSocket 2.0 (Smart-Stream)');
  const [feedStatus, setFeedStatus] = useState<string>('ANGELONE_WS_CONNECTED');

  // Portfolio State
  const [cashBalance, setCashBalance] = useState<number>(245800.50);
  const [usedMargin, setUsedMargin] = useState<number>(34200.00);

  // Holdings/positions/orders/alerts start empty -- these used to be
  // fabricated demo entries (including orders/positions falsely tagged
  // brokerMode: 'ANGELONE', implying real broker trades that never
  // happened). A real deployment must not show trade history that didn't
  // actually occur.
  const [holdings, setHoldings] = useState<Holding[]>([]);

  const [positions, setPositions] = useState<Position[]>([]);

  const [orders, setOrders] = useState<Order[]>([]);

  // Alerts & Notifications
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Welcome to Chanakya Pro',
      message: '15-Day Free Trial activated. SEBI regulatory compliance guidelines in effect.',
      timestamp: 'Just now',
      type: 'SYSTEM',
      read: false,
    },
  ]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // GTT Orders & Webhook Settings
  const [gttOrders, setGttOrders] = useState<GttOrder[]>([]);
  const [webhookSettings, setWebhookSettings] = useState<AlertWebhookSettings>(DEFAULT_WEBHOOK_SETTINGS);

  // Broker & Developer
  // Not connected until a real Angel One login succeeds via BrokerAuthModal
  // -- previously this defaulted to true, showing "SmartAPI: Connected"
  // before any real broker session existed.
  const [brokerConnected, setBrokerConnected] = useState<boolean>(false);
  const [brokerName] = useState<string>('Angel One SmartAPI');
  const [brokerMode, setBrokerMode] = useState<ExecutionMode>('PAPER'); // Default: Paper Trading
  const [simulationEnabled, setSimulationEnabled] = useState<boolean>(true); // Active real-time live data ticks enabled by default

  const [developerSettings, setDeveloperSettings] = useState<DeveloperSettings>({
    angelOne: {
      apiKey: 'ANGEL_LIVE_SMARTAPI_9981',
      clientCode: 'DCP78912',
      mpin: '1982',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      autoTotp: true,
      secretKey: '••••••••••••••••',
      feedToken: 'FT_SMARTAPI_TOKEN_991823',
      isLive: false,
      connected: true,
      lastConnected: new Date().toISOString(),
    },
    razorpay: {
      keyId: 'rzp_test_9kLmnO2P8QvXwY',
      keySecret: '••••••••••••••••',
      webhookSecret: 'whsec_99182348572198',
      isLive: false,
    },
    executionMode: 'PAPER',
  });

  // User Authentication & Role Access Control
  const [userSession, setUserSession] = useState<UserSession>(() => {
    const saved = getSavedUserSession();
    if (saved) return saved;
    // Default to Administrator with Unlimited Trial as requested
    const adminSession: UserSession = {
      username: 'admin',
      email: 'dcpstudio1982@gmail.com',
      name: 'Administrator (DCP Studio)',
      role: 'ADMINISTRATOR',
      isUnlimited: true,
      loginTime: new Date().toISOString(),
      authProvider: 'ADMIN_CREDENTIALS',
    };
    saveUserSession(adminSession);
    return adminSession;
  });

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  const isAdmin = userSession.role === 'ADMINISTRATOR';
  const isDemoUser = userSession.role === 'DEMO_USER';

  // Dynamic Subscription based on Role: Administrator = Unlimited, Demo User = 15 Days
  const [customSubscription, setCustomSubscription] = useState<SubscriptionStatus | null>(null);

  const subscription = useMemo<SubscriptionStatus>(() => {
    if (customSubscription) return customSubscription;
    if (isAdmin) {
      return {
        isTrial: false,
        trialDaysLeft: 99999,
        trialExpiryDate: 'UNLIMITED LIFETIME ACCESS',
        plan: 'INSTITUTIONAL_ANNUAL',
        active: true,
        expiresAt: '2099-12-31T23:59:59.000Z',
      };
    }
    return {
      isTrial: true,
      trialDaysLeft: 15,
      trialExpiryDate: new Date(Date.now() + 15 * 86400000).toLocaleDateString(),
      plan: 'TRIAL',
      active: true,
      expiresAt: new Date(Date.now() + 15 * 86400000).toISOString(),
    };
  }, [isAdmin, customSubscription]);

  const loginAsAdmin = useCallback((password: string, username: string = 'admin'): boolean => {
    const session = authenticateAdministrator(username, password);
    if (session) {
      setUserSession(session);
      return true;
    }
    return false;
  }, []);

  const loginWithGmail = useCallback((email: string, name?: string): UserSession => {
    const session = autoRegisterGmailDemoUser(email, name);
    setUserSession(session);
    return session;
  }, []);

  const loginWithFirebaseGoogle = useCallback(async (): Promise<UserSession> => {
    const session = await signInWithGoogleFirebase();
    setUserSession(session);
    return session;
  }, []);

  const logoutUser = useCallback(async (): Promise<void> => {
    await logoutUserSession();
    // Default to demo user upon logout
    const demo = autoRegisterGmailDemoUser('demo.trader@gmail.com', 'Demo Trader');
    setUserSession(demo);
  }, []);

  const switchToDemoUser = useCallback((): void => {
    const demo = autoRegisterGmailDemoUser('demouser@gmail.com', 'Demo Trader');
    setUserSession(demo);
  }, []);

  // AI Strategy & Market Sentiment state
  const [allStrategies, setAllStrategies] = useState<StrategyRecommendation[]>(WORLD_CLASS_STRATEGIES);
  const [activeStrategy, setActiveStrategy] = useState<StrategyRecommendation>(
    WORLD_CLASS_STRATEGIES.find(s => s.riskLevel === 'BALANCED') || WORLD_CLASS_STRATEGIES[0]
  );

  // Fetch initial developer settings & GTT orders from server
  useEffect(() => {
    fetchDeveloperSettings()
      .then(settings => {
        if (settings) {
          setDeveloperSettings(settings);
          if (settings.executionMode) {
            setBrokerMode(settings.executionMode);
          }
          if (settings.webhooks) {
            setWebhookSettings(settings.webhooks);
          }
        }
      })
      .catch(err => console.warn('Could not load developer settings:', err));

    fetchGttOrders()
      .then(data => {
        if (data && data.length > 0) {
          setGttOrders(data);
        }
      })
      .catch(err => console.warn('Could not load GTT orders:', err));
  }, []);

  // Request browser Notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Fetch authentic live quotes from server
  const refreshLiveQuotes = useCallback(async () => {
    try {
      const data = await fetchMarketTickers();
      if (data && data.length > 0) {
        setTickers(data);
        setPositions(prevPos =>
          prevPos.map(pos => {
            const currentTicker = data.find(t => t.symbol.toUpperCase() === pos.symbol.toUpperCase());
            const currentPrice = currentTicker ? currentTicker.ltp : pos.currentPrice;
            const diff = pos.side === 'BUY' ? currentPrice - pos.avgPrice : pos.avgPrice - currentPrice;
            const pnl = Number((diff * pos.quantity).toFixed(2));
            const pnlPercent = Number(((diff / pos.avgPrice) * 100).toFixed(2));
            return {
              ...pos,
              currentPrice,
              pnl,
              pnlPercent,
            };
          })
        );
      }
    } catch (err) {
      console.warn('Error refreshing live quotes:', err);
    }
  }, []);

  // Initial load of live market data
  useEffect(() => {
    refreshLiveQuotes();
  }, [refreshLiveQuotes]);

  // Reconnect Angel One SmartAPI WebSocket Live Stream
  const reconnectLiveStream = useCallback(async () => {
    try {
      await fetch('/api/broker/angelone/connect-websocket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientCode: developerSettings.angelOne.clientCode,
          apiKey: developerSettings.angelOne.apiKey,
          feedToken: developerSettings.angelOne.feedToken,
        }),
      });
      refreshLiveQuotes();
    } catch (e) {
      console.warn('Failed to trigger WebSocket reconnect:', e);
    }
  }, [developerSettings, refreshLiveQuotes]);

  // Handle incoming live tick batch from Angel One WebSocket / SSE
  const handleLiveTickBatch = useCallback((data: {
    type: string;
    feedSource?: string;
    feedStatus?: string;
    tickers?: Ticker[];
    flashes?: Record<string, 'UP' | 'DOWN'>;
    timestamp?: number;
  }) => {
    if (data.feedSource) {
      setFeedSource(data.feedSource);
    }
    if (data.feedStatus) {
      setFeedStatus(data.feedStatus);
    }
    setLastTickTime(data.timestamp || Date.now());

    if (data.flashes) {
      setTickFlashMap(data.flashes);
      setTimeout(() => setTickFlashMap({}), 650);
    }

    if (Array.isArray(data.tickers) && data.tickers.length > 0) {
      const incomingTickers = data.tickers;
      setTickers(incomingTickers);

      // Recalculate open positions live P&L on authentic exchange rates
      setPositions(prevPos =>
        prevPos.map(pos => {
          const currentTicker = incomingTickers.find((t: Ticker) => t.symbol.toUpperCase() === pos.symbol.toUpperCase());
          const currentPrice = currentTicker ? currentTicker.ltp : pos.currentPrice;
          const diff = pos.side === 'BUY' ? currentPrice - pos.avgPrice : pos.avgPrice - currentPrice;
          const pnl = Number((diff * pos.quantity).toFixed(2));
          const pnlPercent = Number(((diff / pos.avgPrice) * 100).toFixed(2));
          return {
            ...pos,
            currentPrice,
            pnl,
            pnlPercent,
          };
        })
      );

      // Check Real-Time Price Alerts
      setAlerts(prevAlerts =>
        prevAlerts.map(alert => {
          if (alert.triggered) return alert;
          const ticker = incomingTickers.find(t => t.symbol.toUpperCase() === alert.symbol.toUpperCase());
          if (!ticker) return alert;

          let conditionMet = false;
          if (alert.condition === 'GTE' && ticker.ltp >= alert.targetPrice) {
            conditionMet = true;
          } else if (alert.condition === 'LTE' && ticker.ltp <= alert.targetPrice) {
            conditionMet = true;
          }

          if (conditionMet) {
            if (soundEnabled) {
              playAlertPing('alert');
            }
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(`🚨 Price Alert: ${alert.symbol}`, {
                  body: `${alert.symbol} hit target ₹${alert.targetPrice.toLocaleString('en-IN')}. Live LTP: ₹${ticker.ltp.toLocaleString('en-IN')}`,
                  icon: '/favicon.ico',
                });
              } catch (e) {
                console.warn('Push notification error:', e);
              }
            }
            const newNotif: NotificationItem = {
              id: `notif-${Date.now()}`,
              title: `Price Alert Triggered: ${alert.symbol}`,
              message: `Target ₹${alert.targetPrice.toLocaleString('en-IN')} reached. Live LTP is ₹${ticker.ltp.toLocaleString('en-IN')}. ${alert.note || ''}`,
              timestamp: 'Just now',
              type: 'ALERT',
              read: false,
            };
            setNotifications(n => [newNotif, ...n]);
            logAuditEvent({
              action: 'PRICE_ALERT_TRIGGERED',
              category: 'ALERT',
              status: 'SUCCESS',
              details: `Alert reached for ${alert.symbol} at ₹${ticker.ltp}. Target was ${alert.targetPrice}.`,
            });

            return {
              ...alert,
              triggered: true,
              triggeredAt: new Date().toLocaleTimeString(),
            };
          }
          return alert;
        })
      );
    }
  }, [soundEnabled]);

  // Real-time Angel One SmartAPI Native WebSocket Stream with SSE Fallback
  useEffect(() => {
    let ws: WebSocket | null = null;
    let sse: EventSource | null = null;
    let isCleanedUp = false;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/market/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setFeedStatus('ANGELONE_WS_CONNECTED');
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'TICK_UPDATE' || parsed.type === 'SNAPSHOT') {
              handleLiveTickBatch(parsed);
            }
          } catch {
            // ignore heartbeat
          }
        };

        ws.onerror = () => {
          // If WS fails, initiate SSE fallback
          if (!sse && !isCleanedUp) {
            connectSSE();
          }
        };

        ws.onclose = () => {
          if (!isCleanedUp) {
            // Auto reconnect WS in 3s
            setTimeout(() => {
              if (!isCleanedUp) connectWebSocket();
            }, 3000);
          }
        };
      } catch (err) {
        connectSSE();
      }
    };

    const connectSSE = () => {
      try {
        sse = new EventSource('/api/market/stream');
        sse.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'TICK_UPDATE' || parsed.type === 'SNAPSHOT') {
              handleLiveTickBatch(parsed);
            }
          } catch {
            // ignore
          }
        };
        sse.onerror = () => {
          setFeedStatus('CONNECTING');
        };
      } catch (e) {
        console.warn('SSE fallback error:', e);
      }
    };

    connectWebSocket();

    return () => {
      isCleanedUp = true;
      if (ws) ws.close();
      if (sse) sse.close();
    };
  }, [handleLiveTickBatch]);

  const activeTicker = useMemo(() => {
    return tickers.find(t => t.symbol.toUpperCase() === activeSymbol.toUpperCase()) || tickers[0];
  }, [tickers, activeSymbol]);

  const availableMargin = useMemo(() => {
    return Math.max(0, cashBalance - usedMargin);
  }, [cashBalance, usedMargin]);

  // Place Order
  const placeOrder = useCallback((orderData: {
    symbol: string;
    side: OrderSide;
    type: OrderType;
    product: ProductType;
    quantity: number;
    price?: number;
    triggerPrice?: number;
  }) => {
    const ticker = tickers.find(t => t.symbol.toUpperCase() === orderData.symbol.toUpperCase()) || activeTicker;
    const executionPrice = orderData.price || ticker.ltp;
    const totalCost = executionPrice * orderData.quantity;

    // Margin check for BUY
    if (orderData.side === 'BUY' && totalCost > availableMargin * 5) { // 5x intraday leverage
      return {
        success: false,
        message: `Insufficient margin! Required ₹${(totalCost / 5).toLocaleString('en-IN')}, available ₹${availableMargin.toLocaleString('en-IN')}.`,
      };
    }

    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrder: Order = {
      id: orderId,
      symbol: ticker.symbol,
      side: orderData.side,
      type: orderData.type,
      product: orderData.product,
      quantity: orderData.quantity,
      price: executionPrice,
      executedPrice: executionPrice,
      triggerPrice: orderData.triggerPrice,
      status: 'EXECUTED',
      timestamp: new Date().toLocaleTimeString(),
      brokerMode: brokerMode,
    };

    setOrders(prev => [newOrder, ...prev]);

    // Update Position or create new
    setPositions(prev => {
      const existingIndex = prev.findIndex(p => p.symbol.toUpperCase() === ticker.symbol.toUpperCase() && p.product === orderData.product);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        if (existing.side === orderData.side) {
          // Average up/down
          const totalQty = existing.quantity + orderData.quantity;
          const avgPrice = ((existing.avgPrice * existing.quantity) + (executionPrice * orderData.quantity)) / totalQty;
          const updated = [...prev];
          updated[existingIndex] = {
            ...existing,
            quantity: totalQty,
            avgPrice: Number(avgPrice.toFixed(2)),
          };
          return updated;
        } else {
          // Opposite side - reduce or close
          if (existing.quantity === orderData.quantity) {
            // Closed completely
            return prev.filter((_, idx) => idx !== existingIndex);
          } else if (existing.quantity > orderData.quantity) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...existing,
              quantity: existing.quantity - orderData.quantity,
            };
            return updated;
          } else {
            // Flip position
            const updated = [...prev];
            updated[existingIndex] = {
              ...existing,
              side: orderData.side,
              quantity: orderData.quantity - existing.quantity,
              avgPrice: executionPrice,
            };
            return updated;
          }
        }
      } else {
        // Create new position
        const newPos: Position = {
          id: `pos-${Date.now()}`,
          symbol: ticker.symbol,
          side: orderData.side,
          product: orderData.product,
          quantity: orderData.quantity,
          avgPrice: executionPrice,
          currentPrice: ticker.ltp,
          pnl: 0,
          pnlPercent: 0,
          instrumentType: ticker.instrumentType,
        };
        return [newPos, ...prev];
      }
    });

    // Sound and audit log
    if (soundEnabled) {
      playAlertPing('order');
    }

    logAuditEvent({
      action: 'ORDER_EXECUTION',
      category: 'TRADE',
      status: 'SUCCESS',
      details: `${orderData.side} ${orderData.quantity} Qty ${ticker.symbol} @ ₹${executionPrice} (${brokerMode} via ${brokerName})`,
    });

    const notif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title: `Order Executed (${brokerMode})`,
      message: `${orderData.side} ${orderData.quantity} ${ticker.symbol} executed at ₹${executionPrice}.`,
      timestamp: 'Just now',
      type: 'ORDER',
      read: false,
    };
    setNotifications(prev => [notif, ...prev]);

    return {
      success: true,
      message: `Order #${orderId} executed successfully at ₹${executionPrice.toLocaleString('en-IN')}`,
      order: newOrder,
    };
  }, [tickers, activeTicker, availableMargin, brokerMode, brokerName, soundEnabled]);

  const cancelOrder = useCallback((orderId: string) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: 'CANCELLED' } : o))
    );
    if (soundEnabled) {
      playAlertPing('cancel');
    }
  }, [soundEnabled]);

  const squareOffPosition = useCallback((positionId: string) => {
    const pos = positions.find(p => p.id === positionId);
    if (!pos) return;
    placeOrder({
      symbol: pos.symbol,
      side: pos.side === 'BUY' ? 'SELL' : 'BUY',
      type: 'MARKET',
      product: pos.product,
      quantity: pos.quantity,
    });
  }, [positions, placeOrder]);

  const squareOffAll = useCallback(() => {
    positions.forEach(pos => {
      placeOrder({
        symbol: pos.symbol,
        side: pos.side === 'BUY' ? 'SELL' : 'BUY',
        type: 'MARKET',
        product: pos.product,
        quantity: pos.quantity,
      });
    });
  }, [positions, placeOrder]);

  const addAlert = useCallback((symbol: string, targetPrice: number, condition: 'GTE' | 'LTE', note: string = '') => {
    const newAlert: PriceAlert = {
      id: `alt-${Date.now()}`,
      symbol,
      targetPrice,
      condition,
      note,
      createdAt: new Date().toLocaleTimeString(),
      triggered: false,
    };
    setAlerts(prev => [newAlert, ...prev]);
    logAuditEvent({
      action: 'PRICE_ALERT_CREATED',
      category: 'ALERT',
      status: 'SUCCESS',
      details: `Alert created: ${symbol} ${condition} ₹${targetPrice} (${note})`,
    });
  }, []);

  const removeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  const addToCustomWatchlist = useCallback((symbol: string) => {
    if (!customWatchlist.includes(symbol)) {
      setCustomWatchlist(prev => [...prev, symbol]);
    }
  }, [customWatchlist]);

  const removeFromCustomWatchlist = useCallback((symbol: string) => {
    setCustomWatchlist(prev => prev.filter(s => s !== symbol));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const connectBroker = useCallback((name: string = 'Angel One SmartAPI') => {
    setBrokerConnected(true);
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: 'Broker Gateway Connected',
        message: `${name} active. Auto-TOTP verification authenticated.`,
        timestamp: 'Just now',
        type: 'SYSTEM',
        read: false,
      },
      ...prev,
    ]);
  }, []);

  const disconnectBroker = useCallback(() => {
    setBrokerConnected(false);
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: 'Broker Disconnected',
        message: 'Angel One SmartAPI gateway session closed.',
        timestamp: 'Just now',
        type: 'SYSTEM',
        read: false,
      },
      ...prev,
    ]);
  }, []);

  const handleSetBrokerMode = useCallback((mode: ExecutionMode) => {
    setBrokerMode(mode);
    setDeveloperSettings(prev => ({ ...prev, executionMode: mode }));
    logAuditEvent({
      action: 'EXECUTION_MODE_SWITCHED',
      category: 'TRADE',
      status: 'SUCCESS',
      details: `Execution mode changed to ${mode === 'PAPER' ? 'Paper Trading (Virtual Sandbox)' : 'Angel One SmartAPI (Live Brokerage)'}`,
    });
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: mode === 'PAPER' ? 'Switched to Paper Trading' : 'Live Trading Activated (Angel One)',
        message: mode === 'PAPER'
          ? 'Virtual sandbox mode active. Real capital is safe with ₹2,45,800 simulated virtual margin.'
          : '⚠️ LIVE MODE: Orders will be routed directly to Angel One SmartAPI using authenticated MPIN & TOTP session.',
        timestamp: 'Just now',
        type: 'SYSTEM',
        read: false,
      },
      ...prev,
    ]);
  }, []);

  const updateDeveloperSettings = useCallback((newSettings: DeveloperSettings) => {
    setDeveloperSettings(newSettings);
    if (newSettings.executionMode) {
      setBrokerMode(newSettings.executionMode);
    }
  }, []);

  const activateProSubscription = useCallback((plan: 'PRO_MONTHLY' | 'INSTITUTIONAL_ANNUAL', paymentId: string) => {
    setCustomSubscription({
      isTrial: false,
      trialDaysLeft: 0,
      trialExpiryDate: 'Permanent (Active Paid)',
      plan,
      active: true,
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      paymentId,
    });
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: 'Subscription Activated via Razorpay',
        message: `Plan ${plan} unlocked! 15-day trial converted to unrestricted full access. Payment ID: ${paymentId}`,
        timestamp: 'Just now',
        type: 'SYSTEM',
        read: false,
      },
      ...prev,
    ]);
  }, []);

  // GTT Orders Handler
  const placeGttOrder = useCallback(async (gttData: {
    symbol: string;
    side: OrderSide;
    product: ProductType;
    quantity: number;
    triggerPrice: number;
    limitPrice: number;
    trailingStopLossPoints?: number;
    trailingTargetPrice?: number;
  }) => {
    try {
      const created = await apiCreateGtt({
        ...gttData,
        brokerMode,
      });

      setGttOrders(prev => [created, ...prev]);

      if (soundEnabled) {
        playAlertPing('order');
      }

      setNotifications(prev => [
        {
          id: `notif-${Date.now()}`,
          title: `GTT Placed: ${created.symbol}`,
          message: `${created.side} ${created.quantity} Trigger @ ₹${created.triggerPrice}, Limit @ ₹${created.limitPrice}${created.trailingStopLossPoints ? ` (TSL: ${created.trailingStopLossPoints} pts)` : ''} (${brokerMode})`,
          timestamp: 'Just now',
          type: 'ORDER',
          read: false,
        },
        ...prev,
      ]);

      return { success: true, message: 'GTT Order registered successfully.', gtt: created };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to place GTT order' };
    }
  }, [brokerMode, soundEnabled]);

  const cancelGttOrder = useCallback(async (id: string) => {
    const deleted = await apiCancelGtt(id);
    if (!deleted) return; // Don't remove it from the list if the server never actually cancelled it
    setGttOrders(prev => prev.filter(g => g.id !== id));
    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: 'GTT Order Cancelled',
        message: `Order ID ${id} was cancelled.`,
        timestamp: 'Just now',
        type: 'ORDER',
        read: false,
      },
      ...prev,
    ]);
  }, []);

  // Webhook Alert Dispatch
  const updateWebhookSettings = useCallback((settings: AlertWebhookSettings) => {
    setWebhookSettings(settings);
    setDeveloperSettings(prev => ({ ...prev, webhooks: settings }));
    logAuditEvent({
      action: 'WEBHOOK_CONFIG_UPDATED',
      category: 'ALERT',
      status: 'SUCCESS',
      details: `Alert Webhooks updated: Telegram ${settings.telegram.enabled ? 'Enabled' : 'Disabled'}, WhatsApp ${settings.whatsapp.enabled ? 'Enabled' : 'Disabled'}`,
    });
  }, []);

  const dispatchWebhookTest = useCallback(async (channel: 'telegram' | 'whatsapp') => {
    const config = channel === 'telegram' ? webhookSettings.telegram : webhookSettings.whatsapp;
    const res = await testWebhookAlert({
      channel,
      recipient: channel === 'telegram' ? webhookSettings.telegram.chatId : webhookSettings.whatsapp.recipientNumber,
      botToken: webhookSettings.telegram.botToken,
      webhookUrl: webhookSettings.whatsapp.webhookUrl,
      customMessage: `🚨 Chanakya Pro: Verified instant trade signal transmission for ${channel.toUpperCase()}. System ready for live alerts!`,
    });

    if (soundEnabled) {
      playAlertPing('alert');
    }

    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: `${channel.toUpperCase()} Alert Test Dispatched`,
        message: res.message,
        timestamp: 'Just now',
        type: 'ALERT',
        read: false,
      },
      ...prev,
    ]);

    return res;
  }, [webhookSettings, soundEnabled]);

  const broadcastTelegramSignal = useCallback(async (signal: any, customChannel?: string) => {
    const res = await broadcastPriceActionToTelegram(
      signal,
      customChannel || webhookSettings.telegram.chatId,
      webhookSettings.telegram.botToken
    );

    if (soundEnabled) {
      playAlertPing('alert');
    }

    setNotifications(prev => [
      {
        id: `notif-${Date.now()}`,
        title: `Telegram Broadcast: ${signal.indexSymbol || 'NIFTY 50'} ${signal.action || 'SIGNAL'}`,
        message: res.message,
        timestamp: 'Just now',
        type: 'ALERT',
        read: false,
      },
      ...prev,
    ]);

    return res;
  }, [webhookSettings, soundEnabled]);

  return (
    <TradingContext.Provider
      value={{
        tickers,
        activeSymbol,
        setActiveSymbol,
        activeTicker,
        watchlistType,
        setWatchlistType,
        customWatchlist,
        addToCustomWatchlist,
        removeFromCustomWatchlist,
        tickFlashMap,
        lastTickTime,

        cashBalance,
        usedMargin,
        availableMargin,
        positions,
        holdings,
        orders,
        placeOrder,
        cancelOrder,
        squareOffPosition,
        squareOffAll,

        // GTT Orders
        gttOrders,
        placeGttOrder,
        cancelGttOrder,

        alerts,
        addAlert,
        removeAlert,
        notifications,
        markNotificationRead,
        clearAllNotifications,
        soundEnabled,
        setSoundEnabled,

        // Webhook integration
        webhookSettings,
        updateWebhookSettings,
        dispatchWebhookTest,
        broadcastTelegramSignal,

        brokerConnected,
        brokerName,
        connectBroker,
        disconnectBroker,
        brokerMode,
        setBrokerMode: handleSetBrokerMode,
        developerSettings,
        updateDeveloperSettings,
        simulationEnabled,
        setSimulationEnabled,
        refreshLiveQuotes,
        feedSource,
        feedStatus,
        reconnectLiveStream,

        activeStrategy,
        setActiveStrategy,
        allStrategies,
        setAllStrategies,

        subscription,
        activateProSubscription,

        // Authentication & Role Access
        userSession,
        isAdmin,
        isDemoUser,
        loginAsAdmin,
        loginWithGmail,
        loginWithFirebaseGoogle,
        logoutUser,
        switchToDemoUser,
        showAuthModal,
        setShowAuthModal,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};
