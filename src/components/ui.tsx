import { useCallback, useState, type ReactNode } from 'react';

/** Полупрозрачная навигационная панель, прилипающая к верху страницы. */
export function NavBar({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-side">{left}</div>
        <span className="nav-brand">
          <span className="logo-mini" aria-hidden>
            <i className="dot a" />
            <i className="dot b" />
          </span>
          <span className="nav-brand-text">Taste Clash</span>
        </span>
        <div className="nav-side end">{children}</div>
      </div>
    </nav>
  );
}

export function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden>
      <circle cx="12" cy="8.5" r="4" fill="currentColor" />
      <path d="M4.5 20c.8-4 3.9-6.2 7.5-6.2s6.7 2.2 7.5 6.2" fill="currentColor" />
    </svg>
  );
}

export function Avatar({ src, name, size = 48, tone }: { src?: string; name: string; size?: number; tone?: 'a' | 'b' }) {
  const initials = name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span className={`avatar ${tone ? `tone-${tone}` : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" /> : initials}
    </span>
  );
}

export interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

/** Один плавающий тултип на график: следует за курсором, работает и от фокуса с клавиатуры. */
export function useTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = useCallback(
    (content: ReactNode) => ({
      onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
      onMouseLeave: () => setTip(null),
      onFocus: (e: React.FocusEvent) => {
        const r = (e.currentTarget as Element).getBoundingClientRect();
        setTip({ x: r.left + r.width / 2, y: r.top, content });
      },
      onBlur: () => setTip(null),
      tabIndex: 0,
    }),
    [],
  );
  const node = tip && (
    <div className="tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  );
  return { bind, node };
}

/** Копирует ссылку; на телефонах сначала пробует системное меню «Поделиться». */
export function ShareButton({
  getUrl,
  label,
  title,
  className = 'btn',
}: {
  getUrl: () => Promise<string>;
  label: string;
  title: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'done' | 'manual'>('idle');
  const [manualUrl, setManualUrl] = useState('');

  const onClick = async () => {
    const url = await getUrl();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* пользователь закрыл меню — падаем в копирование */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('done');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setManualUrl(url);
      setState('manual');
    }
  };

  return (
    <span className="share">
      <button className={className} onClick={onClick}>
        {state === 'done' ? 'Ссылка скопирована ✓' : label}
      </button>
      {state === 'manual' && (
        <input className="manual-url" readOnly value={manualUrl} onFocus={(e) => e.currentTarget.select()} autoFocus />
      )}
    </span>
  );
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
