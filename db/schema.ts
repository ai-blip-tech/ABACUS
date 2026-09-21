// The production schema is initialised from lib/auth.ts so the first deployed
// request can safely provision the Site-owned D1 database.  The SQL migration
// is kept alongside the source in drizzle/0000_accounts.sql.
export const schemaVersion = 3;
