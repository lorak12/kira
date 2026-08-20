import type { KiraConfig } from '../config/schema'

type GoogleService = KiraConfig['google']['enabledServices'][number]

// One OAuth scope per service -- kept minimal (not the broadest variant
// Google offers) except where the narrower scope can't do what the tool
// needs: gmail.modify (not just gmail.readonly) because send_email needs
// write access, drive.file (not the full drive.readonly) so Kira only ever
// sees files it created or the user explicitly opened with it.
const SCOPE_BY_SERVICE: Record<GoogleService, string> = {
  calendar: 'https://www.googleapis.com/auth/calendar',
  gmail: 'https://www.googleapis.com/auth/gmail.modify',
  drive: 'https://www.googleapis.com/auth/drive.file',
  docs: 'https://www.googleapis.com/auth/documents',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  slides: 'https://www.googleapis.com/auth/presentations'
}

/**
 * Requested OAuth scopes track google.enabledServices exactly -- enabling a
 * service later means re-running link_google_account to pick up the new
 * scope (prompt=consent in oauthClient.ts makes that a clean re-grant, not
 * just a silent no-op).
 */
export function scopesForConfig(config: KiraConfig): string[] {
  return config.google.enabledServices.map((service) => SCOPE_BY_SERVICE[service])
}
