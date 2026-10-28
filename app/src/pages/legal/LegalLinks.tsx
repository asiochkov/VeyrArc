import { config } from '../../config';
export type DocId = 'terms' | 'privacy' | 'offer' | 'contacts' | 'pricing';

const LINKS: [DocId, string, string][] = [['pricing', 'Тарифы', 'Pricing'], ['offer', 'Оферта', 'Offer'], ['terms', 'Условия', 'Terms'], ['privacy', 'Конфиденциальность', 'Privacy'], ['contacts', 'Контакты', 'Contacts']];
/** links to the public documents (welcome screen and every document's footer) */
export function LegalLinks({ lang, current }: { lang: 'ru' | 'en'; current?: DocId }) {
  return (
    <nav aria-label={lang === 'ru' ? 'Документы' : 'Documents'} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 16px', font: 'var(--fw-regular) 12px var(--font-ui)' }}>
      {LINKS.filter(([id]) => id !== current && !(config.beta && (id === 'pricing' || id === 'offer'))).map(([id, ru, en]) => (
        <a key={id} href={`/${id}`} style={{ color: 'rgba(var(--fg-rgb),.55)', textDecoration: 'none' }}>{lang === 'ru' ? ru : en}</a>
      ))}
    </nav>
  );
}
