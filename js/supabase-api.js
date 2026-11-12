// Talks to the Supabase project over plain fetch (no SDK). Anonymous sign-in gives every device an account.
// Requires "Allow anonymous sign-ins" enabled in the project's Auth settings.
export function createSupabaseApi(url, key) {
  const SKEY = 'wb-session';
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { session = null; }

  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch { /* private mode */ } };

  async function auth(path, body) {
    const r = await tfetch(`${url}/auth/v1/${path}`, {
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

  // Every server call gives up after 15 seconds, so a dropped connection (switching Wi-Fi, VPN, weak signal)
  // shows "Connection problem" instead of leaving the game stuck mid-attack forever.
  async function tfetch(u, opts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try { return await fetch(u, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
  }

  async function rpc(fn, args, retried = false) {
    await ensure();
    const r = await tfetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    if (r.status === 401 && !retried) { session = null; try { localStorage.removeItem(SKEY); } catch { /* ignore */ } return rpc(fn, args, true); }
    if (!r.ok) throw new Error(`rpc_${fn}_${r.status}`);
    return r.json();
  }

  // Gem purchase check: our iap-apple Edge Function asks Apple, then credits gems.
  async function fn(name, body) {
    await ensure();
    const r = await tfetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error(`fn_${name}_${r.status}`);
    return j;
  }
  async function userId() {
    await ensure();
    if (session.user?.id) return session.user.id;
    return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
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
    setClass: (c) => rpc('wb_set_class', { p_class: c }),
    useAbility: () => rpc('wb_use_ability', {}),
    buyTech: (n) => rpc('wb_buy_tech', { p_node: n }),
    adReward: (k) => rpc('wb_ad_reward', { p_kind: k }),
    dailyClaim: () => rpc('wb_daily_claim'),
    gear: () => rpc('wb_gear'),
    gearEquip: (id, on) => rpc('wb_gear_equip', { p_item: id, p_on: on }),
    gearMerge: (keep, feed) => rpc('wb_gear_merge', { p_keep: keep, p_feed: feed }),
    gearRecycle: (ids) => rpc('wb_gear_recycle', { p_items: ids }),
    gearCrate: (tier) => rpc('wb_gear_crate', { p_tier: tier }),
    gearReroll: (id, what) => rpc('wb_gear_reroll', { p_item: id, p_what: what }),
    iapVerify: (transactionId) => fn('iap-apple', { transactionId }),
    userId,
    deleteMe: async () => { const r = await rpc('wb_delete_me', {}); session = null; try { localStorage.removeItem(SKEY); } catch { /* ignore */ } return r; },
  };
}
