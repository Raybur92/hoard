// F1.3 of the feedback-channel workstream (docs/FEEDBACK_PLAN.md). The
// user-facing in-app feedback form. Lives in the new Settings → About
// section. Five states exactly per §3.3 + scope edge: idle, expanded,
// sending, sent, error. Cancel discards the draft (no confirm); the
// error path returns to expanded with the message preserved via the
// [try again] link.
//
// The 3000ms `sent → idle` timer is cleaned up via useEffect's return
// cleanup — without it, an unmount inside the sent window would fire
// setState after teardown and React would warn during tests.

import { useState, useEffect, useRef } from 'react';
import { Btn } from '../primitives/Btn';
import { api } from '../../lib/api';

type State =
  | { kind: 'idle' }
  | { kind: 'expanded'; message: string }
  | { kind: 'sending'; message: string }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export function FeedbackForm() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autofocus the textarea on every transition into `expanded`. This
  // covers initial open AND the post-error `[try again]` path.
  useEffect(() => {
    if (state.kind === 'expanded') {
      textareaRef.current?.focus();
    }
  }, [state.kind]);

  // sent → idle after 3000ms. Cleanup runs on unmount AND on state
  // change away from `sent` — both matter: unmount mid-toast would
  // otherwise setState after teardown, and any future re-entry into
  // `sent` would otherwise stack timers.
  useEffect(() => {
    if (state.kind !== 'sent') return;
    const t = setTimeout(() => setState({ kind: 'idle' }), 3000);
    return () => clearTimeout(t);
  }, [state.kind]);

  async function handleSend(message: string): Promise<void> {
    setState({ kind: 'sending', message });
    try {
      await api.feedback.submit({
        message,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        ua: navigator.userAgent,
      });
      setState({ kind: 'sent' });
    } catch {
      setState({ kind: 'error', message });
    }
  }

  if (state.kind === 'idle') {
    return (
      <div>
        <Btn sm onClick={() => setState({ kind: 'expanded', message: '' })}>
          [report something weird]
        </Btn>
        <div className="t-mono t-faint" style={{ marginTop: 10, fontSize: 'var(--text-2xs)' }}>
          // share what's broken, weird, or could be better.
        </div>
      </div>
    );
  }

  if (state.kind === 'sent') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="t-mono t-green"
        style={{ fontSize: 'var(--text-xs)' }}
      >
        // thanks — your note is logged
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span role="alert" className="t-mono t-red" style={{ fontSize: 'var(--text-xs)' }}>
          // couldn't send. try again?
        </span>
        <button
          type="button"
          onClick={() => setState({ kind: 'expanded', message: state.message })}
          className="t-mono"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--paper-dim)',
            fontSize: 'var(--text-xs)',
            padding: 0,
          }}
        >
          [try again]
        </button>
      </div>
    );
  }

  // expanded | sending
  const { message } = state;
  const disabled = state.kind === 'sending';
  const canSend = !disabled && message.trim().length > 0;

  return (
    <div>
      <label htmlFor="feedback-textarea" className="sr-only">
        your feedback message
      </label>
      <textarea
        id="feedback-textarea"
        ref={textareaRef}
        className="field"
        rows={5}
        maxLength={16000}
        value={message}
        disabled={disabled}
        placeholder="// what happened? mention the page if relevant."
        onChange={(e) => setState({ kind: 'expanded', message: e.target.value })}
        style={{
          width: '100%',
          maxWidth: 540,
          resize: 'vertical',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--text-xs)',
        }}
      />
      <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Btn sm variant="primary" disabled={!canSend} onClick={() => void handleSend(message)}>
          {disabled ? '[sending…]' : '[send]'}
        </Btn>
        <button
          type="button"
          onClick={() => setState({ kind: 'idle' })}
          disabled={disabled}
          className="t-mono"
          style={{
            background: 'none',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            color: 'var(--paper-dim)',
            fontSize: 'var(--text-xs)',
            padding: 0,
          }}
        >
          [cancel]
        </button>
      </div>
    </div>
  );
}
