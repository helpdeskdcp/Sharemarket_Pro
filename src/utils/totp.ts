import * as OTPAuth from 'otpauth';

/**
 * Clean Base32 Secret by trimming spaces and converting to uppercase
 */
export function sanitizeBase32(secret: string): string {
  return secret.replace(/\s+/g, '').toUpperCase();
}

/**
 * Validates if string is a valid Base32 secret
 */
export function isValidBase32(secret: string): boolean {
  const clean = sanitizeBase32(secret);
  return clean.length >= 8 && /^[A-Z2-7]+=*$/.test(clean);
}

/**
 * Generates standard RFC 6238 TOTP (6-digit, 30s period, SHA1)
 * Exactly mirrors Python pyotp.TOTP used in Angel One SmartAPI scripts
 */
export function generateAngelOneTotp(base32Secret: string): {
  code: string;
  secondsRemaining: number;
  period: number;
} {
  const clean = sanitizeBase32(base32Secret);
  const period = 30;
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = period - (now % period);

  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'AngelOne',
      label: 'SmartAPI',
      algorithm: 'SHA1',
      digits: 6,
      period,
      secret: OTPAuth.Secret.fromBase32(clean),
    });

    const code = totp.generate();
    return { code, secondsRemaining, period };
  } catch (err) {
    // Fallback if secret is slightly malformed during typing
    return { code: '000000', secondsRemaining, period };
  }
}

/**
 * Generates a random valid Base32 secret for Angel One SmartAPI testing
 */
export function generateRandomSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}
