// Holiday gifts by country. One source of truth: the engine reads it, and scripts/gen-gifts-sql.mjs turns it into
// the seed rows in supabase/migrations/0024_holiday_gifts.sql. Covers 2026-11-14 through New Year 2028.
// Big gift (a country's main holiday): 25 gems + 10 attacks. Small gift: 5 gems + 5 attacks.
// Moon-based dates (Lunar New Year, Eid, Diwali, Holi, Easter, Mid-Autumn, Carnival, Rosh Hashanah) were checked
// against a 2027 holiday calendar on 2026-11-12. Passover and Hanukkah 2027 were checked the same day. Eid depends on the moon sighting, so its window is two days wider.
export const BIG = { gems: 25, attacks: 10 };
export const SMALL = { gems: 5, attacks: 5 };

const LUNAR = ['CN', 'TW', 'HK', 'SG', 'VN', 'KR'];                       // main holiday: Lunar New Year
const EID = ['SA', 'AE', 'TR', 'EG', 'ID', 'PK', 'BD', 'MY'];             // main holiday: Eid al-Fitr
const OTHER_MAIN = [...LUNAR, ...EID, 'IN', 'IL', 'JP', 'TH'];           // everyone else: Christmas

// [code, title, date, size, only (null = everyone), except, extra days each side]
const MOVING = [
  ['thanks2026', 'Happy Thanksgiving!', '2026-11-26', SMALL, ['US']],
  ['hanukkah2026', 'Happy Hanukkah!', '2026-12-05', SMALL, ['IL']],
  ['xmas2026', 'Merry Christmas!', '2026-12-25', BIG, null, OTHER_MAIN],
  ['newyear2027', 'Happy New Year!', '2027-01-01', SMALL, null, ['JP']],
  ['newyear2027jp', 'Happy New Year!', '2027-01-01', BIG, ['JP']],
  ['lunar2027', 'Happy Lunar New Year!', '2027-02-06', BIG, LUNAR],
  ['lunar2027s', 'Happy Lunar New Year!', '2027-02-06', SMALL, ['MY', 'ID', 'PH', 'TH']],
  ['carnival2027', 'Happy Carnival!', '2027-02-09', SMALL, ['BR']],
  ['eidfitr2027', 'Eid Mubarak!', '2027-03-09', BIG, EID, null, 1],
  ['eidfitr2027s', 'Eid Mubarak!', '2027-03-09', SMALL, ['NG', 'IN', 'SG'], null, 1],
  ['holi2027', 'Happy Holi!', '2027-03-22', SMALL, ['IN']],
  ['easter2027', 'Happy Easter!', '2027-03-28', SMALL, null, [...OTHER_MAIN, 'GR', 'RO', 'UA']],
  ['easter2027o', 'Happy Easter!', '2027-05-02', SMALL, ['GR', 'RO', 'UA']],
  ['passover2027', 'Happy Passover!', '2027-04-22', SMALL, ['IL']],
  ['songkran2027', 'Happy Songkran!', '2027-04-13', BIG, ['TH']],
  ['golden2027', 'Happy Golden Week!', '2027-05-03', SMALL, ['JP']],
  ['eidadha2027', 'Eid Mubarak!', '2027-05-16', SMALL, [...EID, 'NG'], null, 1],
  ['obon2027', 'Happy Obon!', '2027-08-13', SMALL, ['JP']],
  ['midautumn2027', 'Happy Mid-Autumn Festival!', '2027-09-15', SMALL, ['CN', 'TW', 'HK', 'SG', 'VN']],
  ['chuseok2027', 'Happy Chuseok!', '2027-09-15', SMALL, ['KR']],
  ['rosh2027', 'Shana Tova!', '2027-10-02', BIG, ['IL']],
  ['thanksca2027', 'Happy Thanksgiving!', '2027-10-11', SMALL, ['CA']],
  ['diwali2027', 'Happy Diwali!', '2027-10-29', BIG, ['IN']],
  ['halloween2027', 'Happy Halloween!', '2027-10-31', SMALL, ['US', 'CA', 'GB', 'IE']],
  ['muertos2027', 'Feliz Dia de Muertos!', '2027-11-02', SMALL, ['MX']],
  ['thanks2027', 'Happy Thanksgiving!', '2027-11-25', SMALL, ['US']],
  ['hanukkah2027', 'Happy Hanukkah!', '2027-12-25', SMALL, ['IL']],
  ['xmas2027', 'Merry Christmas!', '2027-12-25', BIG, null, OTHER_MAIN],
  ['newyear2028', 'Happy New Year!', '2028-01-01', SMALL, null, ['JP']],
  ['newyear2028jp', 'Happy New Year!', '2028-01-01', BIG, ['JP']],
];

// National days: same date every year, one small gift for that country. [country, MM-DD, title]
const NATIONAL = [
  ['US', '07-04', 'Happy 4th of July!'], ['CA', '07-01', 'Happy Canada Day!'], ['GB', '11-05', 'Happy Bonfire Night!'],
  ['AU', '01-26', 'Happy Australia Day!'], ['NZ', '02-06', 'Happy Waitangi Day!'], ['IE', '03-17', "Happy St. Patrick's Day!"],
  ['DE', '10-03', 'Happy German Unity Day!'], ['FR', '07-14', 'Happy Bastille Day!'], ['ES', '10-12', 'Happy National Day!'],
  ['IT', '06-02', 'Happy Republic Day!'], ['NL', '04-27', "Happy King's Day!"], ['BE', '07-21', 'Happy National Day!'],
  ['CH', '08-01', 'Happy National Day!'], ['AT', '10-26', 'Happy National Day!'], ['PT', '06-10', 'Happy Portugal Day!'],
  ['SE', '06-06', 'Happy National Day!'], ['NO', '05-17', 'Happy Constitution Day!'], ['DK', '06-05', 'Happy Constitution Day!'],
  ['FI', '12-06', 'Happy Independence Day!'], ['PL', '11-11', 'Happy Independence Day!'], ['CZ', '10-28', 'Happy Statehood Day!'],
  ['HU', '08-20', "Happy St. Stephen's Day!"], ['RO', '12-01', 'Happy National Day!'], ['GR', '03-25', 'Happy Independence Day!'],
  ['UA', '08-24', 'Happy Independence Day!'], ['TR', '10-29', 'Happy Republic Day!'], ['SA', '09-23', 'Happy National Day!'],
  ['AE', '12-02', 'Happy National Day!'], ['EG', '07-23', 'Happy Revolution Day!'], ['NG', '10-01', 'Happy Independence Day!'],
  ['KE', '12-12', 'Happy Jamhuri Day!'], ['GH', '03-06', 'Happy Independence Day!'], ['ZA', '04-27', 'Happy Freedom Day!'],
  ['MX', '09-16', 'Feliz Dia de la Independencia!'], ['BR', '09-07', 'Happy Independence Day!'], ['AR', '07-09', 'Happy Independence Day!'],
  ['CL', '09-18', 'Felices Fiestas Patrias!'], ['CO', '07-20', 'Happy Independence Day!'], ['PE', '07-28', 'Felices Fiestas Patrias!'],
  ['JP', '02-11', 'Happy National Foundation Day!'], ['KR', '08-15', 'Happy Liberation Day!'], ['CN', '10-01', 'Happy National Day!'],
  ['TW', '10-10', 'Happy National Day!'], ['SG', '08-09', 'Happy National Day!'], ['MY', '08-31', 'Happy Merdeka Day!'],
  ['ID', '08-17', 'Happy Independence Day!'], ['VN', '09-02', 'Happy National Day!'], ['TH', '12-05', 'Happy National Day!'],
  ['PH', '06-12', 'Happy Independence Day!'], ['IN', '08-15', 'Happy Independence Day!'], ['PK', '08-14', 'Happy Independence Day!'],
  ['BD', '03-26', 'Happy Independence Day!'],
];

const DAY = 86400000;
const FROM = Date.parse('2026-11-14T00:00:00Z'), TO = Date.parse('2028-01-02T00:00:00Z');
// A gift is open from noon UTC the day before to noon UTC two days after, so every time zone gets the whole holiday.
const win = (date, pad = 0) => { const d = Date.parse(`${date}T00:00:00Z`); return { starts: d - DAY / 2 - pad * DAY, ends: d + 2 * DAY + DAY / 2 + pad * DAY }; };

export const GIFTS = [
  ...MOVING.map(([code, title, date, size, only, except, pad]) => ({ code, title, ...size, ...win(date, pad || 0), only: only || null, except: except || null })),
  ...[2026, 2027].flatMap((y) => NATIONAL.map(([c, md, title]) => ({ code: `nat${c.toLowerCase()}${y}`, title, ...SMALL, ...win(`${y}-${md}`), only: [c], except: null }))),
].filter((g) => g.starts >= FROM && g.starts < TO).sort((a, b) => a.starts - b.starts || (a.code < b.code ? -1 : 1));
// Christmas 2026 keeps the window it launched with.
Object.assign(GIFTS.find((g) => g.code === 'xmas2026'), { starts: Date.parse('2026-12-24T08:00:00Z'), ends: Date.parse('2026-12-27T08:00:00Z') });

export const giftFor = (g, country) => (!g.only || g.only.includes(country)) && !(g.except && g.except.includes(country));
