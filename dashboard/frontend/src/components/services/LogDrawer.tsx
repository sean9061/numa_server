import { useEffect, useRef } from 'react';
import { useStore, wsSend } from '../../store/useStore';

export function LogDrawer() {
  const selectedService    = useStore(s => s.selectedService);
  const logLines           = useStore(s => s.logLines);
  const setSelectedService = useStore(s => s.setSelectedService);
  const viewRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const atBottom = view.scrollHeight - view.clientHeight <= view.scrollTop + 20;
    if (atBottom) view.scrollTop = view.scrollHeight;
  }, [logLines]);

  if (!selectedService) return null;

  function close() {
    wsSend({ type: 'unsubscribe_logs', container: selectedService });
    setSelectedService(null);
  }

  return (
    <div style={{
      height: 200,
      flexShrink: 0,
      background: 'var(--bg)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)' }}>
            Logs
          </span>
          <span style={{
            fontSize: 11, color: 'var(--text)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '1px 7px',
            fontFamily: 'monospace',
          }}>
            {selectedService}
          </span>
        </div>
        <button
          onClick={close}
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--dim)', cursor: 'pointer',
            fontSize: 16, lineHeight: 1, padding: '1px 4px',
            borderRadius: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* Log content */}
      <div className="log-view" ref={viewRef}>
        {logLines.length === 0
          ? <span style={{ color: 'var(--dim)' }}>Connecting...</span>
          : logLines.map((line, i) => (
            <div key={i} className={`log-line${/error|err|fatal|warn/i.test(line) ? ' err' : ''}`}>
              {line}
            </div>
          ))
        }
      </div>
    </div>
  );
}
