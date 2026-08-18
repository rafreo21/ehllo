export type IntegrationProvider = "google" | "microsoft";

export type ConnectedAccountStatus = {
  google: {
    connected: boolean;
    /** A row exists but its refresh token no longer works - the UI should offer "Reconnect", not "Disconnect". */
    needsReconnect: boolean;
    email: string;
    scopes: string[];
    capabilities: {
      gmail: boolean;
      calendar: boolean;
      drive: boolean;
    };
  };
  microsoft: {
    connected: boolean;
    needsReconnect: boolean;
    email: string;
    scopes: string[];
    capabilities: {
      outlook: boolean;
      calendar: boolean;
      onedrive: boolean;
    };
  };
  configured: {
    google: boolean;
    microsoft: boolean;
  };
};

export type ConnectedAccountRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: IntegrationProvider;
  account_email: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  created_at: string;
  updated_at: string;
};

export const GOOGLE_INTEGRATION_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const MICROSOFT_INTEGRATION_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Files.ReadWrite.AppFolder",
];

export function emptyConnectedAccountStatus(): ConnectedAccountStatus {
  return {
    google: {
      connected: false,
      needsReconnect: false,
      email: "",
      scopes: [],
      capabilities: { gmail: false, calendar: false, drive: false },
    },
    microsoft: {
      connected: false,
      needsReconnect: false,
      email: "",
      scopes: [],
      capabilities: { outlook: false, calendar: false, onedrive: false },
    },
    configured: { google: false, microsoft: false },
  };
}
