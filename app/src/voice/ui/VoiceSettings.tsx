import { useT } from '../../i18n';
import s from '../../pages/settings/settings.module.css';
import { usePrefs } from '../prefs';

/* «Голосовой ассистент» in Settings (ТЗ 6.13.3). WP0.3: the consent toggle; the rest is added with the panel (WP6.5). */
function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={s.row} style={{ cursor: 'pointer' }} onClick={() => onChange(!on)}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: 'var(--fw-regular) 15px var(--font-ui)' }}>{label}</span>
        <span style={{ display: 'block', font: 'var(--fw-regular) 12px/1.4 var(--font-ui)', color: 'rgba(var(--fg-rgb),.6)', marginTop: 3 }}>{hint}</span>
      </span>
      <span className={s.track} data-on={on}><span className={s.knob} /></span>
    </button>
  );
}

export function VoiceSettings() {
  const t = useT();
  const shareText = usePrefs((p) => p.shareText);
  const set = usePrefs((p) => p.set);
  return (
    <div>
      <div className={s.groupTitle}>{t('voice.settingsTitle')}</div>
      <div className={s.list}>
        <Toggle label={t('voice.set.shareText')} hint={t('voice.set.shareTextD')} on={shareText} onChange={(v) => set({ shareText: v })} />
      </div>
    </div>
  );
}
