import { create } from 'zustand';
import { useLangStore } from '../i18n';
import { similarity } from './nlu';
import { hints } from './run';
import { handlePhrase, handleSilence } from './dialog/manager';
import { dialog } from './dialog/context';
import { yesno, ordinal } from './dialog/grammars';
import { normalize } from './nlp/normalize';
import { prefs } from './prefs';
import { speechOf } from './reply';
import type { Reply } from './exec/types';
import { createSession, errKey, RETRYABLE } from './audio/session';
import { createWebSpeech, speechCtor } from './stt/webSpeech';
import { attachEndpointing } from './stt/endpointing';
import { buildLexicon, rescore } from './nlp/lexicon';
import type { ParseEnv } from './nlp/types';
import type { Hypothesis, SttErrorCode } from './stt/types';
import { translate, type TKey } from '../i18n';
import { hooks, useAssistant, closeAssistant, openAssistant } from './shell';

export { useAssistant, closeAssistant, openAssistant };

/*
 * Voice assistant state machine (ТЗ модуль 2.2): idle → listening → processing → speaking → idle,
 * any step can fall into error (auto-reset). Speech recognition and speech are the browser's own
 * (Web Speech API, free); the transcript never leaves the device except through the browser.
 */
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
export type Choice = NonNullable<Reply['choices']>[number];
type Store = {
  state: VoiceState; heard: string; reply: string; ok: boolean;
  list: string[]; suggest: string[]; choices: Choice[]; canUndo: boolean;
  /** the reply wants the text field open (repeated misunderstandings) */
  typing: boolean;
  /** speech can't be used here (no permission, no service): the panel switches to typing */
  blocked: boolean;
  /** the error on screen can be retried with a tap («Повторить») */
  retry: boolean;
};
export const useVoice = create<Store>(() => ({ state: 'idle', heard: '', reply: '', ok: true, list: [], suggest: [], choices: [], canUndo: false, blocked: false, retry: false, typing: false }));

const engine = createWebSpeech();
const session = createSession({ engine, cancelSpeech: () => window.speechSynthesis?.cancel() });
export const voiceSupported = () => !!speechCtor() && !session.voiceBroken();
/** the person's own words for rescoring; set once the data layer can supply them (WP3.2) */
type LexSource = Pick<ParseEnv, 'habits' | 'tasks' | 'goals' | 'quits' | 'aliases' | 'assistantName'>;
let lexSource: (() => LexSource) | null = null;
export const setLexiconSource = (f: (() => LexSource) | null) => { lexSource = f; };
const lexicon = () => buildLexicon(lexSource?.() ?? { habits: [], tasks: [], goals: [], quits: [] });
export const retryVoice = () => { session.resetHealth(); set({ blocked: false }); startVoice(); };
export { session as audioSession };

let resetTimer: ReturnType<typeof setTimeout> | undefined;
const set = (p: Partial<Store>) => useVoice.setState(p);
const t = (key: string) => translate(useLangStore.getState().lang as 'ru' | 'en', key as TKey);
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
async function show(r: Reply | Promise<Reply>) {
  const rep = await r;
  set({ state: 'speaking', reply: rep.screen, ok: rep.ok, list: rep.list ?? [], suggest: (rep.chips ?? []).map((c) => c.say ?? c.label), choices: rep.choices ?? [], canUndo: !!(rep.undo?.length || rep.undoable), typing: !!rep.typing });
  navigator.vibrate?.(rep.ok ? 15 : [20, 40, 20]);
  if (rep.nav) navigateTo(rep.nav);
  // a question: listen for the answer right after it is asked
  const say = speechOf(rep, lang(), prefs());
  speak(say ?? '', (rep.choices?.length || rep.expect) && voiceSupported() ? () => startVoice() : undefined);
  if (rep.close) { clearTimeout(closeAfter); closeAfter = setTimeout(() => closeAssistant(), 900); }
}
const navigateTo = (to: string) => { void import('./run').then((m) => m.navigateTo(to)); };

/** an answer to the assistant's question: yes / no / «второе» / the option's name */
function answerChoice(text: string, choices: Choice[]): Reply | Promise<Reply> | null | 'cancel' {
  const t = normalize(text);
  const yesOpt = choices.find((c) => c.yes) ?? (choices.length <= 2 ? choices[0] : undefined);
  const yn = yesno(text);
  if (yn === 'yes' && yesOpt) return yesOpt.run();
  if (yn === 'no') { const no = choices.find((c) => c.yes === false); return no ? no.run() : 'cancel'; }
  const o = ordinal(text, choices.length);
  if (o !== null && choices[o]) return choices[o].run();
  const best = choices.map((c) => ({ c, s: similarity(t, c.label) })).sort((a, b) => b.s - a.s)[0];
  if (best && best.s >= 0.5) return best.c.run();
  return null;
}

/** run a phrase (spoken, typed or a tapped suggestion) */
export function handle(text: string, asr: number | null = null) {
  const said = text.trim();
  if (!said) return;
  set({ state: 'processing', heard: said, typing: false });
  try {
    const pending = useVoice.getState().choices;
    if (pending.length) {
      const r = answerChoice(said, pending);
      if (r === 'cancel') { void show({ ok: true, kind: 'info', screen: lang() === 'ru' ? 'Хорошо, отменил' : 'Okay, cancelled', speech: lang() === 'ru' ? 'Хорошо, отменил' : 'Okay, cancelled' }); return; }
      if (r) { void show(r); return; }
      set({ choices: [] }); // not an answer: a new command
    }
    void show(handlePhrase(said, 'voice', asr));
  } catch (e) {
    console.error('[voice]', e);
    fail(lang() === 'ru' ? 'Не получилось выполнить команду' : 'Could not do that');
  }
}
/** a phrase typed elsewhere (the command palette): open the panel and run it there, with the answer and «Отменить» */
export function runInAssistant(text: string) {
  setTimeout(() => handle(text), 60);
}
/** a tapped choice button */
export function choose(c: Choice) { set({ state: 'processing', heard: c.label }); try { void show(c.run()); } catch { fail(lang() === 'ru' ? 'Не получилось' : 'Could not do that'); } }

let detach: (() => void) | null = null;
let heardAlts: Hypothesis[] = [];

/** call synchronously from a tap / key handler: nothing async before the engine starts */
export function startVoice() {
  clearTimeout(resetTimer);
  if (!speechCtor()) { fail(t('voice.err.unsupported')); set({ blocked: true }); return; }
  if (session.state === 'live' || session.state === 'requesting') { stopVoice(); return; }
  const asking = useVoice.getState().choices.length > 0;
  const fresh = !useVoice.getState().reply; // just opened: the context hints stay on screen while listening
  set({ retry: false });
  detach?.();
  detach = attachEndpointing(engine, {});
  heardAlts = [];
  const lex = lexicon();
  const phrases = lex.terms.slice(0, 100);
  if (!session.startFromGesture({ lang: lang(), phrases })) return;
  set({ state: 'listening', heard: '', ok: true, ...(asking || fresh ? {} : { reply: '', list: [], suggest: [], canUndo: false }) });
  navigator.vibrate?.(12);
}

const showError = (code: SttErrorCode, final = false) => {
  if (code === 'aborted') { set({ state: 'idle' }); return; }
  if (code === 'denied' || code === 'service-blocked' || code === 'unsupported') set({ blocked: true });
  const key = code === 'network' && final ? 'networkFinal' : errKey(code);
  fail(t(`voice.err.${key}`));
  set({ retry: RETRYABLE.includes(code) });
  if (code === 'network') set({ blocked: true });
};

session.on((e) => {
  if (e.type === 'interim') set({ heard: e.text.trim() });
  else if (e.type === 'final') { heardAlts = e.alts; set({ heard: (e.alts[0]?.text ?? '').trim() }); }
  else if (e.type === 'retrying') set({ reply: t('voice.err.network'), ok: true });
  else if (e.type === 'error') showError(e.code, true);
  else if (e.type === 'end') {
    detach?.(); detach = null;
    if (useVoice.getState().state !== 'listening') return;
    if (e.reason === 'no-speech' && !useVoice.getState().heard.trim()) {
      const again = handleSilence();
      if (again) { void show(again); return; }
      showError('no-speech'); return;
    }
    const alts = heardAlts.length ? heardAlts : [{ text: useVoice.getState().heard.trim(), confidence: null }];
    const text = alts[0].text ? rescore(alts, lexicon())?.text ?? alts[0].text : '';
    if (text.trim()) handle(text); else set({ state: 'idle' });
  }
});

/** release / second tap: finish listening and run what was heard */
export function stopVoice() { session.stop(); }
export function cancelVoice() { session.abort(); window.speechSynthesis?.cancel(); set({ state: 'idle' }); }

/* the assistant panel: open/close state lives in shell.ts; what happens on open and close is registered here */
hooks.open = (_src, gesture) => {
  // phrases that fit this screen and this moment, ready to tap
  set({ heard: '', reply: '', list: [], suggest: hints(location.pathname, lang()), choices: [], canUndo: false, ok: true, state: 'idle' });
  navigator.vibrate?.(10);
  // listening starts in the very tap that opened the panel (iOS drops the permission prompt otherwise); without a gesture
  // (a link, a late-loaded chunk) the orb says «tap the orb», and without speech recognition the panel opens on the text field
  if (gesture && voiceSupported() && !session.voiceBroken()) startVoice();
};
hooks.toggle = () => { if (session.state === 'live' || session.state === 'requesting') stopVoice(); else startVoice(); };
useVoice.subscribe((s) => { if (useAssistant.getState().phase !== s.state) useAssistant.setState({ phase: s.state }); });
hooks.close = () => { clearTimeout(closeAfter); cancelVoice(); set({ choices: [] }); dialog.reset(); };
