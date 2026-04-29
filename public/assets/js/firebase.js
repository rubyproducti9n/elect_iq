/* ═══════════════════════════════════════════════
   ElectIQ — Firebase & Firestore Module
   Handles session persistence and message history
   ═══════════════════════════════════════════════ */

import Config from './config.js';
import { serviceStatus } from './serviceStatus.js';
import { ok, fail, timed } from './utils.js';
import { STORAGE_KEYS, ERROR_CODES } from './constants.js';
import { initAnalytics } from './analytics.js';

/* ── Firebase SDK Version ── */
const FB_VER = '10.12.0';
const CDN = `https://www.gstatic.com/firebasejs/${FB_VER}`;

/* ── Module State ── */
let app = null;
let db = null;
let analytics = null;
let initialized = false;
let sessionId = null;

/**
 * @description Initializes Firebase services dynamically from CDN
 * @returns {Promise<Result<{app: object, db: object}>>} Result of initialization
 * @throws {never} Errors are returned via Result pattern
 */
export async function initFirebase() {
  if (initialized) return ok({ app, db });

  try {
    const [
      { initializeApp },
      { getFirestore },
      { getAnalytics }
    ] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-firestore.js`),
      import(`${CDN}/firebase-analytics.js`)
    ]);

    const firebaseConfig = {
      apiKey: Config.FIREBASE_API_KEY,
      authDomain: Config.FIREBASE_AUTH_DOMAIN,
      projectId: Config.FIREBASE_PROJECT_ID,
      storageBucket: Config.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: Config.FIREBASE_MESSAGING_SENDER_ID,
      appId: Config.FIREBASE_APP_ID,
      measurementId: Config.FIREBASE_MEASUREMENT_ID,
    };

    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    analytics = getAnalytics(app);
    
    // Inject analytics into its own module for separation of concerns
    await initAnalytics(analytics);
    
    initialized = true;
    serviceStatus.update('analytics', true);
    console.info('[Firebase] Services initialized');
    
    return ok({ app, db });
  } catch (err) {
    serviceStatus.update('analytics', false);
    return fail(ERROR_CODES.HTTP, "Firebase initialization failed.");
  }
}

/* ─────────────────────────────────────────────
   SESSION MANAGEMENT
   ───────────────────────────────────────────── */

/**
 * @description Generates a cryptographically secure session ID
 * @returns {string} The new session ID
 */
function generateSessionId() {
  return `sess_${crypto.randomUUID()}`;
}

/**
 * @description Initializes or resumes a voter session, persisting to Firestore
 * @returns {Promise<Result<string>>} The active session ID
 * @fires Analytics#funnel_app_opened
 */
export async function initSession() {
  return await timed("firebase_init_session", async () => {
    // Check for existing session in persistent storage
    let storedId = null;
    try {
      storedId = localStorage.getItem(STORAGE_KEYS.SESSION_ID);
    } catch {}

    sessionId = storedId || generateSessionId();

    try {
      localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
    } catch {}

    // Ensure session document exists in Firestore
    const initRes = await initFirebase();
    if (!initRes.ok) return ok(sessionId); // Return ID anyway for offline mode

    try {
      const { doc, getDoc, setDoc, serverTimestamp } = await import(`${CDN}/firebase-firestore.js`);
      const sessionRef = doc(db, 'sessions', sessionId);
      const snap = await getDoc(sessionRef);

      if (!snap.exists()) {
        await setDoc(sessionRef, {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.info(`[Firebase] New session record created: ${sessionId}`);
      }
      return ok(sessionId);
    } catch (err) {
      return ok(sessionId); // Fail gracefully for session creation
    }
  });
}

/* ─────────────────────────────────────────────
   MESSAGE PERSISTENCE
   ───────────────────────────────────────────── */

/**
 * @description Saves a chat message to the session's history subcollection
 * @param {string} role - "user" or "assistant"
 * @param {string} content - The message text
 * @returns {Promise<Result<string>>} The document ID of the saved message
 */
export async function saveMessage(role, content) {
  if (!db) await initFirebase();
  if (!db) return fail(ERROR_CODES.HTTP, "Database not available.");

  try {
    const { collection, addDoc, doc, updateDoc, serverTimestamp } = await import(`${CDN}/firebase-firestore.js`);
    const messagesRef = collection(db, 'sessions', sessionId, 'messages');

    const docRef = await addDoc(messagesRef, {
      role,
      text: content.slice(0, 10000), // Safety cap
      timestamp: serverTimestamp(),
      helpful_rating: null,
    });

    // Update session timestamp for LRU-like tracking
    await updateDoc(doc(db, 'sessions', sessionId), {
      updatedAt: serverTimestamp(),
    }).catch(() => {});

    return ok(docRef.id);
  } catch (err) {
    return fail(ERROR_CODES.HTTP, "Failed to save message history.");
  }
}

/**
 * @description Loads previous chat messages for the current session
 * @param {number} [limit] - Maximum messages to retrieve (default: 20)
 * @returns {Promise<Result<Array>>} Array of message objects
 */
export async function loadHistory(limit = 20) {
  return await timed("firestore_load_history", async () => {
    if (!db) await initFirebase();
    if (!db) return ok([]);

    try {
      const { collection, query, orderBy, limitToLast, getDocs } = await import(`${CDN}/firebase-firestore.js`);
      const messagesRef = collection(db, 'sessions', sessionId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'), limitToLast(limit));
      const snap = await getDocs(q);

      const history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return ok(history);
    } catch (err) {
      return ok([]); // Return empty history rather than blocking UI
    }
  });
}

/**
 * @description Submits a voter feedback rating for a specific AI response
 * @param {string} messageId - Firestore ID of the assistant message
 * @param {number} rating - 1 for helpful, -1 for unhelpful
 * @returns {Promise<Result<void>>}
 */
export async function rateMessage(messageId, rating) {
  if (!db) await initFirebase();
  if (!db) return fail(ERROR_CODES.HTTP, "Database not available.");

  try {
    const { doc, updateDoc } = await import(`${CDN}/firebase-firestore.js`);
    const msgRef = doc(db, 'sessions', sessionId, 'messages', messageId);
    await updateDoc(msgRef, { helpful_rating: rating });
    return ok();
  } catch (err) {
    return fail(ERROR_CODES.HTTP, "Failed to update rating.");
  }
}

/* ─────────────────────────────────────────────
   PREFERENCES & SETTINGS
   ───────────────────────────────────────────── */

/**
 * @description Persists user settings across devices using the session document
 * @param {object} prefs - Key-value pair of settings
 * @returns {Promise<Result<void>>}
 */
export async function savePreferences(prefs) {
  if (!db) await initFirebase();
  if (!db) return fail(ERROR_CODES.HTTP, "Database not available.");

  try {
    const { doc, setDoc } = await import(`${CDN}/firebase-firestore.js`);
    await setDoc(doc(db, 'sessions', sessionId, 'preferences', 'user'), {
      ...prefs,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    serviceStatus.update('firestore', true);
    return ok();
  } catch (err) {
    serviceStatus.update('firestore', false);
    return fail(ERROR_CODES.HTTP, "Preferences sync failed.");
  }
}

/**
 * @description Retrieves persisted user settings
 * @returns {Promise<Result<object|null>>} The preference object or null
 */
export async function loadPreferences() {
  if (!db) await initFirebase();
  if (!db) return ok(null);

  try {
    const { doc, getDoc } = await import(`${CDN}/firebase-firestore.js`);
    const snap = await getDoc(doc(db, 'sessions', sessionId, 'preferences', 'user'));
    serviceStatus.update('firestore', true);
    return ok(snap.exists() ? snap.data() : null);
  } catch (err) {
    serviceStatus.update('firestore', false);
    return ok(null);
  }
}

/**
 * @description Returns the current active session ID
 * @returns {string|null}
 */
export function getSessionId() { 
  return sessionId; 
}
