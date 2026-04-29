/* ═══════════════════════════════════════════════
   ElectIQ — Global Constants
   Centralized configuration and magic values
   ═══════════════════════════════════════════════ */

export const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60_000,
  RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1_000
};

export const INPUT = {
  MAX_CHARS: 500,
  DEBOUNCE_SEND_MS: 500,
  DEBOUNCE_SEARCH_MS: 300,
  MAX_COMMUNITY_QUESTION_CHARS: 300
};

export const STORAGE_KEYS = {
  SESSION_ID: "electiq_session_id",
  KNOWLEDGE_BASE: "electiq_kb",
  TTS_ENABLED: "electiq_tts",
  TTS_VOICE: "electiq_tts_voice",
  TTS_RATE: "electiq_tts_rate",
  TTS_PITCH: "electiq_tts_pitch",
  HIGH_CONTRAST: "electiq_contrast",
  VOTER_TYPE: "electiq_voter_type"
};

export const GEMINI = {
  MODEL: "gemini-2.0-flash",
  MAX_TOKENS: 1000,
  ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models",
  STREAM_SUFFIX: ":streamGenerateContent?alt=sse"
};

export const ROUTES = {
  CHAT: "/chat",
  TIMELINE: "/timeline", 
  JOURNEY: "/voter-journey",
  GLOSSARY: "/glossary"
};

export const ANALYTICS_EVENTS = {
  FUNNEL_APP_OPENED: "funnel_app_opened",
  FUNNEL_FIRST_MESSAGE: "funnel_first_message",
  CHAT_MESSAGE_SENT: "chat_message_sent",
  TIMELINE_PHASE_VIEWED: "timeline_phase_viewed",
  COMMUNITY_QUESTION_SUBMITTED: "community_question_submitted",
  SCREEN_TIME: "screen_time",
  APP_ERROR: "app_error",
  SESSION_ENDED: "session_ended",
  MESSAGE_SENTIMENT: "message_sentiment",
  PERFORMANCE: "performance"
};

export const TTS_VOICES = [
  { id: "en-IN-Standard-A", label: "Indian English — Female (Standard)" },
  { id: "en-IN-Standard-B", label: "Indian English — Male (Standard)" },
  { id: "en-IN-Wavenet-A",  label: "Premium Indian English (Female)" },
  { id: "en-IN-Wavenet-B",  label: "Premium Indian English (Male)" }
];

export const EXTERNAL_DOMAINS_ALLOWLIST = [
  "voters.eci.gov.in",
  "eci.gov.in",
  "nvsp.in",
  "ceomaharashtra.gov.in"
];

export const ERROR_CODES = {
  NETWORK: "NETWORK_ERROR",
  HTTP: "HTTP_ERROR",
  RATE_LIMIT: "RATE_LIMIT_EXCEEDED",
  VALIDATION: "VALIDATION_FAILED",
  AUTH: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND"
};
