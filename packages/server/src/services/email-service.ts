/**
 * Email OTP service using Resend.
 * When RESEND_API_KEY is not configured, OTP is skipped entirely —
 * users are registered as verified immediately.
 */

import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

const resendEnabled = !!API_KEY;
const resend = resendEnabled ? new Resend(API_KEY) : null;

// In-memory OTP store: email → { code, expiresAt }
const otpStore = new Map<string, { code: string; expiresAt: number }>();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
}

/** Whether email verification is available */
export function isOtpEnabled(): boolean {
  return resendEnabled;
}

export async function sendOtp(email: string): Promise<{ sent: boolean }> {
  if (!resend) {
    return { sent: false };
  }

  const code = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(email, { code, expiresAt });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: '麻雀記録 - Verification Code',
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 5 minutes.</p>`,
    });
    return { sent: true };
  } catch (err) {
    console.error('[Email] Failed to send OTP:', err);
    return { sent: false };
  }
}

export function verifyOtp(email: string, code: string): boolean {
  const entry = otpStore.get(email);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email);
    return false;
  }
  if (entry.code !== code) return false;
  otpStore.delete(email);
  return true;
}

// Cleanup expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of otpStore) {
    if (now > entry.expiresAt) {
      otpStore.delete(email);
    }
  }
}, 60_000);
