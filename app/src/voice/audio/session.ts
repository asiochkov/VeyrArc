import { realClock, type Clock } from '../stt/endpointing';
import type { Lang, SttEngine, SttErrorCode, SttEvent } from '../stt/types';

/*
 * The one owner of the microphone (ТЗ 6.1): states idle | requesting | live | speaking | closed. Listening starts only from
 * a gesture and with no await before engine.start() (iOS drops the permission prompt otherwise). While the voice speaks
 * nothing is recognised; while recognising, speech is cut. Leaving the tab aborts quietly. A network failure retries at
 * 1, 2 and 4 s. The outcome of real starts is remembered for 7 days so a browser that cannot do speech opens on typing.
 */
export type SessionState = 'idle' | 'requesting' | 'live' | 'speaking' | 'closed';
export type Permission = 'granted' | 'prompt' | 'denied' | 'unknown';
export type Health = 'ok' | 'blocked' | 'broken';
export type SessionEvent =
  | SttEvent
  | { type: 'state'; state: SessionState }
  | { type: 'retrying'; attempt: number; inMs: number };

export const HEALTH_KEY = 'veyrarc.voice.health.v1';
export const HEALTH_TTL_MS = 7 * 24 * 3600 * 1000;
export const NETWORK_RETRY_MS = [1000, 2000, 4000];
/** codes that offer «Повторить» (6.13.2) */
export const RETRYABLE: SttErrorCode[] = ['no-speech', 'network', 'audio-capture', 'busy', 'unknown'];
/** key under i18n voice.err.* */
export const errKey = (code: SttErrorCode): string => (code === 'aborted' ? 'unknown' : code);

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
export type SessionDeps = {
  engine: SttEngine;
  clock?: Clock;
  storage?: Store | null;
  /** stops the voice at once */
  cancelSpeech?: () => void;
  visible?: () => boolean;
  /** document / window for lifecycle events; omitted in tests that call the handlers directly */
  target?: { addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void } | null;
};

type Rec = { status: Health; at: number; fails: number };

export function createSession(deps: SessionDeps) {
  const { engine } = deps;
  const clock = deps.clock ?? realClock;
  const visible = deps.visible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const store = (): Store | null => { try { return deps.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : deps.storage; } catch { return null; } };
  const listeners = new Set<(e: SessionEvent) => void>();
  let state: SessionState = 'idle';
  let last: { lang: Lang; phrases: string[]; dictation?: boolean } | null = null;
  let retries = 0;
  let retryTimer: unknown = null;
  let userStopped = false;
  let cleanups: (() => void)[] = [];

  const emit = (e: SessionEvent) => { for (const l of [...listeners]) l(e); };
  const setState = (s: SessionState) => { if (s === state) return; state = s; emit({ type: 'state', state: s }); };
  const clearRetry = () => { if (retryTimer) clock.clearTimeout(retryTimer); retryTimer = null; };

  /* ---------- health ---------- */
  const readRec = (): Rec | null => {
    try {
      const raw = store()?.getItem(HEALTH_KEY); if (!raw) return null;
      const r = JSON.parse(raw) as Rec;
      return clock.now() - r.at > HEALTH_TTL_MS ? null : r;
    } catch { return null; }
  };
  const writeRec = (r: Rec) => { try { store()?.setItem(HEALTH_KEY, JSON.stringify(r)); } catch { /* storage is optional */ } };
  const health = (): Health | null => readRec()?.status ?? null;
  const resetHealth = () => { try { store()?.removeItem(HEALTH_KEY); } catch { /* optional */ } };
  const noteResult = () => { const r = readRec(); if (r?.status !== 'ok' || r.fails) writeRec({ status: 'ok', at: clock.now(), fails: 0 }); };
  const noteFailure = (code: SttErrorCode) => {
    if (code === 'denied') { writeRec({ status: 'blocked', at: clock.now(), fails: 0 }); return; }
    if (code === 'unsupported' || code === 'service-blocked' || code === 'audio-capture') {
      const prev = readRec();
      // two failures in a row without a single result in between
      const fails = (prev?.fails ?? 0) + 1;
      writeRec({ status: fails >= 2 ? 'broken' : prev?.status ?? 'ok', at: clock.now(), fails });
    }
  };

  /* ---------- engine events ---------- */
  engine.on((e) => {
    if (e.type === 'start') { setState('live'); }
    if ((e.type === 'interim' || e.type === 'final') && (e.type === 'interim' ? e.text : e.alts[0]?.text)) { retries = 0; noteResult(); }
    if (e.type === 'error') {
      if (e.code === 'network' && !userStopped && visible() && retries < NETWORK_RETRY_MS.length && last) {
        const inMs = NETWORK_RETRY_MS[retries++];
        emit({ type: 'retrying', attempt: retries, inMs });
        clearRetry();
        retryTimer = clock.setTimeout(() => { retryTimer = null; if (!userStopped && visible() && last && state !== 'closed') { setState('requesting'); engine.start(last); } }, inMs);
        return; // the error is held back until the retries are used up
      }
      noteFailure(e.code);
      if (e.code !== 'aborted') setState('idle');
    }
    if (e.type === 'end') {
      if (retryTimer) return; // a retry is pending: stay «requesting»
      if (state !== 'closed') setState('idle');
    }
    emit(e);
  });

  /* ---------- public ---------- */
  /** Call synchronously from a click / pointerdown / keydown handler: nothing async before engine.start(). */
  function startFromGesture(o: { lang: Lang; phrases: string[]; dictation?: boolean }): boolean {
    if (state === 'closed' || state === 'requesting' || state === 'live') return false;
    deps.cancelSpeech?.(); // recognition and speech never overlap
    clearRetry();
    last = o; retries = 0; userStopped = false;
    setState('requesting');
    engine.start(o);
    return true;
  }
  const stop = () => { userStopped = true; clearRetry(); engine.stop(); };
  const abort = () => { userStopped = true; clearRetry(); engine.abort(); if (state !== 'closed') setState('idle'); };
  /** the voice began / stopped speaking */
  const speaking = (on: boolean) => {
    if (state === 'closed') return;
    if (on) { if (state === 'live' || state === 'requesting') { userStopped = true; engine.abort(); } setState('speaking'); } else if (state === 'speaking') setState('idle');
  };
  /** permission state without prompting (Safari may not support the query) */
  async function permission(): Promise<Permission> {
    try {
      const nav = typeof navigator === 'undefined' ? undefined : (navigator as unknown as { permissions?: { query(d: { name: string }): Promise<{ state: string }> } });
      if (!nav?.permissions) return 'unknown';
      const s = (await nav.permissions.query({ name: 'microphone' })).state;
      return s === 'granted' || s === 'prompt' || s === 'denied' ? s : 'unknown';
    } catch { return 'unknown'; }
  }

  /* leaving for the background aborts quietly; coming back starts nothing; a changed device resets the probe */
  const onHide = () => { if (state === 'live' || state === 'requesting') abort(); };
  const onVis = () => { if (!visible()) onHide(); };
  const onDevice = () => resetHealth();
  const t = deps.target === undefined ? (typeof document === 'undefined' ? null : document) : deps.target;
  if (t) {
    t.addEventListener('visibilitychange', onVis);
    cleanups.push(() => t.removeEventListener('visibilitychange', onVis));
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onHide);
      cleanups.push(() => window.removeEventListener('pagehide', onHide));
    }
    const md = typeof navigator !== 'undefined' ? (navigator as unknown as { mediaDevices?: { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } }).mediaDevices : undefined;
    if (md?.addEventListener) { md.addEventListener('devicechange', onDevice); cleanups.push(() => md.removeEventListener?.('devicechange', onDevice)); }
  }

  return {
    get state() { return state; },
    on(cb: (e: SessionEvent) => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    startFromGesture, stop, abort, speaking, permission, health, resetHealth,
    /** the panel opens on the text field and offers «Попробовать голос ещё раз» */
    voiceBroken: () => readRec()?.status === 'broken',
    handleHidden: onHide,
    close() { abort(); setState('closed'); for (const c of cleanups) c(); cleanups = []; listeners.clear(); },
  };
}
export type AudioSession = ReturnType<typeof createSession>;
