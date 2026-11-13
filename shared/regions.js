// Where a player fights from. In the US the region is the state; everywhere else it is the country.
// A State Boss belongs to one region. Mirrors wb_region in supabase/migrations/0023_state_boss.sql.
export const COUNTRIES = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['IE', 'Ireland'],
  ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'],
  ['AT', 'Austria'], ['PT', 'Portugal'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'],
  ['CZ', 'Czechia'], ['HU', 'Hungary'], ['RO', 'Romania'], ['GR', 'Greece'], ['UA', 'Ukraine'], ['TR', 'Turkey'], ['IL', 'Israel'],
  ['SA', 'Saudi Arabia'], ['AE', 'United Arab Emirates'], ['EG', 'Egypt'], ['NG', 'Nigeria'], ['KE', 'Kenya'], ['GH', 'Ghana'], ['ZA', 'South Africa'],
  ['MX', 'Mexico'], ['BR', 'Brazil'], ['AR', 'Argentina'], ['CL', 'Chile'], ['CO', 'Colombia'], ['PE', 'Peru'],
  ['JP', 'Japan'], ['KR', 'South Korea'], ['CN', 'China'], ['TW', 'Taiwan'], ['HK', 'Hong Kong'], ['SG', 'Singapore'], ['MY', 'Malaysia'],
  ['ID', 'Indonesia'], ['VN', 'Vietnam'], ['TH', 'Thailand'], ['PH', 'Philippines'], ['IN', 'India'], ['PK', 'Pakistan'], ['BD', 'Bangladesh'],
];
export const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const NAME = new Map(COUNTRIES);

export const regionOf = (country, state) => (country === 'US' ? (state ? `US-${state}` : null) : (country || null));
// Text shown to players: "WA" for a US state, the country name everywhere else.
export const regionName = (region) => (!region ? '' : region.startsWith('US-') ? region.slice(3) : (NAME.get(region) || region));
// Undo regionOf, for the "move there" button.
export const regionPlace = (region) => (region.startsWith('US-') ? { country: 'US', state: region.slice(3) } : { country: region, state: '' });
