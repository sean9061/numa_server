/** ON/OFF state pill for plugs, lights, bots. */
export function StatePill({ on }: { on?: boolean | null }) {
  if (on == null) return <span className="state-pill unknown">—</span>;
  return <span className={`state-pill ${on ? 'on' : 'off'}`}>{on ? 'ON' : 'OFF'}</span>;
}
