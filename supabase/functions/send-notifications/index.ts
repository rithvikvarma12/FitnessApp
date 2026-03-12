import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const serviceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT')!;

const supabase = createClient(supabaseUrl, supabaseKey);

let cachedToken: { token: string; expires: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }

  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const encodeB64Url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = encodeB64Url({ alg: 'RS256', typ: 'JWT' });
  const payloadB64 = encodeB64Url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });

  const signingInput = `${headerB64}.${payloadB64}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const { access_token, expires_in } = await tokenRes.json();
  cachedToken = { token: access_token, expires: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

async function sendFCM(token: string, title: string, body: string) {
  const sa = JSON.parse(serviceAccountJson);
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { type: 'trainlab' },
        },
      }),
    }
  );
  return res.json();
}

Deno.serve(async (req) => {
  const { type } = await req.json();
  const today = new Date().toISOString().split('T')[0];

  const { data: users } = await supabase
    .from('user_profiles')
    .select('auth_id, fcm_token, name')
    .not('fcm_token', 'is', null);

  if (!users) return new Response('No users', { status: 200 });

  for (const user of users) {
    if (!user.fcm_token) continue;

    if (type === 'workout_reminder') {
      const { data: logs } = await supabase
        .from('week_plans')
        .select('days')
        .eq('auth_id', user.auth_id)
        .order('created_at', { ascending: false })
        .limit(1);

      const days = logs?.[0]?.days || [];
      const todayLogged = days.some((d: any) =>
        d.date === today && d.completed === true
      );

      if (!todayLogged) {
        await sendFCM(
          user.fcm_token,
          "Time to train 💪",
          "You haven't logged today's workout yet. Keep the streak alive!"
        );
      }
    }

    if (type === 'streak_warning') {
      const { data: plans } = await supabase
        .from('week_plans')
        .select('days')
        .eq('auth_id', user.auth_id)
        .order('created_at', { ascending: false })
        .limit(2);

      const allDays = plans?.flatMap((p: any) => p.days || []) || [];
      const completedDays = allDays
        .filter((d: any) => d.completed)
        .map((d: any) => d.date)
        .sort()
        .reverse();

      if (completedDays.length > 0) {
        const lastWorkout = new Date(completedDays[0]);
        const diffDays = Math.floor(
          (new Date().getTime() - lastWorkout.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays >= 2) {
          await sendFCM(
            user.fcm_token,
            "Don't break the streak 🔥",
            `It's been ${diffDays} days since your last workout. Get back on track!`
          );
        }
      }
    }

    if (type === 'week_complete') {
      await sendFCM(
        user.fcm_token,
        "Week Complete! 🏆",
        "Amazing work finishing the week. Ready to generate next week's plan?"
      );
    }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
