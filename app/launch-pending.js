export default function LaunchPending({ className = "" }) {
  return <button type="button" className={`launch-button launch-button-pending ${className}`.trim()}
    disabled aria-busy="true" aria-label="Checking saved games">Checking saves…</button>;
}
