export default function ConsumerLoading() {
  return (
    <div className="loading-skeleton" aria-label="Loading ehllo" aria-busy="true">
      <span className="skeleton loading-skeleton-heading" />
      <div className="loading-skeleton-rows">
        <span className="skeleton loading-skeleton-row" />
        <span className="skeleton loading-skeleton-row" />
        <span className="skeleton loading-skeleton-row" />
      </div>
    </div>
  );
}
