// Talks to the Supabase project over plain fetch (no SDK). Anonymous sign-in gives every device an account.
// Requires "Allow anonymous sign-ins" enabled in the project's Auth settings.
export function createSupabaseApi(url, key) {
  const SKEY = 'wb-session';
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { session = null; }

  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch { /* private mode */ } };

  async function auth(path, body) {
    const r = await fetch(`${url}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`auth_${r.status}`);
    return r.json();
  }

  async function ensure() {
    if (session && session.expires_at * 1000 - Date.now() > 60000) return;
    if (session?.refresh_token) {
      try { session = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token }); save(); return; }
      catch { session = null; }
    }
    session = await auth('signup', {});
    save();
  }

  async function rpc(fn, args, retried = false) {
    await ensure();
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    if (r.status === 401 && !retried) { session = null; try { localStorage.removeItem(SKEY); } catch { /* ignore */ } return rpc(fn, args, true); }
    if (!r.ok) throw new Error(`rpc_${fn}_${r.status}`);
    return r.json();
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
  return {
    mode: 'supabase',
    state: () => rpc('wb_state', {}),
    attack: () => rpc('wb_attack', { p_key: uid() }),
    buy: (k) => rpc('wb_buy_upgrade', { p_key: k }),
    claim: () => rpc('wb_claim_rewards', {}),
    setProfile: (p) => rpc('wb_set_profile', { p_name: p.name ?? null, p_country: p.country ?? null, p_state: p.state ?? null, p_zip: p.zip ?? null }),
    leaderboard: (scope, period) => rpc('wb_leaderboard', { p_scope: scope, p_period: period }),
    setBadge: (b) => rpc('wb_set_badge', { p_badge: b }),
    card: (pid) => rpc('wb_player_card', { p_pid: pid }),
  };
}
