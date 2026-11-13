// Rewarded ads through Google AdMob (Capacitor plugin @capacitor-community/admob), native app only.
// The game server grants the reward (wb_ad_reward) and enforces the daily caps; this file only plays the ad.
const C = window.Capacitor;
const PLATFORM = C && C.getPlatform ? C.getPlatform() : 'web';
const NATIVE = !!(C && C.isNativePlatform && C.isNativePlatform());

// Live rewarded ad units (AdMob publisher pub-5603864323887647). The App IDs live in ios/App/App/Info.plist
// (iOS app ~8576744922) and android/app/src/main/AndroidManifest.xml (Android app ~6408217904, added 2026-11-12).
const UNITS = { ios: 'ca-app-pub-5603864323887647/3239998622', android: 'ca-app-pub-5603864323887647/6913670278' };
// Google's public test units, used when the page is opened with ?testads=1 or in a debug build.
const TEST_UNITS = { ios: 'ca-app-pub-3940256099942544/1712485313', android: 'ca-app-pub-3940256099942544/5224354917' };
// LIVE for the store release (2026-11-12). Watching your own live ads counts as invalid traffic, so every phone the
// team plays on must be added in AdMob > Settings > Test devices: AdMob then sends that phone test ads automatically.
// Setting this to false makes every phone show Google's test ads (they pay nothing): never ship a store build that way.
const LIVE_ADS = true;
const TESTING = !LIVE_ADS || /[?&]testads=1/.test(location.search);

const unit = () => (TESTING ? TEST_UNITS[PLATFORM] : UNITS[PLATFORM]) || null;
// The game ships as plain files with no bundler, so @capacitor/core's registerPlugin is not on the page.
// The native bridge itself (nativePromise / addListener) is always there in the app, and is all we need.
export const adsSupported = () => NATIVE && !!unit() && !!(C && (C.registerPlugin || C.nativePromise));

let plugin = null, ready = null;
function admob() {
  if (plugin) return plugin;
  if (C.registerPlugin) { plugin = C.registerPlugin('AdMob'); return plugin; }
  plugin = new Proxy({}, { get: (_t, method) => {
    if (method === 'then') return undefined; // not a promise
    if (method === 'addListener') return (eventName, cb) => C.addListener('AdMob', eventName, cb);
    return (options) => C.nativePromise('AdMob', method, options || {});
  } });
  return plugin;
}

// First call: Google consent form where the law requires it (EU/UK), then Apple's tracking prompt, then SDK init.
function init() {
  if (ready) return ready;
  ready = (async () => {
    const a = admob();
    try {
      const info = await a.requestConsentInfo();
      if (info && info.status === 'REQUIRED' && info.isConsentFormAvailable) await a.showConsentForm();
    } catch { /* consent service unreachable: continue, the SDK falls back to non-personalized */ }
    if (PLATFORM === 'ios') {
      try {
        const t = await a.trackingAuthorizationStatus();
        if (t && t.status === 'notDetermined') await a.requestTrackingAuthorization();
      } catch { /* older iOS: no prompt needed */ }
    }
    await a.initialize({ initializeForTesting: TESTING });
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

// Plays one rewarded ad. Resolves true only if the player watched it to the reward point.
export async function playRewarded() {
  if (!adsSupported()) return false;
  await init();
  const a = admob();
  let rewarded = false;
  const subs = [];
  const done = new Promise((resolve) => {
    subs.push(a.addListener('onRewardedVideoAdReward', () => { rewarded = true; }));
    subs.push(a.addListener('onRewardedVideoAdDismissed', () => resolve()));
    subs.push(a.addListener('onRewardedVideoAdFailedToShow', () => resolve()));
  });
  // Google's real reason for a failed load arrives as an event, not in the rejection ("Loading failed"), so catch it.
  let why = '';
  subs.push(a.addListener('onRewardedVideoAdFailedToLoad', (info) => { why = (info && (info.message || info.code)) || ''; }));
  try {
    // One automatic retry: the first request right after the ad SDK starts, or on a shaky connection, often fails.
    let loaded = false;
    for (let tryNo = 0; tryNo < 2 && !loaded; tryNo++) {
      if (tryNo) await new Promise((r) => setTimeout(r, 1500));
      try { await a.prepareRewardVideoAd({ adId: unit(), isTesting: TESTING }); loaded = true; }
      catch (e) { if (!why) why = (e && (e.message || e.code)) || String(e); }
    }
    if (!loaded) throw new Error(why ? `Google says: ${why}` : 'Ad failed to load.');
    const item = await a.showRewardVideoAd();
    if (item && (item.amount !== undefined || item.type)) rewarded = true;
    await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
  } finally {
    for (const s of subs) { try { (await s).remove(); } catch { /* ignore */ } }
  }
  return rewarded;
}
