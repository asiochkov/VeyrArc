import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { journalClear, journalList } from './journal';
import s from './journalSheet.module.css';

/*
 * §6.13.2: a readable history of what the assistant did (journal.ts, WP1.5) — this is the UI for it.
 * Re-reads the journal fresh each time it opens; the journal itself has no subscribe/notify, it's a
 * plain localStorage-backed list (see store.ts), so there's nothing to keep in sync while closed.
 */
export function JournalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [entries, setEntries] = useState(() => journalList());
  // re-read on every open: the journal (plain localStorage, no subscribe/notify) may have changed
  // since this sheet last closed, e.g. from voice commands run while it was hidden.
  useEffect(() => { if (open) setEntries(journalList()); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={t('voice.journalTitle')} label={t('voice.journalTitle')}>
      {entries.length === 0 ? (
        <p className={s.empty}>{t('voice.journalEmpty')}</p>
      ) : (
        <>
          <ul className={s.list}>
            {entries.map((e) => (
              <li key={e.ts} className={s.row} data-ok={e.ok}>
                <span className={s.time}>{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={s.said}>{e.said || '—'}</span>
                <span className={s.reply}>{e.reply}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={s.clear} onClick={() => { journalClear(); setEntries([]); }}>
            <Icon name="trashPlain" size={14} sw={2} />{t('voice.journalClear')}
          </button>
        </>
      )}
    </Sheet>
  );
}
