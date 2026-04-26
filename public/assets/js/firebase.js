/* ═══════════════════════════════════════════════
   ElectIQ — Firebase Integration (v2)
   ─────────────────────────────────────────────
   SERVICE 1: Firebase Analytics (custom events)
   SERVICE 2: Firestore (session / message persistence)

   Config is read from <meta> tags via Config module.
   Firebase SDK is dynamically imported from CDN.
   ═══════════════════════════════════════════════ */

import Config from './config.js';

/* ── Firebase SDK Version ── */
const FB_VER = '10.12.0';
const CDN    = `https://www.gstatic.com/firebasejs/${FB_VER}`;

/* ── Module-level singletons ── */
let app       = null;
let db        = null;
let analytics = null;
let initialized = false;
let sessionId   = null;

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */

/**
 * Initialize Firebase App, Firestore, and Analytics.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initFirebase() {
  if (initialized) return { app, db, analytics };

  try {
    const { initializeApp }  = await import(`${CDN}/firebase-app.js`);
    const { getFirestore }   = await import(`${CDN}/firebase-firestore.js`);
    const { getAnalytics, logEvent: _logEvent } = await import(`${CDN}/firebase-analytics.js`);

    const firebaseConfig = {
      apiKey:            Config.FIREBASE_API_KEY,
      authDomain:        Config.FIREBASE_AUTH_DOMAIN,
      projectId:         Config.FIREBASE_PROJECT_ID,
      storageBucket:     Config.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: Config.FIREBASE_MESSAGING_SENDER_ID,
      appId:             Config.FIREBASE_APP_ID,
      measurementId:     Config.FIREBASE_MEASUREMENT_ID,
    };

    app       = initializeApp(firebaseConfig);
    db        = getFirestore(app);
    analytics = getAnalytics(app);
    initialized = true;

    console.info('[Firebase] Initialized successfully');
    return { app, db, analytics };
  } catch (error) {
    console.error('[Firebase] Init failed:', error);
    throw error;
  }
}

/* ═══════════════════════════════════════════════
   SERVICE 1: ANALYTICS
   Custom events:
   • chat_message_sent   { question_length, session_id }
   • timeline_phase_viewed { phase_name }
   • voice_input_used    {}
   • suggested_question_clicked { question_text }
   • glossary_term_viewed { term }
   ═══════════════════════════════════════════════ */

/**
 * Log a custom analytics event.
 * Silently no-ops if analytics is not available.
 * @param {string} eventName
 * @param {Object} params
 */
export async function logAnalyticsEvent(eventName, params = {}) {
  try {
    if (!analytics) {
      await initFirebase();
    }
    if (!analytics) return; // still null → bail silently

    const { logEvent } = await import(`${CDN}/firebase-analytics.js`);

    // Always attach session_id when available
    const enrichedParams = { ...params };
    if (sessionId) enrichedParams.session_id = sessionId;

    logEvent(analytics, eventName, enrichedParams);
  } catch {
    // Analytics failure should never break the app
  }
}

/* ═══════════════════════════════════════════════
   SERVICE 2: FIRESTORE — SESSION / MESSAGE PERSISTENCE
   Schema:
     sessions/{session_id}
       ├─ createdAt: Timestamp
       ├─ updatedAt: Timestamp
       └─ messages (subcollection)
            ├─ {auto-id}
            │   ├─ role: "user" | "assistant"
            │   ├─ text: string
            │   ├─ timestamp: Timestamp
            │   └─ helpful_rating: null | 1 | -1
   ═══════════════════════════════════════════════ */

const SESSION_KEY = 'electiq_session_id';

/**
 * Generate a random session ID (UUID-v4-like).
 */
function generateSessionId() {
  return 'sess_' + crypto.randomUUID();
}

/**
 * Initialize or resume a session.
 * Creates a Firestore document if it doesn't exist yet.
 * Persists the session_id in localStorage for continuity.
 * @returns {Promise<string>} The active session ID
 */
export async function initSession() {
  // 1. Check localStorage for an existing session
  let storedId = null;
  try {
    storedId = localStorage.getItem(SESSION_KEY);
  } catch { /* localStorage unavailable */ }

  sessionId = storedId || generateSessionId();

  // Persist back
  try {
    localStorage.setItem(SESSION_KEY, sessionId);
  } catch { /* ignore */ }

  // 2. Ensure Firestore session doc exists
  try {
    if (!db) await initFirebase();
    if (!db) return sessionId; // no Firestore → return ID only

    const { doc, getDoc, setDoc, serverTimestamp } = await import(`${CDN}/firebase-firestore.js`);
    const sessionRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sessionRef);

    if (!snap.exists()) {
      await setDoc(sessionRef, {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.info(`[Firebase] New session created: ${sessionId}`);
    } else {
      console.info(`[Firebase] Session resumed: ${sessionId}`);
    }
  } catch (err) {
    console.warn('[Firebase] Session init failed (offline?):', err.message);
  }

  return sessionId;
}

/**
 * Save a single message to the session's messages subcollection.
 * @param {"user"|"assistant"} role
 * @param {string} text
 * @returns {Promise<string|null>} The Firestore document ID, or null on failure
 */
export async function saveMessage(role, text) {
  if (!sessionId) await initSession();
  if (!db) {
    try { await initFirebase(); } catch { return null; }
  }
  if (!db) return null;

  try {
    const { collection, addDoc, serverTimestamp } = await import(`${CDN}/firebase-firestore.js`);
    const messagesRef = collection(db, 'sessions', sessionId, 'messages');

    const docRef = await addDoc(messagesRef, {
      role,
      text: text.slice(0, 10_000), // cap at 10 KB
      timestamp: serverTimestamp(),
      helpful_rating: null,
    });

    // Update session's updatedAt
    const { doc, updateDoc } = await import(`${CDN}/firebase-firestore.js`);
    await updateDoc(doc(db, 'sessions', sessionId), {
      updatedAt: serverTimestamp(),
    }).catch(() => {});

    return docRef.id;
  } catch (err) {
    console.warn('[Firebase] saveMessage failed:', err.message);
    return null;
  }
}

/**
 * Load the last N messages for a given session.
 * @param {string} sid - Session ID (defaults to current)
 * @param {number} limit - Max messages to return (default 20)
 * @returns {Promise<Array<{id, role, text, timestamp, helpful_rating}>>}
 */
export async function loadHistory(sid, limit = 20) {
  const targetId = sid || sessionId;
  if (!targetId) return [];
  if (!db) {
    try { await initFirebase(); } catch { return []; }
  }
  if (!db) return [];

  try {
    const { collection, query, orderBy, limitToLast, getDocs } =
      await import(`${CDN}/firebase-firestore.js`);

    const messagesRef = collection(db, 'sessions', targetId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limitToLast(limit));
    const snap = await getDocs(q);

    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
  } catch (err) {
    console.warn('[Firebase] loadHistory failed:', err.message);
    return [];
  }
}

/**
 * Rate a specific message as helpful (+1) or unhelpful (-1).
 * @param {string} messageId - Firestore doc ID in the messages subcollection
 * @param {1|-1} rating
 */
export async function rateMessage(messageId, rating) {
  if (!sessionId || !messageId) return;
  if (!db) {
    try { await initFirebase(); } catch { return; }
  }
  if (!db) return;

  try {
    const { doc, updateDoc } = await import(`${CDN}/firebase-firestore.js`);
    const msgRef = doc(db, 'sessions', sessionId, 'messages', messageId);
    await updateDoc(msgRef, { helpful_rating: rating });
  } catch (err) {
    console.warn('[Firebase] rateMessage failed:', err.message);
  }
}

/* ── Convenience: get current session ID ── */
export function getSessionId() {
  return sessionId;
}
