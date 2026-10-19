import { describe, expect, it } from 'vitest';
import { cleanDescription, merchantKey, normalizeMerchant } from '../src/detect/normalize';

describe('normalizeMerchant', () => {
  it.each([
    ['STREAMFLIX.COM 866-555-0142 CA', 'Streamflix', 'STREAMFLIX'],
    ['PAYPAL *TUNELY MUSIC 402-555-0117', 'Tunely Music', 'TUNELY MUSIC'],
    ['SQ *PHOTOPRO EDITOR', 'Photopro Editor', 'PHOTOPRO EDITOR'],
    ['TST* FRESHBOX MEALS', 'Freshbox Meals', 'FRESHBOX MEALS'],
    ['CLOUDBOX STORAGE*7K2M9Q', 'Cloudbox Storage', 'CLOUDBOX STORAGE'],
    ['FITLIFE GYM #0423     SPRINGFIELD  IL', 'Fitlife Gym', 'FITLIFE GYM'],
    ['NORTHWIND MOBILE 800-555-0199', 'Northwind Mobile', 'NORTHWIND MOBILE'],
    ['ACME AUTO INSURANCE 4471923', 'Acme Auto Insurance', 'ACME AUTO INSURANCE'],
    ['CITY POWER AND LIGHT', 'City Power and Light', 'CITY POWER AND LIGHT'],
    [
      'PURCHASE AUTHORIZED ON 04/04 STREAMFLIX.COM 866-555-0142 CA S386094000000000 CARD 1234',
      'Streamflix',
      'STREAMFLIX',
    ],
    [
      'CHECKCARD 0105 GREENMART 0571 SPRINGFIELD IL',
      'Greenmart Springfield',
      'GREENMART SPRINGFIELD',
    ],
    ['POS PURCHASE QUICKFUEL 0093', 'Quickfuel', 'QUICKFUEL'],
    ['PRLV SEPA STREAMFLIX', 'Streamflix', 'STREAMFLIX'],
    ['WWW.TUNELY.IO/BILL', 'Tunely', 'TUNELY'],
    ['Streamflix', 'Streamflix', 'STREAMFLIX'],
    ['AT&T WIRELESS', 'AT&T Wireless', 'ATT WIRELESS'],
    ['7-ELEVEN 12345', '7-Eleven', '7 ELEVEN'],
    ['STREAMFLIX.COM AMSTERDAM NLD', 'Streamflix Amsterdam', 'STREAMFLIX AMSTERDAM'],
  ])('%j becomes %j', (description, name, key) => {
    expect(normalizeMerchant(description)).toEqual({ name, key });
  });

  it('uses the alias list for very common services', () => {
    expect(normalizeMerchant('NETFLIX.COM LOS GATOS CA')).toEqual({
      name: 'Netflix',
      key: 'NETFLIX',
    });
    expect(normalizeMerchant('Netflix')).toEqual({ name: 'Netflix', key: 'NETFLIX' });
    expect(normalizeMerchant('AMZN PRIME*2K4AB1234')).toEqual({
      name: 'Amazon Prime',
      key: 'AMAZON PRIME',
    });
    expect(normalizeMerchant('PRIME VIDEO*AB12C').name).toBe('Amazon Prime');
    expect(normalizeMerchant('DISNEY+ 888-905-7888').name).toBe('Disney+');
    expect(normalizeMerchant('GOOGLE *YOUTUBEPREMIUM G.CO/HELPPAY#').name).toBe('YouTube Premium');
    expect(normalizeMerchant('MSFT * E0300ABCD').name).toBe('Microsoft');
    expect(normalizeMerchant('Spotify P1A2B3C4D5').name).toBe('Spotify');
  });

  it('falls back to the whole description when everything would be removed', () => {
    expect(normalizeMerchant('12345678')).toEqual({ name: '12345678', key: '12345678' });
    expect(normalizeMerchant('')).toEqual({ name: '', key: '' });
  });

  it('keeps names that are already in mixed case', () => {
    expect(normalizeMerchant('Greenmart Express').name).toBe('Greenmart Express');
  });
});

describe('cleanDescription', () => {
  it('removes phone numbers, dates, store numbers and card numbers', () => {
    expect(cleanDescription('SHOP 01/15 #123 800-555-0100 CRD XXXX1234')).toBe('SHOP');
  });

  it('only cuts at a wide gap after at least three letters', () => {
    expect(cleanDescription('SQ *  BEAN THERE CAFE')).toBe('BEAN THERE CAFE');
  });
});

describe('merchantKey', () => {
  it('ignores accents, case and punctuation', () => {
    expect(merchantKey('Caf\u00e9 Cr\u00e8me')).toBe('CAFE CREME');
    expect(merchantKey("Luigi's  Trattoria.")).toBe('LUIGIS TRATTORIA');
    expect(merchantKey('Paramount+')).toBe('PARAMOUNT PLUS');
  });
});
