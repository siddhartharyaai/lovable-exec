import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../src/pages/Settings';

const invokeMock = vi.fn(async () => ({ data: { authUrl: null }, error: null }));

function makeQuery() {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn((col: string) => {
    q._lastEqCol = col;
    return q;
  });
  q.maybeSingle = vi.fn(async () => {
    // Settings resolves legacy user id via users.auth_user_id first
    if (q._table === 'users' && q._lastEqCol === 'auth_user_id') {
      return { data: { id: 'legacy-user-id' }, error: null };
    }

    // Default: not found
    return { data: null, error: null };
  });
  q.update = vi.fn(() => q);
  q.delete = vi.fn(() => q);
  return q;
}

vi.mock('../src/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const q = makeQuery();
      q._table = table;
      return q;
    }),
    functions: {
      invoke: invokeMock,
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'auth-user-id', email: 'test@example.com' },
    profile: {
      id: 'auth-user-id',
      phone: '+15555555555',
      name: 'Test',
      email: 'test@example.com',
      city: 'Mumbai',
      tz: 'Asia/Kolkata',
      onboarding_completed: true,
      daily_briefing_enabled: true,
      birthday_reminders_enabled: true,
      briefing_time: '08:00',
      gmail_tab_preference: 'primary',
      briefing_sections: {
        weather: true,
        news: true,
        tasks: true,
        calendar: true,
        emails: true,
        reminders: true,
      },
      avatar_url: null,
    },
    signOut: vi.fn(async () => {}),
    refreshProfile: vi.fn(async () => {}),
  }),
}));

describe('Settings: Google connect uses legacy user id', () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it('invokes auth-google with users.id resolved by users.auth_user_id', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    const btn = await screen.findByRole('button', { name: /connect google/i });

    await waitFor(() => {
      expect(btn).toBeEnabled();
    });

    await user.click(btn);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = invokeMock.mock.calls[0];
    expect(fnName).toBe('auth-google');
    expect(args?.body?.userId).toBe('legacy-user-id');
  });
});

