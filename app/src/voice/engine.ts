import { useLangStore } from '../i18n';
import { journalAppend } from './journal';
import { normalize, similarity, takeTime, understand, type Intent } from './nlu';
import { decide } from './nlp/decide';
import { hints, runAll, type Choice, type Reply } from './run';
import { closeAssistant, useAssistant, useVoice, voiceSupported } from './shell';

/*
 * Voice 2.0 — the engine (ТЗ §5.2): speech recognition, NLU, execution and TTS. Loaded lazily
 * by shell.ts's openAssistant() — never part of the main bundle. State lives in shell.ts's
 * useVoice/useAssistant so the lightweight shell keeps working even before this chunk resolves.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR = (): (new () => Rec) | null => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);

let rec: Rec | null = null;
let resetTimer: ReturnType<typeof setTimeout> | undefined;
let silence: ReturnType<typeof setTimeout> | undefined;

// A-06/§6.1.5: the mic kept recording in a backgrounded tab — nothing ever stopped it.
// This chunk only loads once the assistant has opened, so registering once at module scope is enough.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden && rec) cancelVoice(); });
  window.addEventListener('pagehide', () => { if (rec) cancelVoice(); });
}
const set = (p: Partial<ReturnType<typeof useVoice.getState>>) => useVoice.setState(p);
const lang = () => useLangStore.getState().lang as 'ru' | 'en';

function fail(msg: string) {
  set({ state: 'error', reply: msg, ok: false });
  navigator.vibrate?.([20, 40, 20]);
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => set({ state: 'idle' }), 4000);
}

/** a voice that sounds natural for the language, if the device has one */
function pickVoice(code: string) {
  const vs = window.speechSynthesis?.getVoices?.() ?? [];
  const mine = vs.filter((v) => v.lang?.toLowerCase().startsWith(code));
  return mine.find((v) => /premium|enhanced|natural|milena|yuri|siri|google/i.test(v.name)) ?? mine[0];
}
let muted = false;
export const setMuted = (v: boolean) => { muted = v; if (v) window.speechSynthesis?.cancel(); };
/** C-03: a chunk of a multi-sentence reply, chained via onend so each sentence is its own utterance
 * with a natural pause between — was one long monologue glued together with '. '. */
function speakChunk(synth: SpeechSynthesis, chunks: string[], i: number, done: () => void) {
  if (i >= chunks.length) { done(); return; }
  const u = new SpeechSynthesisUtterance(chunks[i]);
  u.lang = lang() === 'ru' ? 'ru-RU' : 'en-US';
  const v = pickVoice(lang());
  if (v) u.voice = v;
  u.rate = 1.04;
  if (i === 0) u.onstart = () => set({ state: 'speaking' });
  u.onend = () => speakChunk(synth, chunks, i + 1, done);
  u.onerror = () => speakChunk(synth, chunks, i + 1, done);
  synth.speak(u);
}
function speak(text: string, then?: () => void) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const done = () => {
    clearTimeout(resetTimer);
    if (then) { then(); return; }
    resetTimer = setTimeout(() => { if (useVoice.getState().state === 'speaking') set({ state: 'idle' }); }, 1800);
  };
  if (!synth || muted) { set({ state: 'speaking' }); setTimeout(done, 400); return; }
  synth.cancel();
  // spoken without the list marks and quotes; each sentence becomes its own utterance (C-03)
  const clean = text.replace(/[«»"“”]/g, '').replace(/ · /g, ', ');
  const chunks = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  speakChunk(synth, chunks.length ? chunks : [clean], 0, done);
  // autoplay policy may keep it silent: the text still shows the answer
  setTimeout(() => { if (useVoice.getState().state === 'processing') { set({ state: 'speaking' }); setTimeout(done, 1200); } }, 900);
}

let closeAfter: ReturnType<typeof setTimeout> | undefined;
function show(r: Reply) {
  set({ state: 'speaking', reply: r.say, ok: r.ok, list: r.list ?? [], suggest: r.suggest ?? [], choices: r.choices ?? [], canUndo: !!r.undo, pendingSlot: r.ask ?? null });
  journalAppend(useVoice.getState().heard, r.say, r.ok);
  navigator.vibrate?.(r.ok ? 15 : [20, 40, 20]);
  // a question (choice or ask-slot): listen for the answer right after it is asked
  speak(r.say, (r.choices?.length || r.ask) && voiceSupported() ? () => startVoice() : undefined);
  if (r.close) { clearTimeout(closeAfter); closeAfter = setTimeout(() => closeAssistant(), 900); }
}

const YES = /^(?:да|ага|угу|давай|конечно|ок|окей|верно|точно|правильно|подтверждаю|yes|yeah|yep|sure|ok)(?:\s|$)/;
const NO = /^(?:нет|не надо|не нужно|отмена|отмени|не|no|nope|cancel)(?:\s|$)/;
const ORD: [RegExp, number][] = [[/^(?:перв|1|один|one|first)/, 0], [/^(?:втор|2|два|two|second)/, 1], [/^(?:трет|3|три|three|third)/, 2]];
/** an answer to the assistant's question: yes / no / «второе» / the option's name */
function answerChoice(text: string, choices: Choice[]): Reply | null | 'cancel' {
  const t = normalize(text);
  const yesOpt = choices.find((c) => c.yes) ?? (choices.length <= 2 ? choices[0] : undefined);
  if (YES.test(t) && yesOpt) return yesOpt.run();
  if (NO.test(t)) { const no = choices.find((c) => c.yes === false); return no ? no.run() : 'cancel'; }
  for (const [re, i] of ORD) if (re.test(t) && choices[i]) return choices[i].run();
  const best = choices.map((c) => ({ c, s: similarity(t, c.label) })).sort((a, b) => b.s - a.s)[0];
  if (best && best.s >= 0.5) return best.c.run();
  return null;
}

/** run a phrase (spoken, typed or a tapped suggestion) */
export function handle(text: string) {
  const said = text.trim();
  if (!said) return;
  set({ state: 'processing', heard: said });
  try {
    const slot = useVoice.getState().pendingSlot;
    if (slot?.slot === 'taskAdd.time') {
      set({ pendingSlot: null });
      const tm = takeTime(normalize(said), new Date());
      if (tm.time) { show(runAll([{ kind: 'taskAdd', title: slot.title, day: slot.day, time: tm.time, end: tm.end }], lang())); return; }
      // didn't catch a time: fall through and treat it as a fresh command instead of re-asking forever
    }
    const pending = useVoice.getState().choices;
    if (pending.length) {
      const r = answerChoice(said, pending);
      if (r === 'cancel') { show({ ok: true, say: lang() === 'ru' ? 'Хорошо, отменил' : 'Okay, cancelled' }); return; }
      if (r) { show(r); return; }
      set({ choices: [] }); // not an answer: a new command
    }
    const intents = understand(said);
    if (decide(intents).action === 'confirm') { show(confirmReply(intents, said, lang())); return; }
    show(runAll(intents, lang()));
  } catch (e) {
    console.error('[voice]', e);
    fail(lang() === 'ru' ? 'Не получилось выполнить команду' : 'Could not do that');
  }
}

/** a risky (R2+) command: ask before doing it (fixes C-05, D-01) */
function confirmReply(intents: Intent[], said: string, ru2: 'ru' | 'en'): Reply {
  const ru = ru2 === 'ru';
  return {
    ok: true,
    say: ru ? `Точно — «${said}»?` : `Confirm — "${said}"?`,
    choices: [
      { label: ru ? 'Да' : 'Yes', yes: true, run: () => runAll(intents, ru2) },
      { label: ru ? 'Отмена' : 'Cancel', yes: false, run: () => ({ ok: true, say: ru ? 'Хорошо, отменил' : 'Okay, cancelled' }) },
    ],
  };
}
/** a tapped choice button */
export function choose(c: Choice) { set({ state: 'processing', heard: c.label }); try { show(c.run()); } catch { fail(lang() === 'ru' ? 'Не получилось' : 'Could not do that'); } }

/**
 * A-02: pick the first n-best ASR alternative that actually parses into a real intent, instead of
 * always trusting hypothesis #0. No phonetic lexicon yet (that's WP2.4/WP3) — this is the free win:
 * if the top guess reads as noise but alt #2 is a real command, use alt #2.
 */
function pickBestAlt(alts: string[]): string {
  if (alts.length <= 1) return alts[0]?.trim() ?? '';
  for (const a of alts) {
    const t = a.trim();
    if (t && understand(t)[0]?.kind !== 'guess' && understand(t)[0]?.kind !== 'unknown') return t;
  }
  return alts[0]?.trim() ?? '';
}

export function startVoice() {
  const Ctor = SR();
  const ru = lang() === 'ru';
  clearTimeout(resetTimer);
  window.speechSynthesis?.cancel();
  if (!Ctor) { fail(ru ? 'Голосовой ввод не поддерживается в этом браузере. Откройте в Safari или Chrome.' : 'Voice input is not supported in this browser.'); return; }
  if (rec) { stopVoice(); return; }
  const r: Rec = new Ctor();
  rec = r;
  r.lang = ru ? 'ru-RU' : 'en-US';
  r.interimResults = true;
  r.maxAlternatives = 5; // A-02: was 1 — only the top ASR guess was ever usable, no n-best to fall back on
  r.continuous = false;
  let final = '';
  let finalAlts: string[] = []; // the final result's n-best transcripts, in ASR-confidence order
  const asking = useVoice.getState().choices.length > 0;
  const fresh = !useVoice.getState().reply; // just opened: the context hints stay on screen while listening
  set({ state: 'listening', heard: '', ok: true, ...(asking || fresh ? {} : { reply: '', list: [], suggest: [], canUndo: false }) });
  navigator.vibrate?.(12);
  // nothing heard for 7 s → stop without doing anything; a pause after words ends the phrase
  silence = setTimeout(() => { if (rec === r && !useVoice.getState().heard) r.stop(); }, 7000);
  r.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; length: number; [i: number]: { transcript: string } }> }) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        final += res[0].transcript;
        finalAlts = Array.from({ length: res.length }, (_, j) => res[j].transcript);
      } else interim += res[0].transcript;
    }
    set({ heard: (final + interim).trim() });
    clearTimeout(silence);
    silence = setTimeout(() => { if (rec === r) r.stop(); }, final && !interim ? 900 : 2200);
  };
  r.onerror = (e: { error: string }) => {
    rec = null; clearTimeout(silence);
    if (e.error === 'aborted') { set({ state: 'idle' }); return; } // the person cancelled — no message needed
    if (e.error === 'no-speech') { // A-01: used to fall into the same silent branch as 'aborted' — no feedback at all
      fail(ru ? 'Не расслышал. Нажмите на шар и повторите' : "Didn't catch that. Tap the orb and try again.");
      return;
    }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      set({ blocked: true });
      fail(ru ? 'Нет доступа к микрофону. Разрешите его в настройках браузера — а пока напишите команду ниже.' : 'No microphone access. Allow it in browser settings — or type below.');
      return;
    }
    if (e.error === 'audio-capture') { fail(ru ? 'Микрофон недоступен или занят' : 'The microphone is unavailable or busy'); return; }
    if (e.error === 'network' || e.error === 'language-not-supported') set({ blocked: true });
    fail(ru ? (e.error === 'network' ? 'Распознавание речи сейчас недоступно — напишите команду ниже' : 'Что-то пошло не так. Нажмите на шар и повторите') : 'Something went wrong. Tap the orb and try again.');
  };
  r.onend = () => {
    if (rec === r) rec = null;
    clearTimeout(silence);
    const text = pickBestAlt(finalAlts) || final.trim() || useVoice.getState().heard.trim();
    if (useVoice.getState().state !== 'listening') return;
    if (text) handle(text); else set({ state: 'idle' });
  };
  try { r.start(); } catch { rec = null; fail(ru ? 'Микрофон занят' : 'Microphone is busy'); }
}

/** release / second tap: finish listening and run what was heard */
export function stopVoice() { try { rec?.stop(); } catch { /* already stopped */ } }
export function cancelVoice() { try { rec?.abort(); } catch { /* noop */ } rec = null; clearTimeout(silence); window.speechSynthesis?.cancel(); set({ state: 'idle' }); }

/** the shell just set open:true — fill the suggestions and, where supported, start listening */
export function onOpen() {
  set({ suggest: hints(location.pathname, lang()) });
  if (voiceSupported()) setTimeout(() => { if (useAssistant.getState().open) startVoice(); }, 420);
}
/** the shell just set open:false — stop any in-flight recognition/speech */
export function onClose() {
  clearTimeout(closeAfter);
  cancelVoice();
}
