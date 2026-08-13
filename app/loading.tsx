export default function Loading() {
  return (
    <main className="route-state" aria-label="Loading Ehllo" aria-busy="true">
      <div className="route-state-panel">
        <span className="route-state-mark">A</span>
        <div className="route-state-lines">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  );
}
