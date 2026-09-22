import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, User, onAuthStateChanged } from 'firebase/auth';
import { UserSession, UserRole } from '../types/market';

// Firebase Client App Configuration
// Allows environment variables or graceful client-side initialization
const env = (import.meta as any).env || {};
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyChanakyaProLiveTradingKey2026',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'chanakya-pro-trading.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'chanakya-pro-trading',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'chanakya-pro-trading.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '499863477296',
  appId: env.VITE_FIREBASE_APP_ID || '1:499863477296:web:89a1982b8109dca',
};

let app: FirebaseApp | null = null;
let auth: ReturnType<typeof getAuth> | null = null;

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
} catch (err) {
  console.warn('Firebase initialization notice:', err);
}

const STORAGE_KEY = 'chanakya_pro_user_session';

// Administrator Credentials specified by user
export const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'Dcp@1982',
};

/**
 * Validates Administrator Login Credentials
 */
export function authenticateAdministrator(username: string, password: string): UserSession | null {
  const trimmedUser = username.trim().toLowerCase();
  const trimmedPass = password.trim();

  if (
    trimmedUser === ADMIN_CREDENTIALS.username.toLowerCase() &&
    (trimmedPass === 'Dcp@1982' || trimmedPass === 'Dcp@1982.')
  ) {
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
  }
  return null;
}

/**
 * Sign In with Google / Gmail via Firebase Auth
 */
export async function signInWithGoogleFirebase(): Promise<UserSession> {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    const user: User = result.user;

    const demoSession: UserSession = {
      username: user.email ? user.email.split('@')[0] : 'demo_user',
      email: user.email || 'demouser@gmail.com',
      name: user.displayName || 'Demo User',
      photoURL: user.photoURL || undefined,
      role: 'DEMO_USER',
      isUnlimited: false,
      loginTime: new Date().toISOString(),
      authProvider: 'FIREBASE_GOOGLE',
    };

    saveUserSession(demoSession);
    return demoSession;
  } catch (err: any) {
    // If popup is blocked by iframe or browser environment, provide streamlined Gmail auto-registration
    console.warn('Firebase Google Sign-In popup notice, using auto-registration:', err);
    throw err;
  }
}

/**
 * Auto-Registration / Sign-In for Gmail Demo Users
 */
export function autoRegisterGmailDemoUser(email: string, name?: string): UserSession {
  const cleanEmail = email.trim().toLowerCase();
  const username = cleanEmail.split('@')[0] || 'demo_user';
  const displayName = name?.trim() || username.charAt(0).toUpperCase() + username.slice(1);

  const demoSession: UserSession = {
    username,
    email: cleanEmail,
    name: displayName,
    role: 'DEMO_USER',
    isUnlimited: false,
    loginTime: new Date().toISOString(),
    authProvider: 'GMAIL_AUTO',
  };

  saveUserSession(demoSession);
  return demoSession;
}

/**
 * Retrieve Stored User Session from Local Storage
 */
export function getSavedUserSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session && session.role) {
      return session;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Save User Session to Local Storage
 */
export function saveUserSession(session: UserSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Could not save user session to localStorage', err);
  }
}

/**
 * Sign Out / Clear Current Session
 */
export async function logoutUserSession(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
    if (auth && auth.currentUser) {
      await fbSignOut(auth);
    }
  } catch (err) {
    console.warn('Error during sign out:', err);
  }
}
