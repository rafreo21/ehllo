import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer discovery workspace — ehllo",
  description: "Internal evidence workspace for testing ehllo's customer, problem, and outcome hypotheses.",
};

export default function DiscoveryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
