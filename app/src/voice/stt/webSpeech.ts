import type { Hypothesis, Lang, SttEngine, SttErrorCode, SttEvent } from './types';

/*
 * The browser's own speech recognition (Web Speech API; ТЗ 6.2). Up to 5 variants with confidence, interim words,
 * an exact error code (not just «didn't catch it»), and optional hints / on-device recognition used only where the browser
 * offers them. No audio is touched here: the browser does the listening and hands over text (H3).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => (typeof window === 'undefined' ? undefined : (window as any));
export const speechCtor = (): (new () => Rec) | null => win()?.SpeechRecognition || win()?.webkitSpeechRecognition || null;

const ERR: Record<string, SttErrorCode> = {
  'not-allowed': 'denied', 'service-not-allowed': 'service-blocked', 'no-speech': 'no-speech', 'audio-capture': 'audio-capture',
  network: 'network', aborted: 'aborted', 'language-not-supported': 'unsupported', 'bad-grammar': 'unknown',
};
const RESTART_GAP_MS = 120; // a new instance right after onend throws InvalidStateError
const LOCALE: Record<Lang, string> = { ru: 'ru-RU', en: 'en-US' };

/** which on-device capabilities the browser reports (cached; the answer is async but start() must be sync) */
const localCache = new Map<Lang, boolean>();
export async function probeLocal(lang: Lang): Promise<boolean> {
  if (localCache.has(lang)) return localCache.get(lang)!;
  let ok = false;
  try {
    const C = win()?.SpeechRecognition;
    const state = await C?.available?.({ langs: [LOCALE[lang]], processLocally: true });
    ok = state === 'available';
  } catch { /* not supported */ }
  localCache.set(lang, ok);
  return ok;
}
export const localAvailable = (lang: Lang) => localCache.get(lang) === true;

export function createWebSpeech(opts: { useLocal?: () => boolean; onWarn?: (code: string) => void } = {}): SttEngine {
  const listeners = new Set<(e: SttEvent) => void>();
  const emit = (e: SttEvent) => { for (const l of [...listeners]) l(e); };
  let rec: Rec | null = null;
  let lastEnd = 0;
  let warned = false;
  const warnOnce = (code: string) => { if (!warned) { warned = true; opts.onWarn?.(code); } };

  const engine: SttEngine = {
    id: 'webspeech',
    available: async () => !!speechCtor(),
    start({ lang, phrases, dictation = false }) {
      const C = speechCtor();
      if (!C) { emit({ type: 'error', code: 'unsupported' }); return; }
      if (rec) { try { rec.abort(); } catch { /* already gone */ } rec = null; }
      const wait = Math.max(0, RESTART_GAP_MS - (Date.now() - lastEnd));
      const go = () => {
        let r: Rec;
        try { r = new C(); } catch { emit({ type: 'error', code: 'busy' }); return; }
        rec = r;
        r.lang = LOCALE[lang]; r.interimResults = true; r.maxAlternatives = 5; r.continuous = dictation;
        // hints and on-device processing: only if the browser has them, never fatal
        try {
          const W = win();
          if ('phrases' in r && W?.SpeechRecognitionPhrase && phrases.length) r.phrases = phrases.slice(0, 100).map((p) => new W.SpeechRecognitionPhrase(p, 5.0));
        } catch { warnOnce('phrases-unsupported'); }
        try { if ('processLocally' in r && opts.useLocal?.() && localAvailable(lang)) r.processLocally = true; } catch { warnOnce('phrases-unsupported'); }

        let finals = '';
        let lastAlts: Hypothesis[] = [];
        let stopped = false, aborted = false, failed = false;
        const altsOf = (res: ArrayLike<{ transcript: string; confidence: number }>, prefix: string): Hypothesis[] =>
          Array.from(res).slice(0, 5).map((a) => ({ text: (prefix + a.transcript).trim(), confidence: a.confidence > 0 ? a.confidence : null }));

        r.onstart = () => emit({ type: 'start' });
        r.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; length: number; [i: number]: { transcript: string; confidence: number } }> }) => {
          let interim = '';
          let current: Hypothesis[] | null = null;
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
              const best = res[0].transcript.trim();
              // a repeated final (some browsers re-send it): replace, do not append
              if (best && (finals === best || finals.endsWith(' ' + best))) continue;
              if (best && best.includes(finals.trim()) && finals) finals = ''; // the new final contains the old one
              current = altsOf(res as never, finals ? finals + ' ' : '');
              finals = (finals ? finals + ' ' : '') + best;
            } else {
              interim += res[0].transcript;
              current = altsOf(res as never, finals ? finals + ' ' : '');
            }
          }
          const text = (finals + ' ' + interim).replace(/\s+/g, ' ').trim();
          if (current?.length) lastAlts = current;
          emit({ type: 'interim', text, alts: current ?? lastAlts });
        };
        r.onerror = (e: { error: string; message?: string }) => {
          failed = true;
          emit({ type: 'error', code: ERR[e.error] ?? 'unknown', raw: e.error });
        };
        r.onend = () => {
          lastEnd = Date.now();
          if (rec === r) rec = null;
          const text = (finals || lastAlts[0]?.text || '').trim();
          if (text && !failed) {
            const alts = lastAlts.length ? lastAlts.map((a, i) => (i === 0 ? { ...a, text } : a)) : [{ text, confidence: null }];
            emit({ type: 'final', alts });
            emit({ type: 'end', reason: 'final' });
          } else emit({ type: 'end', reason: aborted ? 'aborted' : failed ? 'no-speech' : stopped ? 'stopped' : 'no-speech' });
        };
        (r as { __flags?: unknown }).__flags = { stop: () => { stopped = true; }, abort: () => { aborted = true; } };
        try { r.start(); } catch { rec = null; emit({ type: 'error', code: 'busy' }); }
      };
      if (wait > 0) setTimeout(go, wait); else go();
    },
    stop() { try { (rec as { __flags?: { stop: () => void } })?.__flags?.stop(); rec?.stop(); } catch { /* already stopped */ } },
    abort() { try { (rec as { __flags?: { abort: () => void } })?.__flags?.abort(); rec?.abort(); } catch { /* noop */ } rec = null; },
    on(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
  return engine;
}
