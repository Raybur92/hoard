// A1 commit 3 — regression-guards the promotion of ConfirmModal from
// SettingsDesktop's inline definition to apps/web/src/components/modals/.
// Coverage: each variant renders the right copy, the typed-confirm
// gate unlocks the confirm button, and the new `'delete-user'`
// variant's count-line plus its A-D11 wishlist-omission lock.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmModal } from '../ConfirmModal';

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) {
  const onTextChange = vi.fn();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props: React.ComponentProps<typeof ConfirmModal> = {
    variant: 'delete-account',
    subject: 'your account',
    confirmKeyword: 'HOARD',
    confirmText: '',
    working: false,
    onTextChange,
    onConfirm,
    onCancel,
    ...overrides,
  };
  const utils = render(<ConfirmModal {...props} />);
  return { ...utils, onTextChange, onConfirm, onCancel, props };
}

describe('ConfirmModal — variant: delete-account (regression after promotion)', () => {
  it('renders the legacy headline + description + cancel/confirm labels', () => {
    setup({ variant: 'delete-account', subject: 'your account', confirmKeyword: 'HOARD' });
    expect(screen.getByText(/delete your account/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /permanently erase your hoard\. there is no recovery/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel · keep my hoard/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete forever/ })).toBeInTheDocument();
  });

  it('uppercases input on every keystroke (legacy variants only)', () => {
    const { onTextChange } = setup({ variant: 'delete-account', confirmKeyword: 'HOARD' });
    const input = screen.getByPlaceholderText('type HOARD');
    fireEvent.change(input, { target: { value: 'hoard' } });
    expect(onTextChange).toHaveBeenCalledWith('HOARD');
  });
});

describe('ConfirmModal — variant: wipe-library (regression after promotion)', () => {
  it('renders the legacy headline + description + cancel/confirm labels', () => {
    setup({ variant: 'wipe-library', subject: 'your library', confirmKeyword: 'WIPE' });
    expect(screen.getByText(/wipe your library/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /deletes every tracked game, status, rating, and note/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel · keep my library/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wipe library/ })).toBeInTheDocument();
  });
});

describe('ConfirmModal — variant: delete-user (new for A1)', () => {
  it('renders the headline interpolated with subject + the A1 description', () => {
    setup({
      variant: 'delete-user',
      subject: 'marco@example.com',
      confirmKeyword: 'marco@example.com',
      details: { games: 488, platforms: 2 },
    });
    expect(screen.getByText(/delete marco@example\.com/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /deletes the account and every owned row/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cancel · keep this user/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete user/ })).toBeInTheDocument();
  });

  it('renders the games + platforms count line when details are provided', () => {
    setup({
      variant: 'delete-user',
      subject: 'marco@example.com',
      confirmKeyword: 'marco@example.com',
      details: { games: 488, platforms: 2 },
    });
    expect(screen.getByText(/488 games · 2 platforms/)).toBeInTheDocument();
  });

  it('singularises games / platforms on count of 1', () => {
    setup({
      variant: 'delete-user',
      subject: 'marco@example.com',
      confirmKeyword: 'marco@example.com',
      details: { games: 1, platforms: 1 },
    });
    expect(screen.getByText(/1 game · 1 platform/)).toBeInTheDocument();
  });

  it('omits the count line entirely when details are absent (terse fallback)', () => {
    setup({
      variant: 'delete-user',
      subject: 'marco@example.com',
      confirmKeyword: 'marco@example.com',
      // no details prop
    });
    // No "// N games · M platforms" line.
    expect(screen.queryByText(/games ·/)).not.toBeInTheDocument();
  });

  it('NEVER renders a wishlists count, even if a future caller mistakenly tries to pass one (locks A-D11)', () => {
    // Defensive lock: if a future caller widens `details` and includes
    // a `wishlists` field, the rendering must not pick it up. Since
    // the prop type itself doesn't declare `wishlists`, we rely on
    // the prop type to enforce — but the rendering code also reads
    // only `games` and `platforms` from details. Cast to `any` to
    // simulate a future drift.
    //
    // Using a sentinel value (99) that's distinct from games/platforms
    // counts so we can grep for it specifically — the description
    // copy intentionally mentions "wishlist" as a row category being
    // deleted, so a generic /wishlist/ regex would false-positive.
    setup({
      variant: 'delete-user',
      subject: 'marco@example.com',
      confirmKeyword: 'marco@example.com',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: { games: 10, platforms: 1, wishlists: 99 } as any,
    });
    expect(screen.queryByText(/99/)).not.toBeInTheDocument();
    // Also confirm no `// 99 wishlists` style row was rendered.
    expect(screen.queryByText(/99 wishlists?/)).not.toBeInTheDocument();
  });

  it('does NOT uppercase input (the keyword is an email/displayIdentity — case matters)', () => {
    const { onTextChange } = setup({
      variant: 'delete-user',
      subject: 'marco@example.com',
      confirmKeyword: 'marco@example.com',
    });
    const input = screen.getByPlaceholderText('type marco@example.com');
    fireEvent.change(input, { target: { value: 'Marco@Example.com' } });
    // Passed through verbatim — no uppercase transform.
    expect(onTextChange).toHaveBeenCalledWith('Marco@Example.com');
  });
});

describe('ConfirmModal — typed-confirm gate (all variants)', () => {
  it('disables confirm until confirmText matches confirmKeyword (delete-account)', () => {
    const { rerender, props, onConfirm } = setup({ confirmKeyword: 'HOARD', confirmText: 'HOAR' });
    const button = screen.getByRole('button', { name: /delete forever/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<ConfirmModal {...props} confirmText="HOARD" />);
    expect(screen.getByRole('button', { name: /delete forever/ })).not.toBeDisabled();
  });

  it('disables confirm until confirmText matches confirmKeyword (delete-user)', () => {
    const { rerender, props, onConfirm } = setup({
      variant: 'delete-user',
      subject: 'marco@example.com',
      confirmKeyword: 'marco@example.com',
      confirmText: 'marco@example.co',
    });
    const button = screen.getByRole('button', { name: /delete user/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<ConfirmModal {...props} confirmText="marco@example.com" />);
    expect(screen.getByRole('button', { name: /delete user/ })).not.toBeDisabled();
  });

  it('Escape key calls onCancel', () => {
    const { onCancel } = setup({ confirmKeyword: 'HOARD' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ConfirmModal — variant: delete-feedback (admin-IA redesign 2026-05-29)', () => {
  it('renders the feedback-specific headline + description + cancel/confirm labels', () => {
    setup({
      variant: 'delete-feedback',
      subject: 'gaetano@example.com',
      confirmKeyword: 'DELETE',
    });
    expect(screen.getByText(/delete this feedback row/i)).toBeInTheDocument();
    expect(
      screen.getByText(/removes this feedback row from the database/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cancel · keep this feedback/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^delete feedback$/i }),
    ).toBeInTheDocument();
  });

  it('uppercases the input (DELETE keyword is fixed uppercase)', () => {
    const { onTextChange } = setup({
      variant: 'delete-feedback',
      subject: 'gaetano@example.com',
      confirmKeyword: 'DELETE',
    });
    const input = screen.getByPlaceholderText('type DELETE');
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(onTextChange).toHaveBeenCalledWith('DELETE');
  });

  it('disables confirm until confirmText === "DELETE"', () => {
    const { rerender, props } = setup({
      variant: 'delete-feedback',
      subject: 'gaetano@example.com',
      confirmKeyword: 'DELETE',
      confirmText: 'DELET',
    });
    expect(screen.getByRole('button', { name: /^delete feedback$/i })).toBeDisabled();
    rerender(<ConfirmModal {...props} confirmText="DELETE" />);
    expect(screen.getByRole('button', { name: /^delete feedback$/i })).not.toBeDisabled();
  });
});
