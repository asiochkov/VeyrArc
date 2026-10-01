import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { Sheet } from './Sheet';
import s from './proModule.module.css';

/*
 * A Pro module shown to Free users (Master Changeset RC-10, PROBLEM #12): an honest, folded card —
 * title, one line of what it does, «В Pro», and a preview on example data. No blur, no lock, no gold glow.
 */
export function ProModule({ title, line, demo, className }: { title: string; line: string; demo: ReactNode; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={`${s.card} ${className ?? ''}`}>
      <div className={s.head}><span className={s.title}>{title}</span><span className={s.chip}>{t('pro.inPro')}</span></div>
      <div className={s.line}>{line}</div>
      <button type="button" className={s.btn} onClick={() => setOpen(true)}>{t('pro.seeExample')}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className={s.demoNote}>{t('pro.exampleData')}</div>
        <div className={s.demo}>{demo}</div>
        <div className={s.demoLine}>{line}</div>
        <Link to="/pro" className={s.upgrade} onClick={() => setOpen(false)}>{t('pro.upgrade')}</Link>
      </Sheet>
    </div>
  );
}
