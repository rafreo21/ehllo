/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState, type ComponentType } from "react";

type HomepageHydrationGateProps = {
  includeDraftReviewLink?: boolean;
};

type HomepageClientComponent = ComponentType<HomepageHydrationGateProps>;

function HomepageLoadingShell() {
  return (
    <main className="route-state" aria-label="Loading ehllo" aria-busy="true">
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

export default function HomepageHydrationGate({ includeDraftReviewLink = false }: HomepageHydrationGateProps) {
  const [HomepageClient, setHomepageClient] = useState<HomepageClientComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./HomepageClient").then((module) => {
      if (!cancelled) setHomepageClient(() => module.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!HomepageClient) return <HomepageLoadingShell />;

  return <HomepageClient includeDraftReviewLink={includeDraftReviewLink} />;
}
