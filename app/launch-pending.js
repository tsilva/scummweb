export default function LaunchPending({ className = "" }) {
  return <button type="button" className={`launch-button launch-button-pending ${className}`.trim()}
    disabled aria-busy="true" aria-label="Updating saved games">Updating…</button>;
}
