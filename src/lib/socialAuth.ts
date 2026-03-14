import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

// Initialize social login — call once on app startup
export async function initSocialLogin() {
  if (!Capacitor.isNativePlatform()) return;

  await SocialLogin.initialize({
    apple: {
      clientId: 'com.trainlab.app',
    },
    google: {
      webClientId: '829987695870-57jofk42cgaj01a093m4s9jq3essum22.apps.googleusercontent.com',
      iOSClientId: '829987695870-s976sqieq6mfe4n0pj2hfk9u2bpilukf.apps.googleusercontent.com',
    },
  });
}

function generateNonce(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signInWithApple() {
  const rawNonce = generateNonce();
  const hashedNonce = await sha256(rawNonce);

  console.log('[APPLE AUTH] Starting login with hashed nonce:', hashedNonce);

  const result = await SocialLogin.login({
    provider: 'apple',
    options: {
      scopes: ['email', 'name'],
      nonce: hashedNonce,
    },
  });

  console.log('[APPLE AUTH] Full result:', JSON.stringify(result, null, 2));
  console.log('[APPLE AUTH] result.result:', JSON.stringify((result as any)?.result, null, 2));

  // The token might be at a different path depending on plugin version
  const idToken = (result as any)?.result?.identityToken
    || (result as any)?.result?.idToken
    || (result as any)?.result?.credential?.identityToken
    || (result as any)?.result?.response?.identityToken;

  console.log('[APPLE AUTH] Found token:', idToken ? 'yes (' + (idToken as string).substring(0, 20) + '...)' : 'NO');

  if (!idToken) {
    throw new Error('No identity token received from Apple. Result keys: ' + Object.keys((result as any)?.result || {}).join(', '));
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    nonce: rawNonce,
  });

  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const result = await SocialLogin.login({
    provider: 'google',
    options: {
      scopes: ['email', 'profile'],
    },
  });

  const token = (result as any)?.result?.idToken;
  if (!token) throw new Error('No ID token received from Google');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token,
  });

  if (error) throw error;
  return data;
}
