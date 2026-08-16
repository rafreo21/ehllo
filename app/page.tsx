import dynamic from "next/dynamic";

const HomepageClient = dynamic(() => import("./HomepageClient"), {
  ssr: false,
  loading: () => <main className="homepage-draft" />,
});

export default function Home() {
  return <HomepageClient />;
}
