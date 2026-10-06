import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { AssistantMark } from '../voice/AssistantMark';
import { closeAssistant, openAssistant, useAssistant, useVoice } from '../voice/voice';
import s from './BottomBar.module.css';
import { NAV, navIdFor } from './nav';

/*
 * Mobile dock (motion reference: a pill that grows out of a dot, icons appear one by one, the
 * assistant drop splits off to the right). Five sections in the pill, a white puck under the
 * active one; the drop on the right calls the assistant — there is no «+» any more: adding by hand
 * lives in the assistant panel and in each screen's own «+».
 * While the assistant is open the dock merges back into one dark pill with a live dot.
 */
export function BottomBar() {
  const t = useT();
  const { pathname } = useLocation();
  const active = navIdFor(pathname);
  const open = useAssistant((a) => a.open);
  const vstate = useVoice((v) => v.state);
  const bar = useRef<HTMLElement>(null);
  const [puck, setPuck] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[data-active="true"]');
    setPuck(el ? el.offsetLeft : null);
  }, [active]);
  return (
    <div className={s.dock} data-merged={open}>
      <nav ref={bar} className={s.bar} aria-label={t('nav.label')} onClick={open ? closeAssistant : undefined}>
        {puck != null && <span className={s.puck} style={{ transform: `translateX(${puck}px)` }} aria-hidden="true" />}
        {NAV.map((n, i) => (
          <Link key={n.id} to={n.to} className={s.item} style={{ '--k': i } as React.CSSProperties} data-active={n.id === active}
            aria-current={n.id === active ? 'page' : undefined} aria-label={t(n.label)} tabIndex={open ? -1 : 0}>
            <Icon name={n.icon} size={22} sw={1.7} />
          </Link>
        ))}
        <span className={s.live} data-state={vstate} aria-hidden="true"><i /><i /><i /></span>
      </nav>
      <span className={s.neck} aria-hidden="true" />
      <button type="button" className={s.drop} onClick={open ? closeAssistant : openAssistant}
        aria-label={open ? t('common.close') : t('voice.open')} aria-expanded={open}>
        <AssistantMark size={28} />
      </button>
    </div>
  );
}
