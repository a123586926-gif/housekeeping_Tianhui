// Validation used by the server-side cleaner management endpoints.
// The UI continues to select an account and enter a PIN; credentials are never returned.
export function validCleanerName(value) {
  if (typeof value !== "string") return false;
  const name = value.trim();
  return name.length >= 1 && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name);
}

// Keep existing PIN login format (digits) but disallow the weakest legacy PINs.
// New/rotated PINs have to meet this policy; existing users need migration.
export function validNewPin(value) {
  return typeof value === "string" &&
    /^\d{6,12}$/.test(value) &&
    !/^(\d)\1+$/.test(value) &&
    !["123456", "12345678", "123456789", "1234567890", "012345", "000000"].includes(value);
}
export function parseCleanerCreate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !validCleanerName(body.name) || !validNewPin(body.pin)) return null;
  return { name: body.name.trim(), pin: body.pin };
}
export function parseCleanerUpdate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !validCleanerName(body.name)) return null;
  // Omitted PIN means keep existing PIN; it must never be retrieved from the DB into a form.
  if (body.pin !== undefined && !validNewPin(body.pin)) return null;
  return { name: body.name.trim(), pin: body.pin ?? null };
}
