import { Component, type ReactNode } from 'react';
import { translate, useLangStore } from '../i18n';

/* A crash in any screen shows this instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[app crash]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen />;
  }
}

/** Also the router's errorElement: route render errors land here instead of the router's debug page. */
export function CrashScreen() {
    const lang = useLangStore.getState().lang;
    return (
      <div role="alert" style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center',
        padding: 'calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom))', background: 'var(--bg)', color: 'var(--text)',
      }}>
        <div style={{ font: 'var(--fw-bold) 10px var(--font-mono)', letterSpacing: '.24em', color: 'var(--text-muted)' }}>VEYRARC</div>
        <div style={{ font: 'var(--fw-heavy) 22px var(--font-ui)' }}>{translate(lang, 'common.crashTitle')}</div>
        <div style={{ font: 'var(--fw-regular) 14px/1.5 var(--font-ui)', color: 'var(--text-secondary)', maxWidth: 320 }}>{translate(lang, 'common.crashBody')}</div>
        <button type="button" onClick={() => location.reload()}
          style={{ marginTop: 8, minHeight: 48, padding: '0 28px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--ink)', font: 'var(--fw-bold) 14px var(--font-ui)', cursor: 'pointer' }}>
          {translate(lang, 'common.reload')}
        </button>
      </div>
    );
}
