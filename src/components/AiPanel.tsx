import { useEffect, useMemo, useState } from 'react';
import {
  aiAvailable,
  fetchMix,
  fetchVerdict,
  mixRequest,
  personalize,
  verdictRequest,
  type MixResponse,
  type VerdictResponse,
} from '../lib/ai';
import type { Clash } from '../lib/compare';
import type { Profile, ProfileTrack } from '../lib/types';

interface Props {
  a: Profile;
  b: Profile;
  clash: Clash;
}

type Async<T> = { state: 'idle' } | { state: 'loading' } | { state: 'done'; data: T } | { state: 'error'; message: string };

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

function useAsync<T>() {
  const [value, setValue] = useState<Async<T>>({ state: 'idle' });
  const run = async (fn: () => Promise<T>) => {
    setValue({ state: 'loading' });
    try {
      setValue({ state: 'done', data: await fn() });
    } catch (e) {
      setValue({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
  return [value, run] as const;
}

function TrackLine({ t, owner, children }: { t: ProfileTrack; owner?: 'A' | 'B' | 'both'; children?: React.ReactNode }) {
  const label = `${t.name} — ${t.artistNames.join(', ')}`;
  return (
    <span className="ai-track">
      <span className="cover small">{t.img && <img src={t.img} alt="" loading="lazy" />}</span>
      <span className="shared-text">
        {SPOTIFY_ID.test(t.id) ? (
          <a href={`https://open.spotify.com/track/${t.id}`} target="_blank" rel="noreferrer noopener">
            <b>{t.name}</b>
          </a>
        ) : (
          <b>{t.name}</b>
        )}
        <span className="muted">{t.artistNames.join(', ')}</span>
        {children}
      </span>
      {owner && <span className={`owner ${owner}`} title={owner === 'both' ? 'Общий трек' : undefined} aria-label={label} />}
    </span>
  );
}

export function AiPanel({ a, b, clash }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [verdict, runVerdict] = useAsync<VerdictResponse>();
  const [mix, runMix] = useAsync<MixResponse>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    aiAvailable().then(setAvailable);
  }, []);

  const tracks = useMemo(() => {
    const m = new Map<string, ProfileTrack>();
    for (const t of [...b.tracks, ...a.tracks]) m.set(t.id, t);
    return m;
  }, [a, b]);
  const owner = (id: string): 'A' | 'B' | 'both' => {
    const inA = a.tracks.some((t) => t.id === id);
    const inB = b.tracks.some((t) => t.id === id);
    return inA && inB ? 'both' : inA ? 'A' : 'B';
  };
  const say = (s: string) => personalize(s, a.name, b.name);

  if (available === false) {
    return (
      <p className="muted">
        ИИ-вердикт и микс-плейлист работают через сервер с ключом Gemini API. Запустите приложение через{' '}
        <code>npm run dev</code> или <code>npm start</code> и задайте <code>GEMINI_API_KEY</code> в <code>.env.local</code>.
      </p>
    );
  }

  const copyMix = async (data: MixResponse) => {
    const lines = data.tracks.map((x, i) => {
      const t = tracks.get(x.id)!;
      return `${i + 1}. ${t.artistNames.join(', ')} — ${t.name}`;
    });
    try {
      await navigator.clipboard.writeText(`${say(data.title)}\n\n${lines.join('\n')}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* буфер обмена недоступен — список и так виден на странице */
    }
  };

  return (
    <div className="ai">
      <p className="muted small privacy">
        В Gemini уходят только названия треков и исполнителей и статистика различий — без ваших имён и аккаунтов.
      </p>

      <div className="ai-block">
        {verdict.state === 'done' ? (
          <div className="ai-verdict">
            <p className="ai-headline">{say(verdict.data.headline)}</p>
            <p className="ai-road">
              <span aria-hidden>🚗</span> {say(verdict.data.roadTrip)}
            </p>
            <p>{say(verdict.data.details)}</p>
            {verdict.data.picks.length > 0 && (
              <>
                <h3>Здесь вы сойдётесь</h3>
                <ul className="ai-list">
                  {verdict.data.picks.map((p) => {
                    const t = tracks.get(p.id);
                    return (
                      t && (
                        <li key={p.id}>
                          <TrackLine t={t} owner={owner(p.id)}>
                            <span className="ai-why">{say(p.why)}</span>
                          </TrackLine>
                        </li>
                      )
                    );
                  })}
                </ul>
              </>
            )}
            <button className="btn ghost small" onClick={() => runVerdict(() => fetchVerdict(verdictRequest(a, b, clash)))}>
              Другой вердикт
            </button>
          </div>
        ) : (
          <div className="ai-cta">
            <div>
              <h3>Компромиссный вердикт</h3>
              <p className="muted small">ИИ разберёт ваши различия и найдёт треки, на которых вы сойдётесь.</p>
            </div>
            <button
              className="btn primary"
              disabled={verdict.state === 'loading' || available === null}
              onClick={() => runVerdict(() => fetchVerdict(verdictRequest(a, b, clash)))}
            >
              {verdict.state === 'loading' ? 'Думаю…' : 'Получить вердикт'}
            </button>
          </div>
        )}
        {verdict.state === 'error' && <p className="ai-error">{verdict.message}</p>}
      </div>

      <div className="ai-block">
        {mix.state === 'done' ? (
          <div className="ai-mix">
            <h3 className="ai-mix-title">{say(mix.data.title)}</h3>
            <p className="muted">{say(mix.data.description)}</p>
            <div className="legend">
              <span>
                <i className="swatch a" /> {a.name}
              </span>
              <span>
                <i className="swatch b" /> {b.name}
              </span>
              <span>
                <i className="swatch ab" /> общий
              </span>
            </div>
            <ol className="ai-list mix">
              {mix.data.tracks.map((x) => {
                const t = tracks.get(x.id)!;
                return (
                  <li key={x.id}>
                    <TrackLine t={t} owner={owner(x.id)}>
                      <span className="ai-why">{say(x.transition)}</span>
                    </TrackLine>
                  </li>
                );
              })}
            </ol>
            <div className="slot-actions">
              <button className="btn small" onClick={() => copyMix(mix.data)}>
                {copied ? 'Скопировано ✓' : 'Скопировать список'}
              </button>
              <button className="btn ghost small" onClick={() => runMix(() => fetchMix(mixRequest(a, b)))}>
                Пересобрать
              </button>
            </div>
          </div>
        ) : (
          <div className="ai-cta">
            <div>
              <h3>Микс-плейлист</h3>
              <p className="muted small">Треки обоих по очереди — с плавными переходами между жанрами и объяснением каждого шага.</p>
            </div>
            <button
              className="btn primary"
              disabled={mix.state === 'loading' || available === null}
              onClick={() => runMix(() => fetchMix(mixRequest(a, b)))}
            >
              {mix.state === 'loading' ? 'Собираю микс…' : 'Собрать микс'}
            </button>
          </div>
        )}
        {mix.state === 'error' && <p className="ai-error">{mix.message}</p>}
      </div>
    </div>
  );
}
