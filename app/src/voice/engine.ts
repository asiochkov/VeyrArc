import { useLangStore } from '../i18n';
import { haptic } from '../lib/haptics';
import { earconConfirm, earconError, earconListenStart, earconNoResult, earconSuccess } from './earcons';
import { journalAppend } from './journal';
import { normalize, similarity, takeTime, understand, type Intent } from './nlu';
import { decide } from './nlp/decide';
import { EARLY_STABLE_CONFIDENCE, EARLY_STABLE_MS, MAX_UTTERANCE_MS, NO_SPEECH_MS, SILENCE_AFTER_FINAL_MS, SILENCE_AFTER_INTERIM_MS, TAIL_INCOMPLETE_MS } from './nlp/params';
import { usePrefs } from './prefs';
import { hints, previewTaskDelete, runAll, type Choice, type Reply } from './run';
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
let earlyStable: ReturnType<typeof setTimeout> | undefined;
let maxUtterance: ReturnType<typeof setTimeout> | undefined;

// A-06/§6.1.5: the mic kept recording in a backgrounded tab — nothing ever stopped it.
// This chunk only loads once the assistant has opened, so registering once at module scope is enough.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden && rec) cancelVoice(); });
  window.addEventListener('pagehide', () => { if (rec) cancelVoice(); });
}
const set = (p: Partial<ReturnType<typeof useVoice.getState>>) => useVoice.setState(p);
const lang = () => useLangStore.getState().lang as 'ru' | 'en';

/** §6.12: `earcon` defaults to the generic error tone; the no-speech case plays its own distinct one */
function fail(msg: string, earcon: () => void = earconError) {
  set({ state: 'error', reply: msg, ok: false });
  earcon();
  haptic('error');
  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => set({ state: 'idle' }), 4000);
}

/** a voice that sounds natural for the language, if the device has one */
function pickVoice(code: string) {
  const vs = window.speechSynthesis?.getVoices?.() ?? [];
  const mine = vs.filter((v) => v.lang?.toLowerCase().startsWith(code));
  return mine.find((v) => /premium|enhanced|natural|milena|yuri|siri|google/i.test(v.name)) ?? mine[0];
}
// E-02: used to be a module-level `let muted = false` that forgot itself on every reload —
// prefs.ts already had the persisted field (WP0.4), it just wasn't connected to anything yet.
let muted = usePrefs.getState().prefs.muted;
export const setMuted = (v: boolean) => { muted = v; usePrefs.getState().update({ muted: v }); if (v) window.speechSynthesis?.cancel(); };
/** C-03: a chunk of a multi-sentence reply, chained via onend so each sentence is its own utterance
 * with a natural pause between — was one long monologue glued together with '. '. */
function speakChunk(synth: SpeechSynthesis, chunks: string[], i: number, done: () => void) {
  if (i >= chunks.length) { done(); return; }
  const u = new SpeechSynthesisUtterance(chunks[i]);
  u.lang = lang() === 'ru' ? 'ru-RU' : 'en-US';
  const v = pickVoice(lang());
  if (v) u.voice = v;
  u.rate = usePrefs.getState().prefs.rate; // was hardcoded 1.04; prefs.ts's 0.8–1.4 range wasn't wired to anything yet
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
  // §6.12: a question/confirm gets its own tone, distinct from a plain success
  const asksSomething = !!(r.choices?.length || r.ask);
  if (asksSomething) earconConfirm(); else if (r.ok) earconSuccess(); else earconError();
  haptic(r.ok ? 'check' : 'error');
  // a question (choice or ask-slot): listen for the answer right after it is asked
  speak(r.say, asksSomething && voiceSupported() ? () => startVoice() : undefined);
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
/** prefs.alias.add (§6.4.6): substitute saved aliases before parsing — kept out of nlu.ts so that
 * module stays prefs-free/pure (it runs fine in a plain node test script with no localStorage). */
function applyAliases(text: string): string {
  const aliases = usePrefs.getState().prefs.aliases;
  if (!aliases.length) return text;
  let out = text;
  for (const a of aliases) out = out.replace(new RegExp(`(?<![a-zа-я0-9])${a.alias}(?![a-zа-я0-9])`, 'gi'), a.target);
  return out;
}

/**
 * B-06: `asrConfidence` is the browser's own per-utterance recognition confidence (0..1), passed
 * through from `startVoice()`'s `onend` when `text` came from the microphone. Typed text (the
 * panel's input box, the palette fallback, `?say=` URL shortcuts) has no such thing — those call
 * sites simply omit it, and `decide()` skips the ASR check entirely in that case.
 */
export function handle(text: string, asrConfidence?: number) {
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
    // prefs.macro.add: the trigger word itself replays its saved phrases through the normal
    // pipeline (each phrase re-parsed and run in order, same combining/undo-batching as a
    // multi-intent sentence — see runAll()).
    const macro = usePrefs.getState().prefs.macros.find((m) => normalize(m.trigger) === normalize(said));
    const intents = macro ? macro.phrases.flatMap((p) => understand(applyAliases(p))) : understand(applyAliases(said));
    if (decide(intents, asrConfidence).action === 'confirm') { show(confirmReply(intents, said, lang())); return; }
    show(runAll(intents, lang()));
  } catch (e) {
    console.error('[voice]', e);
    fail(lang() === 'ru' ? 'Не получилось выполнить команду' : 'Could not do that');
  }
}

/** a risky (R2+) command: ask before doing it (fixes C-05, D-01) */
function confirmReply(intents: Intent[], said: string, ru2: 'ru' | 'en'): Reply {
  const ru = ru2 === 'ru';
  // C-01: show the task the fuzzy match actually picked, not the raw phrase — a wrong match used
  // to stay invisible until after the person had already said yes.
  const only = intents.length === 1 ? intents[0] : null;
  const match = only?.kind === 'taskDelete' ? previewTaskDelete(only.query) : null;
  const say = match ? (ru ? `Точно удалить «${match}»?` : `Delete "${match}"?`) : (ru ? `Точно — «${said}»?` : `Confirm — "${said}"?`);
  return {
    ok: true,
    say,
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

/**
 * A-03 (§6.3): endpointing without a real VAD/ML model — no audio-level signal reaches this code,
 * only recognizer text events. §6.3's `tailIncomplete`: the normalized text ends on a preposition/
 * conjunction/particle that's almost never the last word of a finished phrase ("встреча с", "через",
 * "в половине" all mean more words are coming).
 */
const TAIL_WORDS = 'в|во|на|к|ко|с|со|у|по|до|от|из|за|для|про|и|а|но|или|что|чтобы|потом|ещё|еще|ну|э|эм';
const TAIL_INCOMPLETE = new RegExp(`(?:^|\\s)(?:${TAIL_WORDS})$`, 'i');
function tailIncomplete(text: string): boolean {
  return TAIL_INCOMPLETE.test(text.trim().toLowerCase().replace(/ё/g, 'е'));
}

export function startVoice() {
  const Ctor = SR();
  const ru = lang() === 'ru';
  clearTimeout(resetTimer);
  window.speechSynthesis?.cancel();
  if (!Ctor) { fail(ru ? 'Голосовой ввод не поддерживается в этом браузере. Откройте в Safari или Chrome.' : 'Voice input is not supported in this browser.'); return; }
  if (rec) { stopVoice(); return; }
  // A-06: every call here is an explicit retry (orb tap or auto-start) — give the blocked flag a
  // fresh chance each time instead of leaving it stuck for the rest of the session. Re-blocks itself
  // in onerror below if this attempt fails again for the same reason.
  set({ blocked: false });
  const r: Rec = new Ctor();
  rec = r;
  r.lang = ru ? 'ru-RU' : 'en-US';
  r.interimResults = true;
  r.maxAlternatives = 5; // A-02: was 1 — only the top ASR guess was ever usable, no n-best to fall back on
  r.continuous = false;
  let final = '';
  let finalAlts: string[] = []; // the final result's n-best transcripts, in ASR-confidence order
  let finalConfidence = 1; // A-03/B-06: the ASR's own confidence (0..1) for the settled transcript
  const asking = useVoice.getState().choices.length > 0;
  const fresh = !useVoice.getState().reply; // just opened: the context hints stay on screen while listening
  set({ state: 'listening', heard: '', ok: true, ...(asking || fresh ? {} : { reply: '', list: [], suggest: [], canUndo: false }) });
  // §6.12: the "listening started" earcon plays before recognition actually starts, with a 120ms
  // pause so the mic doesn't pick up the tail of its own tone as the first word.
  earconListenStart();
  haptic('tap');
  r.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; length: number; [i: number]: { transcript: string; confidence?: number } }> }) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        final += res[0].transcript;
        finalAlts = Array.from({ length: res.length }, (_, j) => res[j].transcript);
        finalConfidence = res[0].confidence ?? 1;
      } else interim += res[0].transcript;
    }
    const text = (final + interim).trim();
    set({ heard: text });
    clearTimeout(silence);
    clearTimeout(earlyStable);
    // §6.3 step 3: a settled, confident, real-looking result that hasn't changed for EARLY_STABLE_MS
    // ends the phrase immediately instead of waiting out the full silence window. No classifier here,
    // so "no missing slot" is approximated as "parses to a real intent at all" (not guess/unknown) —
    // the closest free proxy available.
    if (final && !interim && finalConfidence >= EARLY_STABLE_CONFIDENCE) {
      const kind = understand(text)[0]?.kind;
      if (kind && kind !== 'guess' && kind !== 'unknown') {
        earlyStable = setTimeout(() => { if (rec === r && useVoice.getState().heard === text) r.stop(); }, EARLY_STABLE_MS);
      }
    }
    // §6.3 steps 4-5: a phrase that still sounds grammatically open waits longer than a settled one;
    // final vs. interim-only get their own separate silence windows.
    const wait = tailIncomplete(text) ? TAIL_INCOMPLETE_MS : final && !interim ? SILENCE_AFTER_FINAL_MS : SILENCE_AFTER_INTERIM_MS;
    silence = setTimeout(() => { if (rec === r) r.stop(); }, wait);
  };
  r.onerror = (e: { error: string }) => {
    rec = null; clearTimeout(silence); clearTimeout(earlyStable); clearTimeout(maxUtterance);
    // Found live: auto-listen starts in the background on open (420ms delay) — if the person typed
    // a command in the meantime and already got a reply/confirm shown, this (async, can fire well
    // after that) error used to stomp it with a stale mic message. `blocked` still needs to be set
    // either way (that's capability state, not display) — only the visible text/state is guarded,
    // same pattern as onend's `state !== 'listening'` check below.
    // Also found live: `show()` auto-restarts listening right after asking a yes/no question (to
    // hear the answer) — when mic access is blocked, *that* retry's error used to overwrite the
    // just-asked question with the generic mic message while the Да/Отмена buttons stayed, which
    // read as nonsensical. A pending question (`choices.length`) is worth more than this message.
    const stillListening = useVoice.getState().state === 'listening' && !useVoice.getState().choices.length;
    if (e.error === 'aborted') { if (stillListening) set({ state: 'idle' }); return; } // the person cancelled — no message needed
    if (e.error === 'no-speech') { // A-01: used to fall into the same silent branch as 'aborted' — no feedback at all
      // §6.12: "end of recording, no result" gets its own distinct tone, not the generic error one
      if (stillListening) fail(ru ? 'Не расслышал. Нажмите на шар и повторите' : "Didn't catch that. Tap the orb and try again.", earconNoResult);
      return;
    }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      set({ blocked: true });
      if (stillListening) fail(ru ? 'Нет доступа к микрофону. Разрешите его в настройках браузера — а пока напишите команду ниже.' : 'No microphone access. Allow it in browser settings — or type below.');
      return;
    }
    if (e.error === 'audio-capture') { if (stillListening) fail(ru ? 'Микрофон недоступен или занят' : 'The microphone is unavailable or busy'); return; }
    if (e.error === 'network' || e.error === 'language-not-supported') set({ blocked: true });
    if (stillListening) fail(ru ? (e.error === 'network' ? 'Распознавание речи сейчас недоступно — напишите команду ниже' : 'Что-то пошло не так. Нажмите на шар и повторите') : 'Something went wrong. Tap the orb and try again.');
  };
  r.onend = () => {
    if (rec === r) rec = null;
    clearTimeout(silence); clearTimeout(earlyStable); clearTimeout(maxUtterance);
    const text = pickBestAlt(finalAlts) || final.trim() || useVoice.getState().heard.trim();
    if (useVoice.getState().state !== 'listening') return;
    // B-06: only pass the confidence along when we actually heard a final result through the mic —
    // `pickBestAlt`/the raw `heard` fallback paths didn't come with a trustworthy per-utterance score.
    if (text) handle(text, finalAlts.length ? finalConfidence : undefined); else set({ state: 'idle' });
  };
  setTimeout(() => {
    if (rec !== r) return; // cancelled during the pre-start pause
    // §6.3: nothing heard at all for NO_SPEECH_MS → stop with the no-speech error
    silence = setTimeout(() => { if (rec === r && !useVoice.getState().heard) r.stop(); }, NO_SPEECH_MS);
    // §6.3: a hard cap regardless of anything else — a runaway recognition never keeps the mic open past this
    maxUtterance = setTimeout(() => { if (rec === r) r.stop(); }, MAX_UTTERANCE_MS);
    try { r.start(); } catch { rec = null; fail(ru ? 'Микрофон занят' : 'Microphone is busy'); }
  }, 120);
}

/** release / second tap: finish listening and run what was heard */
export function stopVoice() { try { rec?.stop(); } catch { /* already stopped */ } }
export function cancelVoice() { try { rec?.abort(); } catch { /* noop */ } rec = null; clearTimeout(silence); clearTimeout(earlyStable); clearTimeout(maxUtterance); window.speechSynthesis?.cancel(); set({ state: 'idle' }); }

/** the shell just set open:true — fill the suggestions and, where supported, start listening */
export function onOpen(autoListen = true) {
  set({ suggest: hints(location.pathname, lang()) });
  if (autoListen && voiceSupported()) setTimeout(() => { if (useAssistant.getState().open) startVoice(); }, 420);
}
/** the shell just set open:false — stop any in-flight recognition/speech */
export function onClose() {
  clearTimeout(closeAfter);
  cancelVoice();
}
