import { beforeEach, describe, expect, it } from 'vitest';
import { loadSeen, markOneSeen, markSeen, unreadCount } from './notifSeen';

describe('notification seen-state', () => {
  beforeEach(() => localStorage.clear());

  it('starts with nothing seen, so every item is unread', () => {
    expect(unreadCount(['b-1:100', 'p-2:200'], loadSeen())).toBe(2);
  });

  it('marking seen persists and clears the unread count', () => {
    markSeen(['b-1:100', 'p-2:200']);
    expect(unreadCount(['b-1:100', 'p-2:200'], loadSeen())).toBe(0);
  });

  it('a new occurrence of the same bill is unread again', () => {
    markSeen(['b-1:100']);
    expect(unreadCount(['b-1:200'], loadSeen())).toBe(1);
  });

  it('forgets keys that are no longer listed', () => {
    markSeen(['b-1:100', 'p-2:200']);
    markSeen(['p-2:200']);
    expect([...loadSeen()]).toEqual(['p-2:200']);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('kz.notifications.seen', '{not json');
    expect(loadSeen().size).toBe(0);
  });

  it('opening one of four marks only that one as read', () => {
    const keys = ['a-1', 'b-2:100', 'p-3:200', 'm-4'];
    const seen = markOneSeen('b-2:100', keys, loadSeen());
    expect(unreadCount(keys, seen)).toBe(3);
    expect(seen.has('b-2:100')).toBe(true);
    expect(unreadCount(keys, loadSeen())).toBe(3);
  });

  it('reading items one by one keeps earlier reads', () => {
    const keys = ['a-1', 'b-2:100', 'p-3:200'];
    let seen = markOneSeen('a-1', keys, loadSeen());
    seen = markOneSeen('p-3:200', keys, seen);
    expect([...seen].sort()).toEqual(['a-1', 'p-3:200']);
    expect(unreadCount(keys, seen)).toBe(1);
  });
});
