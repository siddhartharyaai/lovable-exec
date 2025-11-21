import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../src/App';

// Mock Supabase client
vi.mock('../src/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

describe('Critical User Flow: Landing Page Load', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('should render the landing page with Man Friday branding', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    // Check for Man Friday branding
    await waitFor(() => {
      const headings = screen.getAllByRole('heading');
      const hasManFriday = headings.some(heading => 
        heading.textContent?.toLowerCase().includes('man friday')
      );
      expect(hasManFriday).toBe(true);
    });
  });

  it('should display key value propositions on landing page', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    // Look for key executive assistant features mentioned
    await waitFor(() => {
      const pageText = document.body.textContent?.toLowerCase() || '';
      
      // Should mention at least one core feature
      const hasFeatures = 
        pageText.includes('calendar') ||
        pageText.includes('email') ||
        pageText.includes('reminder') ||
        pageText.includes('whatsapp');
      
      expect(hasFeatures).toBe(true);
    });
  });

  it('should render without crashing', () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );
    
    expect(container).toBeTruthy();
  });

  it('should have proper navigation structure', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    // Should have some kind of navigation or links
    await waitFor(() => {
      const links = screen.queryAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });
  });
});
