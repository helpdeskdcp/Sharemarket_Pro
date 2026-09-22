import React, { useState, useEffect } from 'react';
import {
  Code2,
  X,
  Save,
  FileText,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Key,
  Shield,
  Layers,
  Send,
  Bell,
  MessageSquare,
  Smartphone,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { fetchDeveloperSettings, updateDeveloperSettings, fetchAuditLogs } from '../services/api';
import { DeveloperSettings, AuditLog } from '../types/market';

interface DeveloperSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeveloperSettingsModal: React.FC<DeveloperSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { setBrokerMode, webhookSettings, updateWebhookSettings, dispatchWebhookTest } = useTrading();

  const [activeTab, setActiveTab] = useState<'API_CONFIG' | 'WEBHOOK_ALERTS' | 'AUDIT_LOGS'>('API_CONFIG');
  const [settings, setSettings] = useState<DeveloperSettings | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logFilter, setLogFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testingChannel, setTestingChannel] = useState<'telegram' | 'whatsapp' | null>(null);
  const [testAlertMessage, setTestAlertMessage] = useState<string | null>(null);

  // Load developer config & logs on modal open
  useEffect(() => {
    if (isOpen) {
      fetchDeveloperSettings().then(data => setSettings(data));
      fetchAuditLogs().then(data => setLogs(data));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const updated = await updateDeveloperSettings(settings);
      setSettings(updated);
      setBrokerMode(updated.executionMode === 'ANGEL_ONE' ? 'ANGEL_ONE' : 'PAPER');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update developer config:', err);
    } finally {
      setSaving(false);
    }
  };

  const filteredLogs = logs.filter(l => {
    const matchesFilter = logFilter === 'ALL' || l.category === logFilter;
    const matchesSearch =
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.user && l.user.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const handleExportLogs = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(logs, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `compliance_audit_logs_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f172a] rounded-2xl border border-slate-700 w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-indigo-500/20 text-indigo-400">
              <Code2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">
                Developer Options &amp; User Audit Management
              </h3>
              <p className="text-[11px] text-slate-400">
                Configure API endpoints, credentials, and inspect immutable audit logs
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center px-4 border-b border-slate-800 bg-[#0c1222]">
          <button
            onClick={() => setActiveTab('API_CONFIG')}
            className={`py-2.5 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-2 ${
              activeTab === 'API_CONFIG'
                ? 'border-indigo-400 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="h-3.5 w-3.5" />
            API &amp; Gateway Configuration
          </button>

          <button
            onClick={() => setActiveTab('WEBHOOK_ALERTS')}
            className={`py-2.5 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-2 ${
              activeTab === 'WEBHOOK_ALERTS'
                ? 'border-indigo-400 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            Webhook Alerts (Telegram &amp; WhatsApp)
          </button>

          <button
            onClick={() => setActiveTab('AUDIT_LOGS')}
            className={`py-2.5 px-3 text-xs font-bold font-mono transition border-b-2 flex items-center gap-2 ${
              activeTab === 'AUDIT_LOGS'
                ? 'border-indigo-400 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            User Audit Logs ({logs.length})
          </button>
        </div>

        {/* Tab 1: API Configuration */}
        {activeTab === 'API_CONFIG' && settings && (
          <form onSubmit={handleSaveSettings} className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
            {/* Broker Execution Mode */}
            <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800">
              <label className="text-[11px] text-slate-300 font-bold uppercase block mb-1.5">
                Default Execution Engine
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, executionMode: 'PAPER' })}
                  className={`p-2.5 rounded-lg border text-left transition ${
                    settings.executionMode === 'PAPER'
                      ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-bold text-white">Paper Trading (Simulated)</div>
                  <div className="text-[10px] text-slate-400">Zero capital risk sandbox mode</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, executionMode: 'ANGEL_ONE' })}
                  className={`p-2.5 rounded-lg border text-left transition ${
                    settings.executionMode === 'ANGEL_ONE'
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-bold text-white">Angel One SmartAPI Live</div>
                  <div className="text-[10px] text-slate-400">Direct order routing to broker terminal</div>
                </button>
              </div>
            </div>

            {/* Angel One SmartAPI Details */}
            <div className="p-3.5 rounded-xl bg-[#090d16] border border-cyan-500/30 space-y-3">
              <div className="font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span className="text-cyan-300">Angel One SmartAPI &amp; Auto-TOTP Config</span>
                <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800">
                  RFC 6238 pyotp Ready
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">API Key</label>
                  <input
                    type="text"
                    value={settings.angelOne?.apiKey || ''}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        angelOne: { ...settings.angelOne, apiKey: e.target.value },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">Client Code</label>
                  <input
                    type="text"
                    value={settings.angelOne?.clientCode || ''}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        angelOne: { ...settings.angelOne, clientCode: e.target.value.toUpperCase() },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500 uppercase"
                  />
                </div>
              </div>

              {/* MPIN & TOTP Secret */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">
                    MPIN (4 or 6 Digits)
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={settings.angelOne?.mpin || ''}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        angelOne: { ...settings.angelOne, mpin: e.target.value.replace(/\D/g, '') },
                      })
                    }
                    placeholder="1982"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-cyan-500 tracking-widest"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">
                    TOTP Secret Key (Base32)
                  </label>
                  <input
                    type="text"
                    value={settings.angelOne?.totpSecret || ''}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        angelOne: { ...settings.angelOne, totpSecret: e.target.value.toUpperCase() },
                      })
                    }
                    placeholder="JBSWY3DPEHPK3PXP"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-cyan-300 font-mono focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="p-2 rounded bg-cyan-950/30 border border-cyan-500/20 text-[10px] text-slate-400 flex items-center justify-between">
                <span>⚡ Auto-regenerate TOTP on expiry for zero-touch algo execution</span>
                <span className="text-emerald-400 font-bold">Enabled</span>
              </div>
            </div>

            {/* Razorpay Payment Details */}
            <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800 space-y-3">
              <div className="font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Razorpay Payment Gateway Details</span>
                <span className="text-[10px] text-cyan-400 font-semibold">
                  {settings.razorpay?.isLive ? 'Live Mode' : 'Test Mode'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">
                    Razorpay Key ID
                  </label>
                  <input
                    type="text"
                    value={settings.razorpay?.keyId || ''}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        razorpay: { ...settings.razorpay, keyId: e.target.value },
                      })
                    }
                    placeholder="rzp_test_..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">
                    Razorpay Key Secret
                  </label>
                  <input
                    type="password"
                    value={settings.razorpay?.keySecret || ''}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        razorpay: { ...settings.razorpay, keySecret: e.target.value },
                      })
                    }
                    placeholder="••••••••••••"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {saveSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Developer settings updated and saved to audit registry!</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Developer Configuration'}
            </button>
          </form>
        )}

        {/* Tab: Webhook Alerts Configuration */}
        {activeTab === 'WEBHOOK_ALERTS' && (
          <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
            <div className="text-[11px] text-slate-400">
              Configure real-time automated notifications dispatched upon GTT price execution, trailing stop-loss triggers, or market alerts.
            </div>

            {/* Telegram Channel */}
            <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
                    <Send className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-xs">Telegram Instant Broadcast</div>
                    <div className="text-[10px] text-slate-400">Receive order triggers &amp; strategy alerts in your Telegram channel</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhookSettings.telegram.enabled}
                    onChange={e =>
                      updateWebhookSettings({
                        telegram: { ...webhookSettings.telegram, enabled: e.target.checked },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">Telegram Bot Token</label>
                  <input
                    type="text"
                    value={webhookSettings.telegram.botToken}
                    onChange={e =>
                      updateWebhookSettings({
                        telegram: { ...webhookSettings.telegram, botToken: e.target.value },
                      })
                    }
                    placeholder="bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">Chat ID / Channel Handle</label>
                  <input
                    type="text"
                    value={webhookSettings.telegram.chatId}
                    onChange={e =>
                      updateWebhookSettings({
                        telegram: { ...webhookSettings.telegram, chatId: e.target.value },
                      })
                    }
                    placeholder="@AlphaTradesAlerts or -10012345678"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={testingChannel === 'telegram'}
                  onClick={async () => {
                    setTestingChannel('telegram');
                    setTestAlertMessage(null);
                    const res = await dispatchWebhookTest('telegram');
                    setTestAlertMessage(res.message);
                    setTestingChannel(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-sky-950 border border-sky-600/50 text-sky-300 hover:bg-sky-900 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Send className="h-3 w-3" />
                  {testingChannel === 'telegram' ? 'Dispatching...' : 'Dispatch Telegram Test'}
                </button>
              </div>
            </div>

            {/* WhatsApp Channel */}
            <div className="p-3.5 rounded-xl bg-[#090d16] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-xs">WhatsApp Business API Webhook</div>
                    <div className="text-[10px] text-slate-400">Send critical GTT execution pings directly to your mobile WhatsApp</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhookSettings.whatsapp.enabled}
                    onChange={e =>
                      updateWebhookSettings({
                        whatsapp: { ...webhookSettings.whatsapp, enabled: e.target.checked },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">Webhook Endpoint URL</label>
                  <input
                    type="text"
                    value={webhookSettings.whatsapp.webhookUrl}
                    onChange={e =>
                      updateWebhookSettings({
                        whatsapp: { ...webhookSettings.whatsapp, webhookUrl: e.target.value },
                      })
                    }
                    placeholder="https://api.wati.io/api/v1/sendSessionMessage"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">Phone Number (+91...)</label>
                  <input
                    type="text"
                    value={webhookSettings.whatsapp.phoneNumber}
                    onChange={e =>
                      updateWebhookSettings({
                        whatsapp: { ...webhookSettings.whatsapp, phoneNumber: e.target.value },
                      })
                    }
                    placeholder="+919876543210"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={testingChannel === 'whatsapp'}
                  onClick={async () => {
                    setTestingChannel('whatsapp');
                    setTestAlertMessage(null);
                    const res = await dispatchWebhookTest('whatsapp');
                    setTestAlertMessage(res.message);
                    setTestingChannel(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-600/50 text-emerald-300 hover:bg-emerald-900 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Smartphone className="h-3 w-3" />
                  {testingChannel === 'whatsapp' ? 'Dispatching...' : 'Dispatch WhatsApp Test'}
                </button>
              </div>
            </div>

            {testAlertMessage && (
              <div className="p-2.5 rounded-lg bg-indigo-950/80 border border-indigo-500/50 text-indigo-200 flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-400" />
                <span>{testAlertMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: User Audit Logs */}
        {activeTab === 'AUDIT_LOGS' && (
          <div className="p-4 flex-1 flex flex-col overflow-hidden font-mono text-xs space-y-3">
            {/* Filters & Export */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <select
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
                >
                  <option value="ALL">All Categories</option>
                  <option value="AUTH">AUTH</option>
                  <option value="TRADE">TRADE</option>
                  <option value="ALERT">ALERT</option>
                  <option value="DEVELOPER">DEVELOPER</option>
                  <option value="PAYMENT">PAYMENT</option>
                </select>
              </div>

              <button
                onClick={handleExportLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Export Audit Logs (.JSON)
              </button>
            </div>

            {/* Logs Table */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-[#090d16]">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Details</th>
                    <th className="py-2 px-3">User ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No audit logs found.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                          {log.timestamp}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              log.category === 'TRADE'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : log.category === 'AUTH'
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                : log.category === 'DEVELOPER'
                                ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {log.category}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-white">{log.action}</td>
                        <td className="py-2 px-3 text-slate-300 text-[11px]">{log.details}</td>
                        <td className="py-2 px-3 text-slate-400 text-[10px]">{log.user}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1">
              <span>Auditing standard compliant with SEBI circular on algorithmic/API trading records.</span>
              <span>Total records: {filteredLogs.length}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
