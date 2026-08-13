import { createHash, randomBytes } from "node:crypto";

export type GuestEventStatus = "invited" | "going" | "not_going" | "revoked";

export function createEventInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashEventInvitationToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}
