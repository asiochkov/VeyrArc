import s from './emptyState.module.css';

/* Empty states (Master Changeset task 35): one headline, one line, an optional shortcut and one action. No pictures. */
export function EmptyState({ title, sub, kbd, cta, compact }: { title: string; sub?: string; kbd?: string; cta?: { label: string; run: () => void }; compact?: boolean }) {
  return (
    <div className={s.box} data-compact={compact}>
      <div className={s.title}>{title}</div>
      {sub && <div className={s.sub}>{sub}</div>}
      {(cta || kbd) && (
        <div className={s.row}>
          {cta && <button type="button" className={s.cta} onClick={cta.run}>{cta.label}</button>}
          {kbd && <kbd className={s.kbd}>{kbd}</kbd>}
        </div>
      )}
    </div>
  );
}
