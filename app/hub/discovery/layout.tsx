import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer discovery workspace — Ehllo",
  description: "Internal evidence workspace for testing Ehllo's customer, problem, and outcome hypotheses.",
};

export default function DiscoveryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
