/* ═══════════════════════════════════════════════
   ElectIQ — Firebase Init, Firestore & Analytics
   ═══════════════════════════════════════════════ */

import Config from './config.js';

let app = null;
let db = null;
let analytics = null;
let initialized = false;

/**
 * Initialize Firebase services.
 * Uses dynamic imports from CDN to avoid bundling the SDK.
 */
export async function initFirebase() {
  if (initialized) return { app, db, analytics };

  try {
    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
    );
    const { getFirestore } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );
    const { getAnalytics, logEvent: _logEvent } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js'
    );

    const firebaseConfig = {
      apiKey:            Config.FIREBASE_API_KEY,
      authDomain:        Config.FIREBASE_AUTH_DOMAIN,
      projectId:         Config.FIREBASE_PROJECT_ID,
      storageBucket:     Config.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: Config.FIREBASE_MESSAGING_SENDER_ID,
      appId:             Config.FIREBASE_APP_ID,
      measurementId:     Config.FIREBASE_MEASUREMENT_ID,
    };

    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    analytics = getAnalytics(app);
    initialized = true;

    console.info('[ElectIQ] Firebase initialized');
    return { app, db, analytics };
  } catch (error) {
    console.error('[ElectIQ] Firebase init failed:', error);
    throw error;
  }
}

/* ── Firestore Helpers ── */

/**
 * Save a chat session to Firestore.
 */
export async function saveChatSession(sessionId, messages) {
  if (!db) await initFirebase();
  const { doc, setDoc, serverTimestamp } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
  );
  return setDoc(doc(db, 'chatSessions', sessionId), {
    messages,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Load a chat session from Firestore.
 */
export async function loadChatSession(sessionId) {
  if (!db) await initFirebase();
  const { doc, getDoc } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
  );
  const snap = await getDoc(doc(db, 'chatSessions', sessionId));
  return snap.exists() ? snap.data() : null;
}

/**
 * Log a custom analytics event.
 */
export async function logAnalyticsEvent(eventName, params = {}) {
  if (!analytics) {
    try { await initFirebase(); } catch { return; }
  }
  const { logEvent } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js'
  );
  logEvent(analytics, eventName, params);
}

/**
 * Save user feedback for a response.
 */
export async function saveFeedback(messageId, rating, comment = '') {
  if (!db) await initFirebase();
  const { collection, addDoc, serverTimestamp } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
  );
  return addDoc(collection(db, 'feedback'), {
    messageId,
    rating,
    comment,
    createdAt: serverTimestamp(),
  });
}
