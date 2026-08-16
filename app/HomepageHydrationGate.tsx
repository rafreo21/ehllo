/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState } from "react";
import HomepageClient from "./HomepageClient";

type HomepageHydrationGateProps = {
  includeDraftReviewLink?: boolean;
};

export default function HomepageHydrationGate({ includeDraftReviewLink = false }: HomepageHydrationGateProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
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

  return <HomepageClient includeDraftReviewLink={includeDraftReviewLink} />;
}
