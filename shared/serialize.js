// JSON round trip that keeps BigInt and Map (used by the mock server to persist its world).
export function serialize(value) {
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === 'bigint') return { $b: v.toString() };
    if (v instanceof Map) return { $m: [...v.entries()] };
    return v;
  });
}
export function deserialize(text) {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object') {
      if ('$b' in v) return BigInt(v.$b);
      if ('$m' in v) return new Map(v.$m);
    }
    return v;
  });
}
