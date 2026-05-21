// F1.3 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md).
// Six tests covering the five-state machine: idle | expanded | sending
// | sent | error. The 3000ms sent → idle timer is exercised via fake
// timers; the unmount/cleanup case is implicit (vitest would warn on
// setState-after-teardown if the useEffect cleanup were missing).

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackForm } from '../FeedbackForm';

vi.mock('../../../lib/api', () => ({
  api: {
    feedback: {
      submit: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeedbackForm — five-state machine', () => {
  it('idle: renders the [report something weird] button and the subline', () => {
    render(<FeedbackForm />);
    expect(screen.getByRole('button', { name: /report something weird/ })).toBeInTheDocument();
    expect(screen.getByText(/share what's broken/)).toBeInTheDocument();
    // The textarea should NOT be present in idle.
    expect(screen.queryByPlaceholderText(/what happened/)).not.toBeInTheDocument();
  });

  it('idle → expanded: clicking the button reveals the focused textarea + send + cancel', () => {
    render(<FeedbackForm />);
    fireEvent.click(screen.getByRole('button', { name: /report something weird/ }));

    const textarea = screen.getByPlaceholderText(/what happened/);
    expect(textarea).toBeInTheDocument();
    expect(document.activeElement).toBe(textarea);
    expect(screen.getByRole('button', { name: /\[send\]/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /\[cancel\]/ })).toBeInTheDocument();
  });

  it('expanded → idle on cancel: discards the draft (no api call, message gone)', () => {
    render(<FeedbackForm />);
    fireEvent.click(screen.getByRole('button', { name: /report something weird/ }));
    fireEvent.change(screen.getByPlaceholderText(/what happened/), {
      target: { value: 'a draft i will throw away' },
    });
    fireEvent.click(screen.getByRole('button', { name: /\[cancel\]/ }));

    // Back to idle.
    expect(screen.getByRole('button', { name: /report something weird/ })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/what happened/)).not.toBeInTheDocument();
    expect(api.feedback.submit).not.toHaveBeenCalled();

    // Re-opening the form must show an empty textarea — draft is gone.
    fireEvent.click(screen.getByRole('button', { name: /report something weird/ }));
    expect(screen.getByPlaceholderText(/what happened/)).toHaveValue('');
  });

  it('send is disabled while the message is empty/whitespace-only', () => {
    render(<FeedbackForm />);
    fireEvent.click(screen.getByRole('button', { name: /report something weird/ }));
    const sendBtn = screen.getByRole('button', { name: /\[send\]/ });

    expect(sendBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/what happened/), { target: { value: '   ' } });
    expect(sendBtn).toBeDisabled();

    fireEvent.click(sendBtn);
    expect(api.feedback.submit).not.toHaveBeenCalled();
  });

  it('happy path: expanded → sending → sent → (3s) → idle, with submit called', async () => {
    vi.useFakeTimers();
    (api.feedback.submit as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'fb_1' });

    render(<FeedbackForm />);
    fireEvent.click(screen.getByRole('button', { name: /report something weird/ }));
    fireEvent.change(screen.getByPlaceholderText(/what happened/), {
      target: { value: 'hero countdown feels frozen' },
    });
    fireEvent.click(screen.getByRole('button', { name: /\[send\]/ }));

    // sending state — the button label flips.
    expect(screen.getByRole('button', { name: /\[sending…\]/ })).toBeDisabled();

    // Drain the awaited microtask so the resolved submit lands.
    await act(async () => { await Promise.resolve(); });

    // sent state — green toast, no buttons.
    expect(screen.getByRole('status')).toHaveTextContent(/thanks — your note is logged/);

    expect(api.feedback.submit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'hero countdown feels frozen' }),
    );

    // After 3000ms the toast collapses back to idle.
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('button', { name: /report something weird/ })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('error path: submit rejection → error view → [try again] returns to expanded with message preserved', async () => {
    (api.feedback.submit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));

    render(<FeedbackForm />);
    fireEvent.click(screen.getByRole('button', { name: /report something weird/ }));
    fireEvent.change(screen.getByPlaceholderText(/what happened/), {
      target: { value: 'something needs fixing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /\[send\]/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't send/);
    });

    fireEvent.click(screen.getByRole('button', { name: /try again/ }));

    // Back to expanded, with the message preserved (not blank).
    expect(screen.getByPlaceholderText(/what happened/)).toHaveValue('something needs fixing');
  });
});
