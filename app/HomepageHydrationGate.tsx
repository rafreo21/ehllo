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
    return null;
  }

  return <HomepageClient includeDraftReviewLink={includeDraftReviewLink} />;
}
