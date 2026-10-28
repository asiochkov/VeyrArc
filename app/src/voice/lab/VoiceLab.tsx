import { useMemo, useRef, useState } from 'react';
import { analyze } from '../nlp/pipeline';
import type { ParseEnv } from '../nlp/types';
import ru from './phrases.ru.json';
import en from './phrases.en.json';
import s from './lab.module.css';

/*
 * Voice Lab (ТЗ 6.19.1): a developer page, only when the flag «lab» is on (/dev/voice-lab, «?flags=lab»).
 * Say a phrase from the list; the page shows every recognition variant with its confidence, how long it took,
 * what the parser made of it and whether that is what was expected. Nothing is sent anywhere or stored;
 * «Выгрузить JSON» hands the table to the person (a tap) so it can be sent to the developer.
 */
type Phrase = { id: string; group: string; text: string; expect: { kind: string; slots?: Record<string, unknown> } };
type Alt = { text: string; confidence: number | null };
type Row = { id: string; group: string; text: string; expect: string; alts: Alt[]; ms: number; got: string; ok: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR = (): any => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const emptyEnv = (lang: 'ru' | 'en'): ParseEnv => ({ now: new Date(), lang, habits: [], tasks: [], goals: [], quits: [] });

export function VoiceLab() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const t0 = useRef(0);
  const phrases = (lang === 'ru' ? ru : en) as Phrase[];
  const info = useMemo(() => {
    const C = SR();
    let local = false;
    try { local = !!C && 'processLocally' in new C(); } catch { /* ignore */ }
    return { engine: C ? 'webspeech' : 'none', processLocally: local, ua: navigator.userAgent };
  }, []);

  const record = (p: Phrase) => {
    const C = SR();
    if (!C) { setErr('Web Speech is not available in this browser'); return; }
    setErr(''); setBusy(p.id);
    const r = new C();
    r.lang = lang === 'ru' ? 'ru-RU' : 'en-US'; r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
    t0.current = performance.now();
    r.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => {
      const alts: Alt[] = Array.from(e.results[0] as ArrayLike<{ transcript: string; confidence: number }>).map((a) => ({ text: a.transcript, confidence: a.confidence > 0 ? a.confidence : null }));
      const ds = analyze(alts[0]?.text ?? '', emptyEnv(lang));
      const first = ds[0];
      const got = !first ? 'nothing' : first.action === 'reject' ? 'oos' : first.action === 'clarify' ? first.options[0]?.kind : first.parsed.kind;
      setRows((x) => ({ ...x, [p.id]: { id: p.id, group: p.group, text: p.text, expect: p.expect.kind, alts, ms: Math.round(performance.now() - t0.current), got, ok: got === p.expect.kind } }));
    };
    r.onerror = (e: { error: string }) => { setErr(e.error); setBusy(null); };
    r.onend = () => setBusy(null);
    try { r.start(); } catch { setBusy(null); setErr('busy'); }
  };

  const done = Object.values(rows);
  const okN = done.filter((x) => x.ok).length;
  const summary = { phrases: done.length, ok: okN, accuracy: done.length ? Math.round((okN / done.length) * 100) : null };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ engine: info.engine, lang, ua: info.ua, processLocally: info.processLocally, rows: done, summary }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `voice-lab-${lang}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const groups = [...new Set(phrases.map((p) => p.group))];

  return (
    <div className={s.root} data-scroll>
      <h1>Voice Lab</h1>
      <p className={s.meta}>engine: {info.engine} · processLocally: {String(info.processLocally)}<br />{info.ua}</p>
      <div className={s.bar}>
        <button type="button" data-on={lang === 'ru'} onClick={() => setLang('ru')}>RU</button>
        <button type="button" data-on={lang === 'en'} onClick={() => setLang('en')}>EN</button>
        <span>{summary.ok}/{summary.phrases} ok{summary.accuracy != null && ` · ${summary.accuracy}%`}</span>
        <button type="button" onClick={exportJson} disabled={!done.length}>Выгрузить JSON</button>
      </div>
      {err && <p className={s.err}>{err}</p>}
      {groups.map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          {phrases.filter((p) => p.group === g).map((p) => {
            const r = rows[p.id];
            return (
              <div key={p.id} className={s.row} data-ok={r ? r.ok : undefined}>
                <div className={s.head}>
                  <span className={s.text}>{p.text}</span>
                  <button type="button" disabled={!!busy} onClick={() => record(p)}>{busy === p.id ? '…' : 'Записать'}</button>
                </div>
                <div className={s.expect}>ждём: {p.expect.kind}</div>
                {r && (
                  <div className={s.result}>
                    <div>разобрано: <b>{r.got}</b> · {r.ms} мс</div>
                    {r.alts.map((a, i) => <div key={i} className={s.alt}>{i + 1}. {a.text} <i>{a.confidence == null ? '—' : a.confidence.toFixed(2)}</i></div>)}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
