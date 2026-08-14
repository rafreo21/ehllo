import { GuestEventInvitation } from "./GuestEventInvitation";
import "./event-invitation.css";

export default async function GuestEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestEventInvitation token={token} />;
}
