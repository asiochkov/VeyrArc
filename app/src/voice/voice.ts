import { create } from 'zustand';
import { useLangStore } from '../i18n';
import { normalize, similarity, understand } from './nlu';
import { hints, runAll, type Choice, type Reply } from './run';

/*
 * Voice assistant state machine (ТЗ модуль 2.2): idle → listening → processing → speaking → idle,
 * any step can fall into error (auto-reset). Speech recognition and speech are the browser's own
 * (Web Speech API, free); the transcript never leaves the device except through the browser.
 */
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
type Store = {
  state: VoiceState; heard: string; reply: string; ok: boolean;
  list: string[]; suggest: string[]; choices: Choice[]; canUndo: boolean;
  /** speech can't be used here (no permission, no service): the panel switches to typing */
  blocked: boolean;
};
export const useVoice = create<Store>(() => ({ state: 'idle', heard: '', reply: '', ok: true, list: [], suggest: [], choices: [], canUndo: false, blocked: false }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR = (): (new () => Rec) | null => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);
export const voiceSupported = () => !!SR();

let rec: Rec | null = null;
let resetTimer: ReturnType<typeof setTimeout> | undefined;
let silence: ReturnType<typeof setTimeout> | undefined;
const set = (p: Partial<Store>) => useVoice.setState(p);
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
function speak(text: string, then?: () => void) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const done = () => {
    clearTimeout(resetTimer);
    if (then) { then(); return; }
    resetTimer = setTimeout(() => { if (useVoice.getState().state === 'speaking') set({ state: 'idle' }); }, 1800);
  };
  if (!synth || muted) { set({ state: 'speaking' }); setTimeout(done, 400); return; }
  synth.cancel();
  // spoken without the list marks and quotes
  const u = new SpeechSynthesisUtterance(text.replace(/[«»"“”]/g, '').replace(/ · /g, ', '));
  u.lang = lang() === 'ru' ? 'ru-RU' : 'en-US';
  const v = pickVoice(lang());
  if (v) u.voice = v;
  u.rate = 1.04;
  u.onstart = () => set({ state: 'speaking' });
  u.onend = done; u.onerror = done;
  synth.speak(u);
  // autoplay policy may keep it silent: the text still shows the answer
  setTimeout(() => { if (useVoice.getState().state === 'processing') { set({ state: 'speaking' }); setTimeout(done, 1200); } }, 900);
}

let closeAfter: ReturnType<typeof setTimeout> | undefined;
function show(r: Reply) {
  set({ state: 'speaking', reply: r.say, ok: r.ok, list: r.list ?? [], suggest: r.suggest ?? [], choices: r.choices ?? [], canUndo: !!r.undo });
  navigator.vibrate?.(r.ok ? 15 : [20, 40, 20]);
  // a question: listen for the answer right after it is asked
  speak(r.say, r.choices?.length && voiceSupported() ? () => startVoice() : undefined);
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
    const pending = useVoice.getState().choices;
    if (pending.length) {
      const r = answerChoice(said, pending);
      if (r === 'cancel') { show({ ok: true, say: lang() === 'ru' ? 'Хорошо, отменил' : 'Okay, cancelled' }); return; }
      if (r) { show(r); return; }
      set({ choices: [] }); // not an answer: a new command
    }
    show(runAll(understand(said), lang()));
  } catch (e) {
    console.error('[voice]', e);
    fail(lang() === 'ru' ? 'Не получилось выполнить команду' : 'Could not do that');
  }
}
/** a tapped choice button */
export function choose(c: Choice) { set({ state: 'processing', heard: c.label }); try { show(c.run()); } catch { fail(lang() === 'ru' ? 'Не получилось' : 'Could not do that'); } }

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
  r.maxAlternatives = 1;
  r.continuous = false;
  let final = '';
  const asking = useVoice.getState().choices.length > 0;
  const fresh = !useVoice.getState().reply; // just opened: the context hints stay on screen while listening
  set({ state: 'listening', heard: '', ok: true, ...(asking || fresh ? {} : { reply: '', list: [], suggest: [], canUndo: false }) });
  navigator.vibrate?.(12);
  // nothing heard for 7 s → stop without doing anything; a pause after words ends the phrase
  silence = setTimeout(() => { if (rec === r && !useVoice.getState().heard) r.stop(); }, 7000);
  r.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
    }
    set({ heard: (final + interim).trim() });
    clearTimeout(silence);
    silence = setTimeout(() => { if (rec === r) r.stop(); }, final && !interim ? 900 : 2200);
  };
  r.onerror = (e: { error: string }) => {
    rec = null; clearTimeout(silence);
    if (e.error === 'no-speech' || e.error === 'aborted') { set({ state: 'idle' }); return; }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      set({ blocked: true });
      fail(ru ? 'Нет доступа к микрофону. Разрешите его в настройках браузера — а пока напишите команду ниже.' : 'No microphone access. Allow it in browser settings — or type below.');
      return;
    }
    if (e.error === 'network' || e.error === 'language-not-supported') set({ blocked: true });
    fail(ru ? (e.error === 'network' ? 'Распознавание речи сейчас недоступно — напишите команду ниже' : 'Не расслышал. Нажмите на шар и повторите') : 'Could not recognise speech');
  };
  r.onend = () => {
    if (rec === r) rec = null;
    clearTimeout(silence);
    const text = final.trim() || useVoice.getState().heard.trim();
    if (useVoice.getState().state !== 'listening') return;
    if (text) handle(text); else set({ state: 'idle' });
  };
  try { r.start(); } catch { rec = null; fail(ru ? 'Микрофон занят' : 'Microphone is busy'); }
}

/** release / second tap: finish listening and run what was heard */
export function stopVoice() { try { rec?.stop(); } catch { /* already stopped */ } }
export function cancelVoice() { try { rec?.abort(); } catch { /* noop */ } rec = null; clearTimeout(silence); window.speechSynthesis?.cancel(); set({ state: 'idle' }); }

/* the assistant panel (opened by the bubble next to the dock) */
type Panel = { open: boolean };
export const useAssistant = create<Panel>(() => ({ open: false }));
export function openAssistant() {
  if (useAssistant.getState().open) return;
  useAssistant.setState({ open: true });
  // phrases that fit this screen and this moment, ready to tap
  set({ heard: '', reply: '', list: [], suggest: hints(location.pathname, lang()), choices: [], canUndo: false, ok: true, state: 'idle' });
  navigator.vibrate?.(10);
  // after the dock has merged; without speech recognition the panel opens on the text field
  if (voiceSupported()) setTimeout(() => { if (useAssistant.getState().open) startVoice(); }, 420);
}
export function closeAssistant() { clearTimeout(closeAfter); cancelVoice(); set({ choices: [] }); useAssistant.setState({ open: false }); }
