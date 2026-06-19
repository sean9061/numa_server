import { useEffect, useRef } from 'react';
import { useStore, wsSend } from '../../store/useStore';

export function LogDrawer() {
  const selected    = useStore(s => s.selectedService);
  const logLines    = useStore(s => s.logLines);
  const setSelected = useStore(s => s.setSelectedService);
  const viewRef     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const atBottom = view.scrollHeight - view.clientHeight <= view.scrollTop + 24;
    if (atBottom) view.scrollTop = view.scrollHeight;
  }, [logLines]);

  if (!selected) return null;

  function close() {
    if (selected) wsSend({ type: 'unsubscribe_logs', container: selected });
    setSelected(null);
  }

  return (
    <div className="logdrawer">
      <div className="logdrawer-head">
        <div className="logdrawer-title">
          Logs
          <span className="logdrawer-name">{selected}</span>
        </div>
        <button className="logdrawer-close" onClick={close} title="Close">✕</button>
      </div>
      <div className="log-view" ref={viewRef}>
        {logLines.length === 0
          ? <span style={{ color: 'var(--muted)' }}>Connecting…</span>
          : logLines.map((line, i) => (
            <div key={i} className={`log-line${/error|fatal|warn/i.test(line) ? ' err' : ''}`}>{line}</div>
          ))}
      </div>
    </div>
  );
}
