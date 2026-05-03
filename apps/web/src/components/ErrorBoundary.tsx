import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 12,
          padding: 32,
        }}>
          <span className="t-mono t-red" style={{ fontSize: 12 }}>// render error</span>
          <span className="t-mono t-faint" style={{ fontSize: 11 }}>{this.state.error.message}</span>
          <button
            className="btn sm"
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 8 }}
          >
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
