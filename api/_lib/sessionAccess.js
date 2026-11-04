/**
 * Pure, fail-closed session and login-result verification.
 * Does not read tokens, PINs, cookies or secrets.
 */
export function verifiedLoginIdentity(data, requestedUserId) {
  return typeof requestedUserId === "string" &&
    /^(admin|cleaner-[1-9][0-9]*)$/.test(requestedUserId) &&
    Array.isArray(data) && data.length === 1 &&
    data[0] && typeof data[0] === "object" &&
    data[0].verified_user_id === requestedUserId;
}

export function verifiedSessionPrincipal(sessionRow, accountRow, at=Date.now()) {
  if (!sessionRow || !accountRow || !Number.isFinite(at)) return null;
  if (sessionRow.revoked_at !== null && sessionRow.revoked_at !== undefined) return null;
  if (typeof sessionRow.user_id !== "string" || sessionRow.user_id !== accountRow.user_id) return null;
  const expiry = typeof sessionRow.expires_at === "string"
    ? Date.parse(sessionRow.expires_at) : NaN;
  if (!Number.isFinite(expiry) || expiry <= at) return null;
  if (accountRow.active !== true) return null;
  if (accountRow.role !== "admin" && accountRow.role !== "cleaner") return null;
  if (accountRow.role === "admin" && accountRow.user_id !== "admin") return null;
  if (accountRow.role === "cleaner" &&
      !/^cleaner-[1-9][0-9]*$/.test(accountRow.user_id)) return null;
  if (typeof accountRow.display_name !== "string" ||
      accountRow.display_name.trim().length === 0) return null;
  return {
    user: {
      id: accountRow.user_id,
      name: accountRow.display_name,
      role: accountRow.role,
    },
    expiresAt:sessionRow.expires_at,
  };
}
