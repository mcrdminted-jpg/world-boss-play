// Gem purchases through the store on the phone (Capacitor plugin @capgo/native-purchases): Apple In-App Purchase on
// iPhone, Google Play Billing on Android. The phone only starts the purchase. Our server asks Apple or Google about it
// and credits the gems (api.iapVerify / api.iapVerifyGoogle). The purchase is finished on the phone only after the server
// answers, so a crash never loses gems: unfinished ones are picked up by recoverPurchases next time the Store opens.
const C = window.Capacitor;
const PLATFORM = C && C.getPlatform ? C.getPlatform() : 'web';
const NATIVE = !!(C && C.isNativePlatform && C.isNativePlatform());
const call = (method, options) => C.nativePromise('NativePurchases', method, options || {});

// Must match App Store Connect, Play Console (same IDs on both) and the wb_gem_products table.
export const GEM_PACKS = [
  { id: 'com.atlasforeverstudios.worldboss.gems1', gems: 1, price: '$0.99' },
  { id: 'com.atlasforeverstudios.worldboss.gems6', gems: 6, price: '$4.99' },
  { id: 'com.atlasforeverstudios.worldboss.gems75', gems: 75, price: '$49.99', tag: '+50%' },
  { id: 'com.atlasforeverstudios.worldboss.gems175', gems: 175, price: '$99.99', tag: 'Best value' },
];
const IDS = GEM_PACKS.map((p) => p.id);
const ANDROID = PLATFORM === 'android';

export const iapSupported = () => NATIVE && (PLATFORM === 'ios' || ANDROID) && !!(C && C.nativePromise);

// Real prices in the player's own currency, straight from the store. Falls back to the US price.
export async function loadPrices() {
  const out = {};
  if (!iapSupported()) return out;
  try {
    const { products } = await call('getProducts', { productIdentifiers: IDS, productType: 'inapp' });
    for (const p of products || []) out[p.identifier] = p.priceString;
  } catch { /* store not reachable: keep fallback prices */ }
  return out;
}

// Final answers: the purchase can never pay out, so close it instead of retrying forever.
// Network or server trouble leaves it open so the next visit retries.
const FINAL = ['refunded', 'wrong_app', 'unknown_product', 'not_your_purchase'];
async function settle(api, t) {
  if (ANDROID) {
    const r = await api.iapVerifyGoogle(String(t.purchaseToken), String(t.productIdentifier));
    // Consume after the server credits, so the pack can be bought again. The server consumes too; either is enough.
    if (r && r.ok) { try { await call('consumePurchase', { purchaseToken: String(t.purchaseToken) }); } catch { /* server consumed it */ } }
    return r;
  }
  const r = await api.iapVerify(String(t.transactionId));
  const final = r && (r.ok || FINAL.includes(r.error));
  if (final) { try { await call('acknowledgePurchase', { purchaseToken: String(t.transactionId) }); } catch { /* already finished */ } }
  return r;
}

// Returns { ok, gems, credited } or { ok:false, error }. error 'cancelled' means the player backed out.
export async function buyGems(api, productId) {
  if (!iapSupported()) return { ok: false, error: 'not_supported' };
  const uid = await api.userId();
  let t;
  try {
    // isConsumable false: we consume ourselves, only after our server has credited the gems.
    t = await call('purchaseProduct', { productIdentifier: productId, productType: 'inapp', quantity: 1, appAccountToken: uid, isConsumable: false, autoAcknowledgePurchases: false });
  } catch (e) {
    const m = String((e && e.message) || e);
    return { ok: false, error: /cancel/i.test(m) ? 'cancelled' : /pending/i.test(m) ? 'pending' : m };
  }
  if (!t || !(ANDROID ? t.purchaseToken : t.transactionId)) return { ok: false, error: 'no_transaction' };
  if (ANDROID && t.purchaseState === '0') return { ok: false, error: 'pending' };
  try { return await settle(api, t); }
  catch (e) { return { ok: false, error: 'verify_failed', detail: String((e && e.message) || e) }; }
}

// Paid-for purchases that never got credited (app closed mid-purchase, no signal). Safe to call any time.
export async function recoverPurchases(api) {
  if (!iapSupported()) return 0;
  let n = 0;
  try {
    const { purchases } = await call('getPurchases', { productType: 'inapp' });
    for (const p of purchases || []) {
      if (!IDS.includes(p.productIdentifier)) continue;
      // Android lists only purchases not yet consumed; skip pending ones (purchaseState "0") until they are paid.
      if (ANDROID ? (!p.purchaseToken || p.purchaseState !== '1') : !p.transactionId) continue;
      try { const r = await settle(api, p); if (r && r.ok && r.credited) n += r.gems; } catch { /* retry next time */ }
    }
  } catch { /* ignore */ }
  return n;
}
