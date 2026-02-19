import { useLocale, type Locale } from './context';

const options: { code: Locale; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
];

export function LanguageSelector() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex gap-1 text-xs">
      {options.map((o, i) => (
        <span key={o.code} className="flex items-center gap-1">
          {i > 0 && <span className="text-mahjong-muted/30">|</span>}
          <button
            onClick={() => setLocale(o.code)}
            className={`px-1 py-0.5 rounded transition-colors
              ${locale === o.code
                ? 'text-mahjong-gold font-bold'
                : 'text-mahjong-muted/50 hover:text-mahjong-muted'}`}
          >
            {o.label}
          </button>
        </span>
      ))}
    </div>
  );
}
