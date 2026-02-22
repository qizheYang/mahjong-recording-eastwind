/**
 * SMS OTP service using Twilio.
 * When Twilio credentials are not configured, OTP is skipped entirely —
 * users are registered as verified immediately.
 */

import Twilio from 'twilio';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const twilioEnabled = !!(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
const client = twilioEnabled ? Twilio(ACCOUNT_SID, AUTH_TOKEN) : null;

// In-memory OTP store: phone → { code, expiresAt }
const otpStore = new Map<string, { code: string; expiresAt: number }>();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
}

/** Whether SMS verification is available */
export function isOtpEnabled(): boolean {
  return twilioEnabled;
}

export async function sendOtp(phone: string): Promise<{ sent: boolean }> {
  if (!client || !FROM_NUMBER) {
    return { sent: false };
  }

  const code = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(phone, { code, expiresAt });

  try {
    await client.messages.create({
      body: `Your verification code is: ${code}`,
      from: FROM_NUMBER,
      to: phone,
    });
    return { sent: true };
  } catch (err) {
    console.error('[SMS] Failed to send OTP:', err);
    return { sent: false };
  }
}

export function verifyOtp(phone: string, code: string): boolean {
  const entry = otpStore.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return false;
  }
  if (entry.code !== code) return false;
  otpStore.delete(phone);
  return true;
}

// Cleanup expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of otpStore) {
    if (now > entry.expiresAt) {
      otpStore.delete(phone);
    }
  }
}, 60_000);
