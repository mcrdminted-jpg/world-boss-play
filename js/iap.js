// Gem purchases through Apple In-App Purchase (Capacitor plugin @capgo/native-purchases), iPhone app only.
// The phone only starts the purchase. Our server asks Apple about it and credits the gems (api.iapVerify),
// and the purchase is marked finished on the phone only after the server answers, so a crash never loses gems.
const C = window.Capacitor;
const PLATFORM = C && C.getPlatform ? C.getPlatform() : 'web';
const NATIVE = !!(C && C.isNativePlatform && C.isNativePlatform());
const call = (method, options) => C.nativePromise('NativePurchases', method, options || {});

// Must match App Store Connect and the wb_gem_products table.
export const GEM_PACKS = [
  { id: 'com.atlasforeverstudios.worldboss.gems1', gems: 1, price: '$0.99' },
  { id: 'com.atlasforeverstudios.worldboss.gems5', gems: 5, price: '$3.99' },
  { id: 'com.atlasforeverstudios.worldboss.gems10', gems: 10, price: '$6.99' },
];
const IDS = GEM_PACKS.map((p) => p.id);

export const iapSupported = () => NATIVE && PLATFORM === 'ios' && !!(C && C.nativePromise);

// Real prices in the player's own currency, straight from the App Store. Falls back to the US price.
export async function loadPrices() {
  const out = {};
  if (!iapSupported()) return out;
  try {
    const { products } = await call('getProducts', { productIdentifiers: IDS, productType: 'inapp' });
    for (const p of products || []) out[p.identifier] = p.priceString;
  } catch { /* store not reachable: keep fallback prices */ }
  return out;
}

async function settle(api, transactionId) {
  const r = await api.iapVerify(String(transactionId));
  // Finish on success, and also when the server says this purchase can never pay out (refunded, not ours):
  // otherwise it would be retried forever. Network or server trouble leaves it open so the next visit retries.
  const final = r && (r.ok || ['refunded', 'wrong_app', 'unknown_product', 'not_your_purchase'].includes(r.error));
  if (final) { try { await call('acknowledgePurchase', { purchaseToken: String(transactionId) }); } catch { /* already finished */ } }
  return r;
}

// Returns { ok, gems, credited } or { ok:false, error }. error 'cancelled' means the player backed out.
export async function buyGems(api, productId) {
  if (!iapSupported()) return { ok: false, error: 'not_supported' };
  const uid = await api.userId();
  let t;
  try {
    t = await call('purchaseProduct', { productIdentifier: productId, productType: 'inapp', quantity: 1, appAccountToken: uid, autoAcknowledgePurchases: false });
  } catch (e) {
    const m = String((e && e.message) || e);
    return { ok: false, error: /cancel/i.test(m) ? 'cancelled' : /pending/i.test(m) ? 'pending' : m };
  }
  if (!t || !t.transactionId) return { ok: false, error: 'no_transaction' };
  try { return await settle(api, t.transactionId); }
  catch (e) { return { ok: false, error: 'verify_failed', detail: String((e && e.message) || e) }; }
}

// Paid-for purchases that never got credited (app closed mid-purchase, no signal). Safe to call any time.
export async function recoverPurchases(api) {
  if (!iapSupported()) return 0;
  let n = 0;
  try {
    const { purchases } = await call('getPurchases', { productType: 'inapp' });
    for (const p of purchases || []) {
      if (!IDS.includes(p.productIdentifier) || !p.transactionId) continue;
      try { const r = await settle(api, p.transactionId); if (r && r.ok && r.credited) n += r.gems; } catch { /* retry next time */ }
    }
  } catch { /* ignore */ }
  return n;
}
