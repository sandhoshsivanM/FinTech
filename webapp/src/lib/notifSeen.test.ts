import { beforeEach, describe, expect, it } from 'vitest';
import { loadSeen, markSeen, unreadCount } from './notifSeen';

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
});
