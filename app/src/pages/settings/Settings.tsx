import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AccountDialogs, type AccountModal } from '../../app/AccountDialogs';
import { deleteAccount, signOut } from '../../lib/auth';
import { hasBackend } from '../../lib/supabase';
import { useLangStore, useT, type Lang, type T } from '../../i18n';
import { useIsDesktop } from '../../lib/useIsDesktop';
import { todayStats } from '../../mock/today';
import { Icon, type IconName } from '../../ui/Icon';
import { ConfirmDialog, Segmented } from '../../ui/primitives';
import s from './settings.module.css';

/* VeyrArc Settings.dc.html */

const ACCOUNT = { name: 'Анна Петрова', email: 'anna.petrova@gmail.com', renew: { ru: '12 окт. 2026', en: 'Oct 12, 2026' }, version: '1.4.0' };
const ARCS = [
  { n: 1, dates: { ru: '1 июн. – 29 авг.', en: 'Jun 1 – Aug 29' }, pct: '78%', current: false },
  { n: 2, dates: { ru: '9 сент. – 7 дек.', en: 'Sep 9 – Dec 7' }, pct: '16%', current: true },
];
type Group = 'account' | 'app' | 'notif' | 'pro' | 'arc' | 'data';

export function Settings() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const lang = useLangStore((x) => x.lang);
  const setLang = useLangStore((x) => x.setLang);
  const [langOpen, setLangOpen] = useState(false);
  const [group, setGroup] = useState<Group>('account');
  const [unit, setUnit] = useState<'ml' | 'oz'>('ml');
  const [notif, setNotif] = useState({ n1: true, n2: true, n3: true, n4: false });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [arcModal, setArcModal] = useState(false);
  const [accModal, setAccModal] = useState<AccountModal>(null);

  const groups: [Group, string][] = [
    ['account', t('settings.account')], ['app', t('settings.app')], ['notif', t('settings.notifications')],
    ['pro', t('settings.pro')], ['arc', t('settings.arc')], ['data', t('settings.data')],
  ];
  const show = (g: Group) => !isDesktop || group === g;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {langOpen ? (
        <button type="button" className={s.back} onClick={() => setLangOpen(false)} aria-label={t('settings.title')}><Icon name="back" size={18} sw={2} /></button>
      ) : (
        <Link to="/" className={s.back} aria-label={t('nav.today')}><Icon name="back" size={18} sw={2} /></Link>
      )}
      <div style={{ font: '800 28px/1.1 var(--font-ui)', whiteSpace: 'nowrap' }}>{langOpen ? t('settings.language') : t('settings.title')}</div>
    </div>
  );

  const langScreen = (
    <>
      <div className={s.list} style={{ marginTop: 22, maxWidth: 560 }}>
        {(['ru', 'en'] as Lang[]).map((id) => {
          const sel = lang === id;
          return (
            <button key={id} type="button" className={s.langRow} onClick={() => setLang(id)}>
              <span className={s.radio} data-on={sel}>{sel && <span className={s.radioDot} />}</span>
              <span style={{ flex: 1, font: '600 15px var(--font-ui)' }}>{id === 'ru' ? 'Русский' : 'English'}</span>
              <span style={{ font: '500 12px var(--font-ui)', color: 'rgba(232,237,243,.4)' }}>{id === lang ? '' : t('settings.langOther')}</span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, maxWidth: 560, font: '400 12px/1.5 var(--font-ui)', color: 'rgba(232,237,243,.45)', padding: '0 4px' }}>{t('settings.langHint')}</div>
    </>
  );

  const Row = ({ icon, label, children, onClick, danger }: { icon: IconName; label: string; children?: ReactNode; onClick?: () => void; danger?: boolean }) => {
    const inner = (
      <>
        <span className={danger ? s.rowIconDanger : s.rowIcon}><Icon name={icon} size={18} /></span>
        <span style={{ flex: 1, font: '600 14.5px var(--font-ui)', minWidth: 0, color: danger ? '#E5645A' : undefined }}>{label}</span>
        {children}
      </>
    );
    return onClick !== undefined ? <button type="button" className={s.row} style={{ cursor: 'pointer' }} onClick={onClick}>{inner}</button> : <div className={s.row}>{inner}</div>;
  };
  const chev = <span style={{ color: 'rgba(232,237,243,.35)' }}><Icon name="chevron" size={16} sw={2} /></span>;

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      {show('account') && (
        <div>
          <div className={s.groupTitle}>{t('settings.account')}</div>
          <button type="button" className={s.accountBtn} onClick={() => navigate('/settings/account')}>
            <span className={s.avatar}>{todayStats.initials}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', font: '700 16px var(--font-ui)' }}>{ACCOUNT.name}</span>
              <span style={{ display: 'block', font: '500 12.5px var(--font-ui)', color: 'rgba(232,237,243,.5)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ACCOUNT.email}</span>
            </span>
            <span style={{ color: 'rgba(232,237,243,.4)' }}><Icon name="chevron" size={16} sw={2} /></span>
          </button>
        </div>
      )}
      {show('app') && (
        <div>
          <div className={s.groupTitle}>{t('settings.app')}</div>
          <div className={s.list}>
            <Row icon="globe" label={t('settings.language')} onClick={() => setLangOpen(true)}>
              <span style={{ font: '500 13px var(--font-ui)', color: 'rgba(232,237,243,.5)' }}>{t('settings.langName')}</span>{chev}
            </Row>
            <Row icon="moon" label={t('settings.theme')}>
              <span style={{ font: '500 13px var(--font-ui)', color: 'rgba(232,237,243,.5)' }}>{t('settings.themeDark')}</span>
            </Row>
            <Row icon="drop" label={t('settings.units')}>
              <Segmented variant="units" value={unit} onChange={setUnit} options={[{ id: 'ml', label: t('settings.ml') }, { id: 'oz', label: t('settings.oz') }]} />
            </Row>
          </div>
        </div>
      )}
      {show('notif') && (
        <div>
          <div className={s.groupTitle}>{t('settings.notifications')}</div>
          <div className={s.list}>
            {(['n1', 'n2', 'n3', 'n4'] as const).map((k) => (
              <button key={k} type="button" role="switch" aria-checked={notif[k]} className={s.row} style={{ cursor: 'pointer' }} onClick={() => setNotif((n) => ({ ...n, [k]: !n[k] }))}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: '600 14.5px var(--font-ui)' }}>{t(`settings.${k}`)}</span>
                  <span style={{ display: 'block', font: '400 12px/1.4 var(--font-ui)', color: 'rgba(232,237,243,.45)', marginTop: 3 }}>{t(`settings.${k}d`)}</span>
                </span>
                <span className={s.track} data-on={notif[k]}><span className={s.knob} /></span>
              </button>
            ))}
          </div>
        </div>
      )}
      {show('pro') && (
        <div>
          <div className={s.groupTitle}>{t('settings.pro')}</div>
          <div className={s.proCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={s.crown}><Icon name="crown" size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: '700 15px var(--font-ui)', color: '#f2e2c4' }}>{t('settings.proActive')}</span>
                <span style={{ display: 'block', font: '500 12px var(--font-ui)', color: 'rgba(232,237,243,.55)', marginTop: 3, whiteSpace: 'nowrap' }}>
                  {t('settings.renews')} · <span style={{ fontFamily: 'var(--font-mono)' }}>{t.pick(ACCOUNT.renew)}</span>
                </span>
              </span>
              <span className={s.proBadge}>PRO</span>
            </div>
            <button type="button" className={s.manage}>{t('settings.manage')}</button>
          </div>
        </div>
      )}
      {show('arc') && (
        <div>
          <div className={s.groupTitle}>{t('settings.arc')}</div>
          <div className={s.list}>
            <Row icon="archive" label={t('settings.archive')} onClick={() => setArchiveOpen(!archiveOpen)}>
              <span style={{ color: 'rgba(232,237,243,.35)', display: 'grid', transition: 'transform .2s', transform: `rotate(${archiveOpen ? 90 : 0}deg)` }}><Icon name="chevron" size={16} sw={2} /></span>
            </Row>
            {archiveOpen && (
              <div style={{ padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ARCS.map((a) => (
                  <div key={a.n} className={s.arcItem}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', font: '700 13.5px var(--font-ui)' }}>Arc {a.n}</span>
                      <span style={{ display: 'block', font: '500 11.5px var(--font-mono)', color: 'rgba(232,237,243,.45)', marginTop: 3, whiteSpace: 'nowrap' }}>{t.pick(a.dates)}</span>
                    </span>
                    <span style={{ textAlign: 'right', flex: 'none' }}>
                      <span style={{ display: 'block', font: '700 16px var(--font-mono)', color: '#A8CBEF' }}>{a.pct}</span>
                      <span style={{ display: 'block', font: '600 9px var(--font-ui)', color: 'rgba(232,237,243,.4)' }}>{a.current ? t('settings.current') : t('settings.completed')}</span>
                    </span>
                  </div>
                ))}
                <Link to="/profile" className={s.compare}>{t('settings.compare')} <Icon name="chevron" size={13} sw={2.2} /></Link>
              </div>
            )}
            <Row icon="snow" label={t('settings.newArc')} onClick={() => setArcModal(true)}>{chev}</Row>
          </div>
        </div>
      )}
      {show('data') && (
        <div>
          <div className={s.groupTitle}>{t('settings.data')}</div>
          <div className={s.list}>
            <Row icon="download" label={t('settings.export')} onClick={() => {}}>{chev}</Row>
            <Row icon="trashPlain" label={t('settings.del')} danger onClick={() => setAccModal('del1')} />
          </div>
          <div style={{ marginTop: 14, textAlign: 'center', font: '500 11px var(--font-mono)', color: 'rgba(232,237,243,.28)' }}>{t('settings.version', { v: ACCOUNT.version })}</div>
        </div>
      )}
    </div>
  );

  return (
    <div className={s.scroll} style={{ padding: isDesktop ? '34px 36px 40px' : '22px 18px 30px' }} data-scroll>
      {header}
      {langOpen ? langScreen : isDesktop ? (
        <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '220px minmax(0,640px)', gap: 28, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 0 }}>
            {groups.map(([id, label]) => (
              <button key={id} type="button" className={s.groupBtn} aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>
            ))}
          </div>
          {content}
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>{content}</div>
      )}

      <ConfirmDialog
        open={arcModal} title={t('settings.newArcTitle')} body={t('settings.newArcBody', { d: todayStats.arcDay, n: todayStats.arcLength })}
        confirmLabel={t('settings.newArcOk')} cancelLabel={t('settings.cancel')} onConfirm={() => setArcModal(false)} onCancel={() => setArcModal(false)}
      />
      <AccountDialogs modal={accModal} setModal={setAccModal}
        onLogout={() => { if (hasBackend) void signOut().then(() => navigate('/welcome')); else navigate('/welcome'); }}
        onDelete={async () => { if (hasBackend) await deleteAccount(); navigate('/welcome'); }} />
    </div>
  );
}
export type { T };
