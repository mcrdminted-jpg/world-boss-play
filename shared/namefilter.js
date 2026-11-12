// Player name rules. The name is the ONLY text other players ever see, so it must not carry contact info,
// social handles or promotion. Strict on purpose: false positives just mean "pick another name".
// The same rules run on the server (wb_name_check, last updated in 0019_name_filter.sql). Keep them identical.

export const NAME_MIN = 3, NAME_MAX = 16, NAME_MAX_DIGITS = 4;

// Anywhere in the name (checked on the letters-only form AND the number-for-letter form).
export const BLOCK_ANYWHERE = [
  // platforms and contact
  'snap', 'insta', 'gram', 'tiktok', 'tikt', 'discord', 'disc0rd', 'youtube', 'youtu', 'twitch', 'telegram', 'whatsapp',
  'kik', 'facebook', 'twitter', 'threads', 'reddit', 'onlyfan', 'fansly', 'patreon', 'linktree', 'linkin', 'roblox',
  'venmo', 'cashapp', 'paypal', 'zelle', 'gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'email', 'http', 'www',
  'dotcom', 'addme', 'followme', 'follow', 'subscribe', 'dmme', 'textme', 'callme', 'phone', 'number', 'whatsap',
  // profanity and slurs (basic list, kids play this)
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'porn', 'sex', 'nigg', 'nigga', 'fag', 'slut',
  'whore', 'rape', 'nazi', 'hitler', 'retard', 'penis', 'vagina', 'boob', 'tits', 'anal', 'cum', 'nude',
  'asshole', 'bastard', 'piss', 'wank', 'twat', 'dildo', 'jizz', 'horny', 'pedo', 'molest', 'negro', 'chink', 'kike',
  'tranny', 'dyke', 'beaner', 'wetback', 'jihad', 'terroris',
  // religion: no deities, prophets or holy figures on a public leaderboard (the bare word "god" is in BLOCK_EXACT, so Godly and Godzilla stay fine)
  'jesus', 'jehovah', 'yahweh', 'allah', 'muhammad', 'muhammed', 'mohammed', 'mohammad', 'mohamed', 'prophet',
  'buddha', 'krishna', 'vishnu', 'shiva', 'satan', 'lucifer', 'messiah', 'antichrist', 'quran', 'koran', 'bible',
  // politics: no politicians, parties or slogans
  'trump', 'biden', 'kamala', 'obama', 'clinton', 'hillary', 'desantis', 'pelosi', 'putin', 'zelensk', 'netanyahu',
  'stalin', 'mussolini', 'maga', 'democrat', 'republican', 'antifa', 'kkk', 'taliban', 'hamas', 'hezbollah', 'alqaeda',
  'letsgobrandon', 'fjb', 'liberal', 'conservativ', 'communis', 'fascis', 'socialis',
];
// The whole name (letters only) may not be exactly one of these. Too common inside normal words to block anywhere.
export const BLOCK_EXACT = ['god', 'christ', 'kys', 'isis', 'vance', 'harris', 'bush', 'pence', 'musk', 'blm', 'gop', 'dnc', 'pope'];
// Only as the first or last letters (short tags that are too common inside normal words).
export const BLOCK_EDGE = ['ig', 'sc', 'yt', 'fb', 'ttv', 'tt', 'dm', 'of', 'tg', 'wa', 'ph', 'tel', 'mail', 'com', 'net', 'org'];
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'oh'];

const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g' };

// Returns null when the name is allowed, otherwise an error code.
export function nameError(raw) {
  const name = String(raw ?? '').trim();
  if (!/^[A-Za-z0-9]+$/.test(name)) return 'name_chars';
  if (name.length < NAME_MIN || name.length > NAME_MAX) return 'name_length';
  const digits = (name.match(/[0-9]/g) || []).length;
  if (digits > NAME_MAX_DIGITS) return 'name_digits';
  const lower = name.toLowerCase();
  const letters = lower.replace(/[0-9]/g, '');
  const leet = lower.replace(/[0-9]/g, (d) => LEET[d]);
  // Stretched spellings count too: "Truuump" and "Tr4mmp" are read as "trump".
  const squash = (s) => s.replace(/(.)\1+/g, '$1');
  const sl = squash(letters), sx = squash(leet);
  for (const w of BLOCK_ANYWHERE) {
    if (letters.includes(w) || leet.includes(w)) return 'name_blocked';
    const q = squash(w);
    if (q.length >= 4 && (sl.includes(q) || sx.includes(q))) return 'name_blocked';
  }
  for (const w of BLOCK_EXACT) if (letters === w || leet === w || sl === w || sx === w) return 'name_blocked';
  for (const w of BLOCK_EDGE) if (letters.startsWith(w) || letters.endsWith(w)) return 'name_blocked';
  let n = 0;
  for (const w of NUMBER_WORDS) n += letters.split(w).length - 1;
  if (n >= 3) return 'name_blocked';
  return null;
}

export const NAME_ERROR_TEXT = {
  name_chars: 'Letters and numbers only. No spaces or symbols.',
  name_length: `Name must be ${NAME_MIN} to ${NAME_MAX} characters.`,
  name_digits: `Up to ${NAME_MAX_DIGITS} numbers in a name.`,
  name_blocked: 'That name is not allowed. No bad words, religious or political names, social media or contact info.',
};
