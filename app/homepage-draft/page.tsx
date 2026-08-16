import dynamic from "next/dynamic";

const HomepageClientGate = dynamic(() => import("../HomepageHydrationGate"), {
  ssr: false,
  loading: () => <main className="route-state" aria-label="Loading ehllo" aria-busy="true"><div className="route-state-panel"><span className="route-state-mark">A</span><div className="route-state-lines"><span /><span /><span /></div></div></main>,
});

export default function HomepageDraft() {
  return <HomepageClientGate includeDraftReviewLink />;
}
