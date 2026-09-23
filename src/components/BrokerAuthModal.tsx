import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  X,
  Key,
  Lock,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  HelpCircle,
  Clock,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import { authenticateBroker } from '../services/api';
import { generateAngelOneTotp, generateRandomSecret, sanitizeBase32, isValidBase32 } from '../utils/totp';

interface BrokerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrokerAuthModal: React.FC<BrokerAuthModalProps> = ({ isOpen, onClose }) => {
  const { brokerConnected, brokerName, connectBroker, disconnectBroker, developerSettings, updateDeveloperSettings } = useTrading();

  // Credentials State initialized from developer settings
  const [clientCode, setClientCode] = useState(developerSettings.angelOne?.clientCode || 'DCP78912');
  const [mpin, setMpin] = useState(developerSettings.angelOne?.mpin || '1982');
  const [totpSecret, setTotpSecret] = useState(developerSettings.angelOne?.totpSecret || 'JBSWY3DPEHPK3PXP');
  const [apiKey, setApiKey] = useState(developerSettings.angelOne?.apiKey || 'smartapi_live_k820fj391');

  // TOTP Generator Engine State
  const [currentTotp, setCurrentTotp] = useState('------');
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [copied, setCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showMpin, setShowMpin] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualTotpInput, setManualTotpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'SUCCESS' | 'ERROR' | 'INFO'; text: string } | null>(null);

  // Sync state if developerSettings change
  useEffect(() => {
    if (developerSettings.angelOne) {
      if (developerSettings.angelOne.clientCode) setClientCode(developerSettings.angelOne.clientCode);
      if (developerSettings.angelOne.mpin) setMpin(developerSettings.angelOne.mpin);
      if (developerSettings.angelOne.totpSecret) setTotpSecret(developerSettings.angelOne.totpSecret);
      if (developerSettings.angelOne.apiKey) setApiKey(developerSettings.angelOne.apiKey);
    }
  }, [developerSettings]);

  // Real-time TOTP generation loop (every second)
  useEffect(() => {
    const updateTotp = () => {
      if (totpSecret && totpSecret.trim().length >= 8) {
        try {
          const res = generateAngelOneTotp(totpSecret);
          setCurrentTotp(res.code);
          setSecondsRemaining(res.secondsRemaining);
        } catch (e) {
          setCurrentTotp('------');
        }
      } else {
        setCurrentTotp('------');
        setSecondsRemaining(30);
      }
    };

    updateTotp();
    const interval = setInterval(updateTotp, 1000);
    return () => clearInterval(interval);
  }, [totpSecret]);

  if (!isOpen) return null;

  const handleCopyTotp = () => {
    if (currentTotp && currentTotp !== '------') {
      navigator.clipboard.writeText(currentTotp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerateSampleSecret = () => {
    const sample = generateRandomSecret();
    setTotpSecret(sample);
    setStatusMsg({
      type: 'INFO',
      text: 'नवीन Base32 TOTP Secret Key जनरेट केली! (Valid RFC 6238 Secret)',
    });
  };

  const handleConnectWithAutoTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    // Validate MPIN
    if (mpin.length !== 4 && mpin.length !== 6) {
      setStatusMsg({
        type: 'ERROR',
        text: 'MPIN साधारणपणे ४ किंवा ६ अंकी असणे आवश्यक आहे.',
      });
      setLoading(false);
      return;
    }

    // Validate TOTP Secret
    if (!manualMode && (!totpSecret || sanitizeBase32(totpSecret).length < 8)) {
      setStatusMsg({
        type: 'ERROR',
        text: 'कृपया वैध Base32 TOTP Secret Key टाका (किंवा Generate Test Secret वापरा).',
      });
      setLoading(false);
      return;
    }

    // Compute fresh TOTP code or use manual input
    const liveTotp = manualMode && manualTotpInput.length === 6
      ? manualTotpInput
      : generateAngelOneTotp(totpSecret).code;

    try {
      const res = await authenticateBroker({
        clientCode: clientCode.trim().toUpperCase(),
        mpin: mpin.trim(),
        totp: liveTotp,
        totpSecret: sanitizeBase32(totpSecret),
        apiKey: apiKey.trim(),
        autoTotp: !manualMode,
      });

      if (res.success) {
        connectBroker('Angel One SmartAPI');
        updateDeveloperSettings({
          ...developerSettings,
          angelOne: {
            ...developerSettings.angelOne,
            clientCode: clientCode.trim().toUpperCase(),
            mpin: mpin.trim(),
            totpSecret: sanitizeBase32(totpSecret),
            apiKey: apiKey.trim(),
            connected: true,
            isLive: true,
            lastConnected: new Date().toISOString(),
          },
        });
        setStatusMsg({
          type: 'SUCCESS',
          text: `Angel One SmartAPI यशस्वीरीत्या कनेक्ट झाले! (Client: ${clientCode.toUpperCase()}, Auto-TOTP: ${liveTotp})`,
        });
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setStatusMsg({
          type: 'ERROR',
          text: res.error || res.message || 'Authentication failed. Please check Client Code & MPIN.',
        });
      }
    } catch (err) {
      // A real network/server failure -- show it instead of pretending the
      // broker connected. (Previously this silently marked the broker as
      // connected on ANY error, which masked genuine login rejections once
      // /api/broker/angelone/auth started performing a real Angel One login.)
      setStatusMsg({
        type: 'ERROR',
        text: err instanceof Error ? err.message : 'Could not reach the server. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Circular timer percentage
  const progressPercent = ((30 - secondsRemaining) / 30) * 100;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b1220] rounded-2xl border border-cyan-500/40 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-[#0d1b33] via-slate-900 to-[#0d1b33] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white font-mono flex items-center gap-2">
                Angel One SmartAPI Auto-TOTP &amp; MPIN Auth
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-normal">
                  pyotp API
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Auto-generate TOTP codes &amp; seamless algorithmic authentication
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
          {/* Active Broker Connection Badge */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
              brokerConnected
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-900/90 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full shrink-0 ${
                  brokerConnected ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50' : 'bg-slate-600'
                }`}
              />
              <div>
                <span className="font-bold text-white text-xs block">
                  {brokerConnected ? 'SmartAPI Live Session Active' : 'SmartAPI Session Disconnected'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {brokerConnected
                    ? `Authenticated ID: ${clientCode.toUpperCase()} • Live Data Stream`
                    : 'Enter MPIN & TOTP Secret for automated one-click login'}
                </span>
              </div>
            </div>

            {brokerConnected && (
              <button
                type="button"
                onClick={disconnectBroker}
                className="px-3 py-1.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 hover:bg-rose-900 text-[11px] font-bold transition"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* REAL-TIME AUTO-TOTP CARD (Like Python pyotp) */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#0c162d] via-slate-900 to-[#0b1426] border border-cyan-500/40 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-400" />
                <span className="text-[11px] font-bold uppercase text-cyan-300">
                  Live Auto-Generated TOTP (RFC 6238)
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    const fresh = generateAngelOneTotp(totpSecret);
                    setCurrentTotp(fresh.code);
                    setSecondsRemaining(fresh.secondsRemaining);
                  }}
                  title="Force recalculate token"
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 hover:border-cyan-500/40 transition cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
                <span className="font-bold text-amber-400">{secondsRemaining}s</span>
                <span>remaining</span>
              </div>
            </div>

            {/* Countdown Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  secondsRemaining <= 5
                    ? 'bg-rose-500'
                    : secondsRemaining <= 10
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                }`}
                style={{ width: `${((30 - secondsRemaining) / 30) * 100}%` }}
              />
            </div>

            {/* Big 6-Digit Display */}
            <div className="flex items-center justify-between bg-black/40 p-3 rounded-lg border border-cyan-500/20">
              <div className="flex items-center gap-2 tracking-[0.35em] text-2xl font-black text-cyan-200">
                {currentTotp.split('').map((digit, idx) => (
                  <span
                    key={idx}
                    className={`inline-block px-1.5 py-0.5 rounded bg-slate-800/80 border border-cyan-500/30 ${
                      idx === 3 ? 'ml-2 text-emerald-300' : ''
                    }`}
                  >
                    {digit}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyTotp}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/40 transition text-xs font-bold cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
              <span>⚡ <strong>Auto-Gen Engine:</strong> TOTP Secret वरून दर ३० सेकंदाला आपोआप टोकन काढले जाते.</span>
              <button
                type="button"
                onClick={() => setManualMode(!manualMode)}
                className="text-cyan-400 hover:text-cyan-300 underline font-semibold shrink-0 ml-2 cursor-pointer"
              >
                {manualMode ? 'Use Auto-TOTP' : 'Manual OTP Option'}
              </button>
            </div>

            {manualMode && (
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-amber-500/40 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] text-amber-300 font-bold">
                  <span>Manual 6-Digit TOTP Override:</span>
                  <span className="text-[10px] text-slate-400">Optional</span>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={manualTotpInput}
                  onChange={e => setManualTotpInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 849201"
                  className="w-full bg-black/60 border border-slate-700 rounded px-3 py-1.5 text-amber-300 font-mono text-center tracking-widest font-bold text-sm focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleConnectWithAutoTotp} className="space-y-3.5">
            {/* Client Code */}
            <div>
              <label className="text-[11px] text-slate-300 font-bold uppercase block mb-1">
                Angel One Client Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={clientCode}
                  onChange={e => setClientCode(e.target.value)}
                  placeholder="उदा. A123456 / DCP78912"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-white font-bold font-mono focus:outline-none focus:border-cyan-400 uppercase"
                />
              </div>
            </div>

            {/* MPIN (4 or 6 digits) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-300 font-bold uppercase">
                  Angel One MPIN (लॉगिन पिन)
                </label>
                <span className="text-[10px] text-slate-500">4 किंवा 6 अंकी MPIN</span>
              </div>
              <div className="relative">
                <input
                  type={showMpin ? 'text' : 'password'}
                  required
                  maxLength={6}
                  value={mpin}
                  onChange={e => setMpin(e.target.value.replace(/\D/g, ''))}
                  placeholder="उदा. 1982"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-white font-bold font-mono focus:outline-none focus:border-cyan-400 tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowMpin(!showMpin)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  {showMpin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* TOTP Secret Key (Base32) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-300 font-bold uppercase flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-cyan-400" />
                  TOTP Secret Key (Base32)
                </label>
                <button
                  type="button"
                  onClick={handleGenerateSampleSecret}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  Generate Test Secret
                </button>
              </div>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  required
                  value={totpSecret}
                  onChange={e => setTotpSecret(e.target.value.toUpperCase())}
                  placeholder="उदा. JBSWY3DPEHPK3PXP"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-cyan-300 font-bold font-mono focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px]">
                <span className="text-slate-400">
                  {isValidBase32(totpSecret) ? (
                    <span className="text-emerald-400 font-semibold">✓ Valid RFC 6238 Base32 Key</span>
                  ) : (
                    <span className="text-amber-400">Typing Base32 Key...</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <HelpCircle className="h-3 w-3" />
                  Secret Key कुठे मिळेल?
                </button>
              </div>
            </div>

            {/* SmartAPI Key */}
            <div>
              <label className="text-[11px] text-slate-300 font-bold uppercase block mb-1">
                Angel One SmartAPI Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="smartapi_key_xxx"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Collapsible Help Guide */}
            {showHelp && (
              <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-slate-300 space-y-1.5 leading-relaxed text-[11px]">
                <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-cyan-400" />
                  Angel One मधून TOTP Secret Key कशी मिळवायची?
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                  <li>Angel One App किंवा smartapi.angelbroking.com मध्ये लॉगिन करा.</li>
                  <li>
                    <strong>My Profile &gt; Security &gt; Enable TOTP</strong> वर जा.
                  </li>
                  <li>तिथे येणाऱ्या QR Code खालील <strong>"Can't scan QR? Copy Secret Key"</strong> वर क्लिक करा.</li>
                  <li>ती Key (उदा. <code className="text-cyan-300">JBSWY3DPEHPK3PXP</code>) वर दिलेल्या बॉक्समध्ये पेस्ट करा.</li>
                  <li>इथून पुढे ही सिस्टिम पायथॉनच्या <code className="text-cyan-300">pyotp</code> प्रमाणे आपोआप TOTP तयार करून लॉगिन करेल!</li>
                </ol>
              </div>
            )}

            {/* Status Message */}
            {statusMsg && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  statusMsg.type === 'SUCCESS'
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : statusMsg.type === 'ERROR'
                    ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                    : 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                }`}
              >
                <span>{statusMsg.text}</span>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-900/40 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Connecting SmartAPI with Auto-TOTP...</span>
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 text-cyan-200" />
                  <span>Auto Generate TOTP &amp; Login with MPIN</span>
                </>
              )}
            </button>
          </form>

          {/* Security & Regulatory Note */}
          <div className="p-3 rounded-xl bg-[#080d1a] border border-slate-800 text-[10px] text-slate-400 leading-relaxed">
            <span className="text-amber-400 font-bold">सुरक्षा सूचना:</span> तुमचे MPIN आणि TOTP Secret थेट Angel One च्या अधिकृत SmartAPI गेटवेवर HTTPS द्वारे वापरले जातात. सिस्टिम दर ३० सेकंदाला आपोआप सुरक्षित टाइम-आधारित ओटीपी तयार करते.
          </div>
        </div>
      </div>
    </div>
  );
};
