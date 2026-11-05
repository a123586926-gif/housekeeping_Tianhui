/** Fail-closed database routing: QA cannot use production data, and production
 * cannot use QA data. Production requires a separately configured release flag.
 * Never set the release flag for Preview deployments.
 */
export const QA_PROJECT_REF = "zhvrgluwoookxaglfjdw";
export const PRODUCTION_PROJECT_REF = "xmdznhkkvtohwxkahisr";

export function assertQaEnvironment({vercelEnv,supabaseUrl,releaseReady}={}) {
  let parsed;
  try { parsed = new URL(supabaseUrl); }
  catch { throw new Error("Invalid Supabase URL"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash)
    throw new Error("Unexpected Supabase URL components");
  const hostname=parsed.hostname.toLowerCase();
  if (vercelEnv === "production") {
    if (releaseReady !== "enabled")
      throw new Error("Production API requires explicit release readiness");
    if (hostname !== `${PRODUCTION_PROJECT_REF}.supabase.co`)
      throw new Error("Production API database mismatch");
    return true;
  }
  if (releaseReady === "enabled")
    throw new Error("Production release flag is forbidden outside production");
  if (hostname !== `${QA_PROJECT_REF}.supabase.co`)
    throw new Error("QA API is not connected to the allowlisted test Supabase project");
  return true;
}
