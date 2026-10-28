import { useState } from 'react';
import { decodeProfile } from '../lib/codec';
import { inviteLink, resolveCode, type Reply } from '../lib/links';
import { CLIENT_ID } from '../lib/spotify';
import type { Slots } from '../lib/storage';
import type { Profile, Slot } from '../lib/types';
import { Avatar, NavBar, PersonIcon, ShareButton } from './ui';

interface Props {
  slots: Slots;
  replies: Reply[];
  /** Имя автора приглашения, если после входа этот браузер отправит ему ответ. */
  replyTo?: string;
  onOpenReply: (r: Reply) => void;
  onDismissReply: (r: Reply) => void;
  onConnect: (slot: Slot) => void;
  onSet: (slot: Slot, p: Profile | undefined) => void;
  onCompare: () => void;
  onDemo: () => void;
  onError: (msg: string) => void;
}

/** Можно вставить целиком ссылку-приглашение (длинную или короткую) или сам код. */
function extractCode(input: string): string {
  const m = input.match(/invite=([A-Za-z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

type SlotProps = Pick<Props, 'onConnect' | 'onSet' | 'onError'>;

function SlotCard({ slot, profile, ...p }: { slot: Slot; profile?: Profile } & SlotProps) {
  const [pasting, setPasting] = useState(false);
  const [code, setCode] = useState('');
  const label = slot === 'a' ? 'Игрок 1' : 'Игрок 2';

  if (profile) {
    return (
      <div className={`slot filled tone-${slot}`}>
        <span className="slot-label">{label}</span>
        <Avatar src={profile.avatar} name={profile.name} size={72} tone={slot} />
        <h3>{profile.name}</h3>
        <p className="muted">
          {profile.artists.length} исполнителей · {profile.tracks.length} треков
          <br />
          слепок от {new Date(profile.createdAt).toLocaleDateString('ru-RU')}
        </p>
        <div className="slot-actions">
          <ShareButton
            className="btn ghost small"
            label="Ссылка-приглашение"
            title={`Сравни свой вкус с ${profile.name}`}
            getUrl={() => inviteLink(profile)}
          />
          <button className="btn ghost small" onClick={() => p.onSet(slot, undefined)}>
            Убрать
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    try {
      p.onSet(slot, await decodeProfile(await resolveCode(extractCode(code))));
      setPasting(false);
      setCode('');
    } catch (e) {
      p.onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={`slot empty tone-${slot}`}>
      <span className="slot-label">{label}</span>
      <div className="slot-ghost" aria-hidden>
        <PersonIcon />
      </div>
      {pasting ? (
        <div className="paste">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Вставьте ссылку-приглашение или код"
            rows={3}
            autoFocus
          />
          <div className="slot-actions">
            <button className="btn small" onClick={submit} disabled={!code.trim()}>
              Добавить
            </button>
            <button className="btn ghost small" onClick={() => setPasting(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="slot-actions column">
          <button
            className="btn spotify"
            onClick={() => p.onConnect(slot)}
            disabled={!CLIENT_ID}
            title={CLIENT_ID ? undefined : 'Задайте SPOTIFY_CLIENT_ID в .env.local'}
          >
            Войти через Spotify
          </button>
          <button className="btn ghost" onClick={() => setPasting(true)}>
            У меня есть код друга
          </button>
        </div>
      )}
    </div>
  );
}

function Replies({ replies, onOpen, onDismiss }: { replies: Reply[]; onOpen: Props['onOpenReply']; onDismiss: Props['onDismissReply'] }) {
  if (!replies.length) return null;
  return (
    <section className="replies" aria-label="Ответы на приглашения">
      <ul className="replies-list">
        {replies.map((r) => (
          <li key={r.key}>
            <Avatar src={r.friend.avatar} name={r.friend.name} size={44} tone="b" />
            <span className="reply-text">
              <b>{r.friend.name}</b>
              <span className="muted">принимает ваше приглашение</span>
            </span>
            <button className="btn primary small" onClick={() => onOpen(r)}>
              Смотреть результат
            </button>
            <button className="link-btn" onClick={() => onDismiss(r)} aria-label={`Скрыть ответ ${r.friend.name}`}>
              Скрыть
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Lobby({ slots, replies, replyTo, onOpenReply, onDismissReply, onCompare, onDemo, ...rest }: Props) {
  const ready = Boolean(slots.a && slots.b);
  const one = slots.a ?? slots.b;

  return (
    <>
    <NavBar>
      {!one && (
        <button className="link-btn" onClick={onDemo}>
          Демо
        </button>
      )}
    </NavBar>
    <main className="page lobby">
      <header className="hero">
        <p className="eyebrow">Музыкальная совместимость</p>
        <h1>
          Два вкуса.
          <br />
          <span className="gradient-text">Один ответ.</span>
        </h1>
        <p className="lead">Насколько совпадают ваши музыкальные вкусы? Подключите два Spotify-аккаунта и получите разбор совместимости.</p>
      </header>

      <Replies replies={replies} onOpen={onOpenReply} onDismiss={onDismissReply} />

      <section className="slots">
        <SlotCard slot="a" profile={slots.a} {...rest} />
        <div className="vs" aria-hidden>
          VS
        </div>
        <SlotCard slot="b" profile={slots.b} {...rest} />
      </section>

      <div className="cta">
        {ready ? (
          <button className="btn primary big" onClick={onCompare}>
            Сравнить вкусы
          </button>
        ) : one && replyTo ? (
          <p className="muted">Войдите через Spotify во втором слоте — результат увидите вы оба: ваш слепок вкуса уйдёт {replyTo}.</p>
        ) : one ? (
          <p className="muted">
            Отправьте другу ссылку-приглашение — или подключите второй аккаунт на этом устройстве (в окне Spotify нажмите «Не вы?»).
          </p>
        ) : (
          <button className="btn ghost" onClick={onDemo}>
            Посмотреть демо без входа
          </button>
        )}
      </div>

      {!CLIENT_ID && (
        <p className="notice">
          Вход через Spotify не настроен: создайте приложение в Spotify Developer Dashboard и пропишите <code>SPOTIFY_CLIENT_ID</code> в{' '}
          <code>.env.local</code>. Демо и коды друзей работают и без этого.
        </p>
      )}

      <section className="how">
        <h2>Как это работает</h2>
        <ol>
          <li>
            <b>Слепок вкуса.</b> Берём ваш топ исполнителей и треков за 4 недели, полгода и всё время.
          </li>
          <li>
            <b>Ссылка-приглашение.</b> Слепок хранит только топы — без токенов и паролей. Сервер держит его под короткой ссылкой 30 дней.
          </li>
          <li>
            <b>Сравнение.</b> Друг открывает ссылку и входит в свой Spotify. Он сразу видит совместимость, общих артистов, жанры, эпохи и рекомендации, а вам на главной приходит его ответ.
          </li>
        </ol>
      </section>
    </main>
    </>
  );
}
