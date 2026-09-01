import crypto from 'crypto';

// Tanpa karakter ambigu: 0, O, 1, I, L.
const REGISTRATION_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TOKEN_LENGTH = 6;

export function generateRegistrationToken(length = TOKEN_LENGTH): string {
  let token = '';
  for (let i = 0; i < length; i++) {
    token += REGISTRATION_ALPHABET[crypto.randomInt(0, REGISTRATION_ALPHABET.length)];
  }
  return token;
}

export function formatRegistrationNumber(visitDate: string, token: string): string {
  return `REG-${visitDate.replace(/-/g, '')}-${token}`;
}
