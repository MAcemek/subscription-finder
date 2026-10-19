/**
 * Merchant normalization. Turns a statement description such as
 * "PAYPAL *TUNELY MUSIC 402-555-0117" into a display name ("Tunely Music") and a grouping key
 * ("TUNELY MUSIC"). The rules are generic; a short alias list only merges a few very common
 * services whose descriptions vary a lot between banks.
 */

export interface Merchant {
  key: string;
  name: string;
}

/** Bank wording in front of the merchant name, like "POS PURCHASE" or "CHECKCARD 0105". */
const BANK_PREFIX =
  /^(?:(?:recurring )?(?:purchase|payment) authorized on \d{1,2}\/\d{1,2}|pos purchase|pos debit|debit card purchase|card purchase(?: with pin)?|checkcard \d{4}|visa debit|debit card|card payment to|direct debit(?: to)?|sepa lastschrift|lastschrift|kartenzahlung|prlv sepa|paiement cb(?: \d{4})?|paiement par carte|recibo|compra|pago|addebito sdd|addebito|betaling|dd|pos)\s+/i;

/** Payment processor prefixes, like "SQ *" (Square), "TST*" (Toast) or "PAYPAL *". */
const PROCESSOR_PREFIX =
  /^(?:sq|squ|tst|paypal|pp|pypl|sp|google|dd|ic|fs|ls|paddle\.net|2co\.com)\s*\*\s*/i;

/** Card numbers such as "CARD 1234" or "CRD XXXX1234". */
const CARD_NUMBER = /\b(?:card|crd)\s*(?:no\.?|number|#)?\s*[x*]*\d{2,}\b/gi;

const DOMAIN_SUFFIX = /\.(?:com|net|org|io|co\.uk|co|app|tv|fm|de|fr|nl|es|it|eu|uk)\b(?:\/\S*)?/gi;

/** US states and common country codes that card networks add to the end of a description. */
const LOCATION_CODES = new Set(
  (
    'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH ' +
    'NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY ' +
    'US USA GB GBR UK NL NLD DEU FRA ESP ITA IE IRL LU LUX BE BEL CAN AU AUS CH CHE AT AUT ' +
    'PT PRT SE SWE'
  ).split(' '),
);

const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'on', 'at', 'by']);

/** Very common services whose descriptions vary between banks, matched on the start of the key. */
export const ALIASES: ReadonlyArray<{ pattern: RegExp; name: string }> = [
  { pattern: /^NETFLIX\b/, name: 'Netflix' },
  { pattern: /^SPOTIFY\b/, name: 'Spotify' },
  { pattern: /^HULU\b/, name: 'Hulu' },
  { pattern: /^DISNEY ?PLUS\b/, name: 'Disney+' },
  { pattern: /^PARAMOUNT ?PLUS\b/, name: 'Paramount+' },
  { pattern: /^(?:AMAZON PRIME|AMZN PRIME|PRIME VIDEO)\b/, name: 'Amazon Prime' },
  { pattern: /^YOUTUBE ?PREMIUM\b|^YOUTUBEPREMIUM\b/, name: 'YouTube Premium' },
  { pattern: /^GOOGLE ?(?:ONE|STORAGE)\b/, name: 'Google One' },
  { pattern: /^(?:MSFT|MICROSOFT)\b/, name: 'Microsoft' },
  { pattern: /^ADOBE\b/, name: 'Adobe' },
  { pattern: /^DROPBOX\b/, name: 'Dropbox' },
  { pattern: /^AUDIBLE\b/, name: 'Audible' },
  { pattern: /^PEACOCK\b/, name: 'Peacock' },
  { pattern: /^(?:OPENAI|CHATGPT)\b/, name: 'OpenAI' },
  { pattern: /^(?:NYTIMES|NYT|NEW YORK TIMES)\b/, name: 'The New York Times' },
  { pattern: /^DUOLINGO\b/, name: 'Duolingo' },
];

function letterCount(value: string): number {
  return value.match(/\p{L}/gu)?.length ?? 0;
}

/** Cuts at the first run of two or more spaces that follows at least three letters. */
function cutAtWideGap(value: string): string {
  const re = /\s{2,}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const before = value.slice(0, match.index);
    if (letterCount(before) >= 3) {
      return before;
    }
  }
  return value;
}

function dropToken(token: string): boolean {
  const digits = token.match(/\d/g)?.length ?? 0;
  if (digits >= 3 || (digits > 0 && /[#/.:]/.test(token))) {
    return true;
  }
  return /^[^\p{L}\p{N}&]+$/u.test(token);
}

export function merchantKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\+/g, ' PLUS ')
    .replace(/['.&]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .map((word, i) => {
      if (word.includes('&')) {
        return word.toUpperCase();
      }
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }
      return lower.replace(
        /(^|[-/])(\p{L})/gu,
        (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`,
      );
    })
    .join(' ');
}

/** Removes the parts of a description that change between charges or do not name the merchant. */
export function cleanDescription(description: string): string {
  let value = cutAtWideGap(description.trim());
  value = value.replace(BANK_PREFIX, '');
  value = value.replace(PROCESSOR_PREFIX, '');
  const star = value.indexOf('*');
  if (star >= 0 && letterCount(value.slice(0, star)) >= 2) {
    value = value.slice(0, star);
  }
  value = value
    .replace(CARD_NUMBER, ' ')
    .replace(/\bwww\./gi, '')
    .replace(DOMAIN_SUFFIX, '');
  const tokens = value.split(/\s+/).filter((token) => token !== '' && !dropToken(token));
  while (tokens.length > 1) {
    const last = (tokens[tokens.length - 1] as string).toUpperCase().replace(/[^A-Z]/g, '');
    if (!LOCATION_CODES.has(last) && last.length !== 1) {
      break;
    }
    tokens.pop();
  }
  return tokens
    .join(' ')
    .replace(/^[\s\-_,.:;/]+|[\s\-_,.:;/]+$/g, '')
    .trim();
}

export function normalizeMerchant(description: string): Merchant {
  let cleaned = cleanDescription(description);
  if (merchantKey(cleaned) === '') {
    cleaned = description.trim().replace(/\s+/g, ' ');
  }
  const key = merchantKey(cleaned);
  for (const alias of ALIASES) {
    if (alias.pattern.test(key)) {
      return { key: merchantKey(alias.name), name: alias.name };
    }
  }
  const name = /\p{Ll}/u.test(cleaned) ? cleaned : titleCase(cleaned);
  return { key, name };
}
