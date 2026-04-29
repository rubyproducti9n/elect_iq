/* ═══════════════════════════════════════════════
   ElectIQ — Community Q&A Module
   Real-time board for shared election queries
   ═══════════════════════════════════════════════ */

import { initFirebase, getSessionId } from './firebase.js';
import { askGemini } from './gemini.js';
import { serviceStatus } from './serviceStatus.js';
import { trackEvent } from './analytics.js';
import { ok, fail, timed, getEl } from './utils.js';
import { ERROR_CODES, INPUT, ANALYTICS_EVENTS } from './constants.js';

/* ── Firebase SDK Version ── */
const FB_VER = '10.12.0';
const CDN = `https://www.gstatic.com/firebasejs/${FB_VER}`;

/* ── Module State ── */
let db = null;
let unsubscribe = null;

/**
 * @description Lazy-loaded database getter
 * @returns {Promise<object>} The Firestore instance
 */
async function getDb() {
  if (db) return db;
  const res = await initFirebase();
  if (res.ok) db = res.value.db;
  return db;
}

/**
 * @description Submits a new question to the public community board
 * @param {string} questionText - The question content
 * @returns {Promise<Result<string>>} Document ID of the new question
 * @fires Analytics#community_question_submitted
 */
export async function submitCommunityQuestion(questionText) {
  return await timed("community_submit_question", async () => {
    const database = await getDb();
    if (!database) return fail(ERROR_CODES.HTTP, "Database unavailable.");

    try {
      const { collection, doc, writeBatch, serverTimestamp, updateDoc, increment } = await import(`${CDN}/firebase-firestore.js`);
      
      const questionsRef = collection(database, 'community_questions');
      const batch = writeBatch(database);
      const newDocRef = doc(questionsRef);
      
      const payload = {
        question: questionText.slice(0, INPUT.MAX_COMMUNITY_QUESTION_CHARS),
        answer: '',
        upvotes: 0,
        timestamp: serverTimestamp(),
        session_id: getSessionId() || 'anonymous',
        resolved: false,
      };

      batch.set(newDocRef, payload);
      await batch.commit();
      
      serviceStatus.update('firestore', true);
      trackEvent(ANALYTICS_EVENTS.COMMUNITY_QUESTION_SUBMITTED);

      // Background AI Answer generation
      generateAIAnswer(newDocRef, questionText);

      return ok(newDocRef.id);
    } catch (err) {
      serviceStatus.update('firestore', false);
      return fail(ERROR_CODES.HTTP, "Failed to submit question.");
    }
  });
}

/**
 * @description Triggers Gemini to answer a community question in the background
 * @param {object} docRef - Firestore document reference
 * @param {string} text - Question text
 * @returns {Promise<void>}
 */
async function generateAIAnswer(docRef, text) {
  const { updateDoc, increment, doc } = await import(`${CDN}/firebase-firestore.js`);
  const database = await getDb();
  
  try {
    const res = await askGemini(text);
    const answer = res.ok ? res.value.text : "We couldn't generate an answer at this time. Please check back later.";
    
    await updateDoc(docRef, { answer, resolved: true });
    
    // Increment global stats
    const statsRef = doc(database, 'stats', 'questions_answered');
    await updateDoc(statsRef, { count: increment(1) }).catch(async () => {
      const { setDoc } = await import(`${CDN}/firebase-firestore.js`);
      await setDoc(statsRef, { count: 1 });
    });
  } catch (err) {
    console.warn('[Community] AI answer failed.');
  }
}

/**
 * @description Increments the upvote count for a specific question
 * @param {string} docId - Question document ID
 * @returns {Promise<Result<void>>}
 */
export async function upvoteQuestion(docId) {
  const database = await getDb();
  if (!database) return fail(ERROR_CODES.HTTP, "Database unavailable.");

  try {
    const { doc, updateDoc, increment } = await import(`${CDN}/firebase-firestore.js`);
    await updateDoc(doc(database, 'community_questions', docId), {
      upvotes: increment(1)
    });
    return ok();
  } catch (err) {
    return fail(ERROR_CODES.HTTP, "Upvote failed.");
  }
}

/**
 * @description Starts a real-time listener for the community board
 * @param {string} containerId - DOM ID for rendering
 * @param {string} [filter] - 'top' or 'week'
 * @returns {Promise<void>}
 */
export async function startCommunityListener(containerId, filter = 'top') {
  const database = await getDb();
  if (!database) return;

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  const { collection, query, orderBy, limit, where, onSnapshot, Timestamp } = await import(`${CDN}/firebase-firestore.js`);
  const ref = collection(database, 'community_questions');
  
  let q;
  if (filter === 'week') {
    const sevenDaysAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    q = query(ref, where('timestamp', '>=', sevenDaysAgo), orderBy('timestamp', 'desc'), limit(10));
  } else {
    q = query(ref, orderBy('upvotes', 'desc'), limit(10));
  }

  unsubscribe = onSnapshot(q, (snap) => {
    renderCommunityBoard(snap, containerId);
    serviceStatus.update('firestore', true);
  }, (err) => {
    serviceStatus.update('firestore', false);
  });
}

/**
 * @description Detaches the real-time listener to save resources
 * @returns {void}
 */
export function stopCommunityListener() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * @description Renders the board based on Firestore snapshots
 * @param {object} snapshot - Firestore snapshot
 * @param {string} containerId - DOM target
 * @returns {void}
 */
function renderCommunityBoard(snapshot, containerId) {
  const list = getEl(containerId);
  if (!list) return;

  if (snapshot.empty) {
    list.innerHTML = `
      <div class="community-empty">
        <span class="material-symbols-outlined">forum</span>
        <p>No questions yet. Be the first to ask!</p>
      </div>`;
    return;
  }

  list.innerHTML = snapshot.docs.map(d => {
    const data = d.data();
    const time = data.timestamp ? formatTimeAgo(data.timestamp.toDate()) : 'just now';
    
    return `
      <div class="community-card" data-id="${d.id}">
        <div class="community-card__question">${escapeHTML(data.question)}</div>
        <div class="community-card__answer ${data.resolved ? '' : 'pending'}">
          ${data.resolved ? escapeHTML(data.answer).slice(0, 500) : 'Generating answer...'}
        </div>
        <div class="community-card__meta">
          <button class="upvote-btn" data-doc-id="${d.id}">
            <span class="material-symbols-outlined">arrow_upward</span>
            <span class="upvote-count">${data.upvotes || 0}</span>
          </button>
          <span class="community-card__time">${time}</span>
        </div>
      </div>`;
  }).join('');

  bindUpvoteActions(list);
}

/**
 * @description Binds click events to upvote buttons using delegation
 * @param {HTMLElement} list - The list container
 * @returns {void}
 */
function bindUpvoteActions(list) {
  list.querySelectorAll('.upvote-btn').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      btn.classList.add('upvoted');
      await upvoteQuestion(btn.dataset.docId);
    };
  });
}

/**
 * @description Simple HTML escaping to prevent injection in community board
 * @param {string} str - Unsafe string
 * @returns {string} Safe string
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * @description Formats a date as a human-readable relative string
 * @param {Date} date - Input date
 * @returns {string}
 */
function formatTimeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * @description Initializes the community page view and wires up submission logic
 * @param {string} containerId - DOM ID for the view
 * @returns {Promise<void>}
 */
export async function initCommunity(containerId) {
  const container = getEl(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="community-board">
      <h1 class="section__title">Community Q&A</h1>
      <div class="community-submit">
        <textarea id="community-input" class="community-input" placeholder="Ask a question..." maxlength="${INPUT.MAX_COMMUNITY_QUESTION_CHARS}"></textarea>
        <button class="btn btn--primary" id="community-submit-btn">Submit</button>
      </div>
      <div class="community-list" id="community-list"></div>
    </div>`;

  getEl('community-submit-btn').onclick = async function() {
    const input = getEl('community-input');
    const text = input.value.trim();
    if (!text) return;

    this.disabled = true;
    const res = await submitCommunityQuestion(text);
    if (res.ok) {
      input.value = '';
    }
    this.disabled = false;
  };

  await startCommunityListener('community-list', 'top');
}
