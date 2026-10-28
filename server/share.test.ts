import { describe, expect, it } from 'vitest';
import { loadReplies, loadShare, saveReply, saveShare } from './share.ts';

describe('короткие ссылки и ответы', () => {
  it('сохраняет код и отдаёт его по id', async () => {
    const { id, owner } = await saveShare({ code: 'abc_DEF-1' });
    expect(id).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(owner.length).toBeGreaterThan(20);
    expect(await loadShare(id)).toEqual({ code: 'abc_DEF-1' });
  });

  it('ответы видит только автор приглашения', async () => {
    const { id, owner } = await saveShare({ code: 'mine' });
    await saveReply({ id, code: 'friend1' });
    await saveReply({ id, code: 'friend2' });
    expect(await loadReplies(id, owner)).toEqual({ codes: ['friend1', 'friend2'] });
    await expect(loadReplies(id, 'wrong-token')).rejects.toMatchObject({ status: 403 });
    await expect(loadReplies(id, '')).rejects.toMatchObject({ status: 403 });
  });

  it('хранит не больше 10 последних ответов', async () => {
    const { id, owner } = await saveShare({ code: 'mine' });
    for (let i = 0; i < 12; i++) await saveReply({ id, code: `f${i}` });
    const { codes } = await loadReplies(id, owner);
    expect(codes).toHaveLength(10);
    expect(codes[0]).toBe('f2');
  });

  it('отклоняет ответ на несуществующее приглашение и мусор', async () => {
    await expect(saveReply({ id: 'AAAAAAAA', code: 'x' })).rejects.toMatchObject({ status: 404 });
    const { id } = await saveShare({ code: 'mine' });
    await expect(saveReply({ id, code: 'a.b' })).rejects.toMatchObject({ status: 400 });
    await expect(saveReply({ id, code: '<script>' })).rejects.toMatchObject({ status: 400 });
    await expect(saveReply({ id: '../x', code: 'ok' })).rejects.toMatchObject({ status: 400 });
  });
});
