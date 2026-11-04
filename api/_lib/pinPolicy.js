/**
 * Validate new numeric PINs before provisioning or PIN changes.
 * Existing PIN verification and account lockout remain unchanged.
 */
export function pinIsStrong(value) {
  if (typeof value !== "string" || !/^[0-9]{8,32}$/.test(value)) return false;
  if (/^([0-9]{1,4})\1+$/.test(value)) return false;
  const digits = [...value].map(Number);
  if (digits.every((digit, index) => index === 0 ||
    digit === (digits[index - 1] + 1) % 10)) return false;
  if (digits.every((digit, index) => index === 0 ||
    digit === (digits[index - 1] + 9) % 10)) return false;
  return true;
}
