'use client';
/**
 * Catches a render error on one screen instead of losing the whole app.
 *
 * Without this, an exception thrown while rendering unmounts the entire React
 * tree, leaving a blank document — which the desktop wrapper then reports as
 * "This page couldn't load", a message that tells the user nothing and offers
 * no way back. Here the shell (and the nav) survives, the error is named, and
 * the data is explicitly reassured about: it lives encrypted in IndexedDB and
 * a render error cannot touch it.
 */
import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — pass the route so navigating retries. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  /** The resetKey the current error belongs to. */
  key?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Navigating away from a broken screen must clear the error, or the user
    // is stuck on it for the rest of the session.
    if (state.error && state.key !== undefined && state.key !== props.resetKey) {
      return { error: null, key: props.resetKey };
    }
    if (!state.error) return { key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error) {
    // Console only. Nothing is reported anywhere: an error message from this
    // app can quote a merchant name or an amount, and the whole point of
    // Khazana is that none of that leaves the device.
    console.error('[Khazana] screen error:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid place-items-center py-16 px-4">
        <div className="max-w-md text-center">
          <AlertTriangle size={26} className="mx-auto" style={{ color: 'var(--warn)' }} />
          <h2 className="mt-4 text-lg font-bold">This screen hit an error</h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">
            Your data is safe — it is stored encrypted on this device and nothing here changed it.
            Try again, or move to another screen and come back.
          </p>
          <pre className="mt-4 text-left text-[11px] text-muted bg-[var(--surface-2)] rounded-xl p-3 overflow-x-auto">
            {error.message || String(error)}
          </pre>
          <div className="mt-4 flex gap-2 justify-center">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--line)] hover:border-[var(--accent)]"
            >
              Try again
            </button>
            <button
              onClick={() => { location.href = '/dashboard'; }}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--line)] hover:border-[var(--accent)]"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
