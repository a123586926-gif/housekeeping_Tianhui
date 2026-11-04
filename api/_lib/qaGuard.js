/**
 * Intentional staging-only deployment gate. This branch must never connect its
 * service-role client to a production Supabase project or run as Vercel Production.
 * Remove only as part of a separately reviewed production migration.
 */
export const QA_PROJECT_REF = "zhvrgluwoookxaglfjdw";

export function assertQaEnvironment({vercelEnv,supabaseUrl}) {
  if (vercelEnv === "production") {
    throw new Error("QA-only API cannot run in Vercel Production");
  }
  let hostname;
  try {
    hostname = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("Invalid QA Supabase URL");
  }
  if (hostname !== `${QA_PROJECT_REF}.supabase.co`) {
    throw new Error("QA API is not connected to the allowlisted test Supabase project");
  }
  return true;
}
