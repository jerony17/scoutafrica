// A player's own private fields (email, date_of_birth) never come from a
// normal player query - PLAYER_PUBLIC_COLUMNS excludes them. The owner (or
// an admin) reads them through get_player_private(p_player_id), which
// returns one row for them and no rows for anyone else.

export interface PlayerPrivateFields {
  email: string | null;
  date_of_birth: string | null;
}

// null = could not load (RPC error, no row, or the function is not deployed
// yet). Callers must then leave those fields out of any save, so stored
// values are never overwritten with null.
export function readPlayerPrivate(result: { data: unknown; error: unknown }): PlayerPrivateFields | null {
  if (result.error) return null;
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (typeof row !== "object" || row === null) return null;
  const { email, date_of_birth } = row as Record<string, unknown>;
  return {
    email: typeof email === "string" ? email : null,
    date_of_birth: typeof date_of_birth === "string" ? date_of_birth : null,
  };
}
