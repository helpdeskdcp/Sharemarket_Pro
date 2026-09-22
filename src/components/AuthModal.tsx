import React, { useState } from 'react';
import { Shield, Mail, Key, LogIn, CheckCircle2, AlertCircle, Sparkles, Lock, ArrowRight, X } from 'lucide-react';
import { useTrading } from '../context/TradingContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    userSession,
    isAdmin,
    loginAsAdmin,
    loginWithGmail,
    loginWithFirebaseGoogle,
    logoutUser,
  } = useTrading();

  const [activeTab, setActiveTab] = useState<'ADMIN' | 'DEMO_GMAIL'>('ADMIN');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [gmailInput, setGmailInput] = useState('');
  const [gmailName, setGmailName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const success = loginAsAdmin(adminPassword, adminUsername);
    if (success) {
      setSuccessMsg('Administrator logged in successfully! Unlimited Pro Trial unlocked.');
      setTimeout(() => {
        onClose();
      }, 900);
    } else {
      setErrorMsg('Invalid Administrator credentials! Please verify username and password.');
    }
  };

  const handleGmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!gmailInput.includes('@') || !gmailInput.includes('.')) {
      setErrorMsg('Please enter a valid Gmail address (e.g. yourname@gmail.com)');
      return;
    }

    try {
      loginWithGmail(gmailInput, gmailName);
      setSuccessMsg('Demo User registered successfully via Gmail! Index signals unlocked.');
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg(err.message || 'Auto-registration failed.');
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      await loginWithFirebaseGoogle();
      setSuccessMsg('Signed in with Google Firebase! Demo User access activated.');
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      // In sandbox / popup blocked environments, prompt direct Gmail registration
      setErrorMsg('Google Popup was blocked or restricted in preview window. Please enter your Gmail below for 1-click auto-registration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                <Shield className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Chanakya Pro Access Control
                </h2>
                <p className="text-xs text-slate-400">
                  Current Session: <span className="font-semibold text-amber-300">{userSession.name}</span> ({userSession.role === 'ADMINISTRATOR' ? 'Admin 👑' : 'Demo User'})
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Role selector tabs */}
          <div className="grid grid-cols-2 gap-2 mt-5 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveTab('ADMIN');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'ADMIN'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Administrator Login
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('DEMO_GMAIL');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'DEMO_GMAIL'
                  ? 'bg-blue-600 text-white shadow-md font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Demo User (Gmail)
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'ADMIN' ? (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs text-amber-300/90 leading-relaxed">
                👑 <strong>Administrator Privileges:</strong> Full unlimited terminal access, live Angel One SmartAPI streaming, charts, option chain matrix, AI strategies, portfolio execution, webhook alerts, and telegram broadcasts.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Administrator Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    required
                    placeholder="admin"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Administrator Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    placeholder="Enter administrator password"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Password hint: Configured administrator credentials
                </p>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                Login as Administrator (Unlimited Trial)
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 leading-relaxed">
                🎯 <strong>Demo User Scope:</strong> Demo users have instant access strictly to the <strong>Dashboard, Index Selection, and Index-wise Live Chanakya Pro Signals</strong>.
              </div>

              {/* Google Sign-In with Firebase */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl text-xs flex items-center justify-center gap-3 shadow-md transition-all cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                {isLoading ? 'Connecting to Google...' : 'Auto Sign-In with Google (Firebase)'}
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-3 text-[11px] text-slate-500 font-medium uppercase tracking-wider">or sign in with Gmail</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              {/* Gmail Direct Auto-Registration Form */}
              <form onSubmit={handleGmailSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Your Gmail Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={gmailInput}
                      onChange={(e) => setGmailInput(e.target.value)}
                      required
                      placeholder="e.g. trader.mumbai@gmail.com"
                      className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Mail className="w-4 h-4 text-slate-500 absolute right-3.5 top-2.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Trader Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={gmailName}
                    onChange={(e) => setGmailName(e.target.value)}
                    placeholder="e.g. Rahul Patil"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  Auto-Register & Enter Demo User Signals
                </button>
              </form>
            </div>
          )}

          {/* Current session info and quick logout */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Signed in: <strong className="text-slate-200">{userSession.username}</strong></span>
            {userSession.role === 'ADMINISTRATOR' ? (
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Unlimited Pro
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('ADMIN')}
                className="text-amber-400 hover:underline font-semibold"
              >
                Switch to Admin Login
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
