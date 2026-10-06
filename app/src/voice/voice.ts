import { create } from 'zustand';
import { useLangStore } from '../i18n';
import { parseCommand } from './intents';
import { runIntent } from './run';

/*
 * Voice assistant state machine (ТЗ модуль 2.2): idle → listening → processing → speaking → idle,
 * any step can fall into error (auto-reset). Speech recognition and speech are the browser's own
 * (Web Speech API, free); the transcript never leaves the device except through the browser.
 */
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
type Store = { state: VoiceState; heard: string; reply: string; ok: boolean };
export const useVoice = create<Store>(() => ({ state: 'idle', heard: '', reply: '', ok: true }));

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

function speak(text: string) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) { set({ state: 'idle' }); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang() === 'ru' ? 'ru-RU' : 'en-US';
  u.onstart = () => set({ state: 'speaking' });
  const done = () => { clearTimeout(resetTimer); resetTimer = setTimeout(() => set({ state: 'idle' }), 1800); };
  u.onend = done; u.onerror = done;
  synth.speak(u);
  // autoplay policy may keep it silent: the text bubble still shows the answer
  setTimeout(() => { if (useVoice.getState().state === 'processing') { set({ state: 'speaking' }); done(); } }, 800);
}

function handle(text: string) {
  set({ state: 'processing', heard: text });
  try {
    const r = runIntent(parseCommand(text), lang());
    set({ reply: r.say, ok: r.ok });
    navigator.vibrate?.(r.ok ? 15 : [20, 40, 20]);
    speak(r.say);
  } catch {
    fail(lang() === 'ru' ? 'Не получилось выполнить команду' : 'Could not do that');
  }
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
  r.maxAlternatives = 1;
  r.continuous = false;
  let final = '';
  set({ state: 'listening', heard: '', reply: '', ok: true });
  navigator.vibrate?.(12);
  // nothing heard for 6 s → stop without doing anything
  silence = setTimeout(() => { if (rec === r && !final) r.stop(); }, 6000);
  r.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
    }
    set({ heard: (final + interim).trim() });
  };
  r.onerror = (e: { error: string }) => {
    rec = null; clearTimeout(silence);
    if (e.error === 'no-speech' || e.error === 'aborted') { set({ state: 'idle' }); return; }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      fail(ru ? 'Нет доступа к микрофону или распознаванию речи. Разрешите их в настройках браузера.' : 'No access to the microphone or speech recognition.');
      return;
    }
    fail(ru ? 'Не удалось распознать речь' : 'Could not recognise speech');
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
export function cancelVoice() { try { rec?.abort(); } catch { /* noop */ } rec = null; window.speechSynthesis?.cancel(); set({ state: 'idle' }); }

/* the assistant panel (opened by the bubble next to the dock) */
type Panel = { open: boolean };
export const useAssistant = create<Panel>(() => ({ open: false }));
export function openAssistant() {
  useAssistant.setState({ open: true });
  navigator.vibrate?.(10);
  setTimeout(startVoice, 420); // after the dock has merged
}
export function closeAssistant() { cancelVoice(); useAssistant.setState({ open: false }); }
