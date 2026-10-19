// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { EXPORT_FILE_NAME, mountApp, type AppEnv } from '../src/app';
import { STORAGE_KEY } from '../src/storage';
import { fixtureBytes } from './helpers';

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function setup(storage: Storage | null = null) {
  document.body.innerHTML = '<div id="app"></div>';
  const downloads: Array<{ name: string; content: string }> = [];
  let prints = 0;
  const env: AppEnv = {
    locale: 'en-US',
    storage,
    download: (name, content) => downloads.push({ name, content }),
    print: () => {
      prints += 1;
    },
  };
  const api = mountApp(document.getElementById('app')!, env);
  return { api, downloads, prints: () => prints };
}

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`#${id} not found`);
  }
  return el as T;
};

const text = (id: string): string => byId(id).textContent ?? '';

function choose(id: string, value: string): void {
  const select = byId<HTMLSelectElement>(id);
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function findingNames(selector = '.results > .findings'): string[] {
  return [...document.querySelectorAll(`${selector} h3`)].map((el) => el.textContent ?? '');
}

function findingCard(name: string): HTMLElement {
  const card = [...document.querySelectorAll<HTMLElement>('.finding')].find(
    (el) => el.querySelector('h3')?.textContent === name,
  );
  if (!card) {
    throw new Error(`${name} not found`);
  }
  return card;
}

function csvFile(name: string, content: string | Uint8Array<ArrayBuffer>): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('app', () => {
  it('starts with the upload step', () => {
    setup();
    expect(text('upload-heading')).toBe('Add your statements');
    expect(text('sample-button')).toBe('Try with sample data');
    expect(document.getElementById('results-heading')).toBeNull();
    expect(document.getElementById('reset-button')).toBeNull();
  });

  it('loads the sample data and shows the results', () => {
    setup();
    byId('sample-button').click();
    expect(document.activeElement?.id).toBe('results-heading');
    expect(text('status')).toBe(
      'Loaded the sample data. Found 9 recurring payments, about 636.83 a month.',
    );
    expect(text('total-month')).toBe('636.83');
    expect(text('total-year')).toBe('7,641.91');
    expect(text('total-count')).toBe('9');
    expect(findingNames()).toEqual([
      'Freshbox Meals',
      'Acme Auto Insurance',
      'City Power and Light',
      'Brightwave Swim School',
      'Northwind Mobile',
      'Streamflix',
      'Tunely Music',
      'Photopro Editor',
      'Cloudbox Storage',
    ]);
    expect(findingNames('.stopped .findings')).toEqual(['Fitlife Gym']);
    expect(findingCard('Streamflix').querySelector('.flags')?.textContent).toBe(
      'Price went up from 15.49 to 17.99 on Apr 3, 2026.',
    );
    expect(findingCard('Tunely Music').querySelector('.flags')?.textContent).toBe(
      'Charged twice: 10.99 on Jun 12, 2026 and Jun 13, 2026. Check whether one was refunded.',
    );
    expect(findingCard('Freshbox Meals').querySelector('.flags')?.textContent).toBe(
      'Started on Jun 6, 2026. If you signed up for a free trial, this may be when it turned into a paid plan.',
    );
    expect(findingCard('Fitlife Gym').querySelector('.facts')?.textContent).toContain(
      'No charge since Jun 1, 2026',
    );
    expect(document.querySelector('.results')?.textContent).toContain(
      'Not counted: 29 incoming payments, 13 transfers between accounts, 13 credit card payments and 6 cash withdrawals.',
    );
    const why = findingCard('City Power and Light').querySelector('details.why')?.textContent ?? '';
    expect(why).toContain('13 charges in a row, about every 30 days (monthly).');
    expect(why).toContain('Every charge was within 25% of the usual amount.');
  });

  it('asks for the columns of a file without a header row', async () => {
    const { api } = setup();
    await api.addFiles([csvFile('bank.csv', fixtureBytes('us-bank-no-header.csv'))]);
    expect(document.activeElement?.id).toBe('mapping-heading');
    expect(text('status')).toBe('Added 1 file. Please choose the columns for your file.');
    expect(document.getElementById('results-heading')).toBeNull();
    expect(byId<HTMLSelectElement>('map-header-row').value).toBe('-1');
    expect(byId<HTMLSelectElement>('map-date').value).toBe('0');
    expect(byId<HTMLSelectElement>('map-amount').value).toBe('1');
    expect(byId<HTMLSelectElement>('map-description').value).toBe('4');
    expect(document.querySelectorAll('.preview tbody tr')).toHaveLength(5);

    choose('map-description', '-1');
    byId('map-apply').click();
    expect(text('mapping-error')).toBe(
      'Choose a date column, a description column, and an amount column (or a money out or money in column).',
    );

    choose('map-description', '4');
    byId('map-apply').click();
    expect(document.getElementById('mapping-heading')).toBeNull();
    expect(findingNames()).toEqual(['Streamflix']);
    expect(document.querySelector('.file')?.textContent).toContain(
      'Reading dates from column 1, descriptions from column 5 and amounts from column 2.',
    );
  });

  it('lets the user change how a file is read', async () => {
    const { api } = setup();
    await api.addFiles([csvFile('card.csv', fixtureBytes('us-card-positive-purchases.csv'))]);
    expect(findingNames()).toEqual(['Streamflix']);
    expect(byId<HTMLSelectElement>('file-0-signs').value).toBe('positive');
    expect(byId<HTMLSelectElement>('file-0-date-order').value).toBe('mdy');
    choose('file-0-signs', 'negative');
    expect(findingNames()).toEqual([]);
    expect(document.querySelector('.results .notice')?.textContent).toContain(
      'We did not find any regular payments',
    );
    choose('file-0-signs', 'positive');
    expect(findingNames()).toEqual(['Streamflix']);

    byId('file-0-columns').click();
    expect(byId<HTMLSelectElement>('map-header-row').value).toBe('0');
    byId('map-cancel').click();
    expect(document.getElementById('mapping-heading')).toBeNull();
  });

  it('combines overlapping files and can remove them', async () => {
    const { api } = setup();
    const header = 'Date,Description,Amount\n';
    await api.addFiles([
      csvFile('jan.csv', `${header}2026-01-05,STREAMFLIX,-15.49\n2026-02-05,STREAMFLIX,-15.49\n`),
      csvFile('feb.csv', `${header}2026-02-05,STREAMFLIX,-15.49\n2026-03-05,STREAMFLIX,-15.49\n`),
    ]);
    expect(document.querySelector('.results')?.textContent).toContain(
      'Based on 3 transactions from Jan 5, 2026 to Mar 5, 2026. 1 row found in more than one file was counted once.',
    );
    expect(findingNames()).toEqual(['Streamflix']);
    byId('file-1-remove').click();
    expect(text('status')).toBe('Removed feb.csv.');
    expect(findingNames()).toEqual([]);
  });

  it('explains files it cannot read', async () => {
    const { api } = setup();
    await api.addFiles([
      csvFile('statement.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
      csvFile('statement.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
      csvFile('empty.csv', ''),
      csvFile('one-line.csv', 'Date,Description,Amount\n'),
    ]);
    expect(text('errors')).toBe(
      'statement.xlsx looks like an Excel or zip file. Save or export it as CSV and try again.' +
        "statement.pdf is a PDF. Look for a CSV or spreadsheet download on your bank's website instead." +
        'empty.csv is empty.' +
        'one-line.csv does not contain any transactions.',
    );
    expect(document.querySelector('.files')).toBeNull();
  });

  it('builds a checklist and exports it', () => {
    const { downloads, prints } = setup();
    byId('sample-button').click();
    expect(text('savings')).toBe(
      'Tick "Cancel" or "Keep" for each payment to make your checklist.',
    );
    const cancel =
      findingCard('Streamflix').querySelector<HTMLInputElement>('input[id$="-cancel"]')!;
    const keep = findingCard('Streamflix').querySelector<HTMLInputElement>('input[id$="-keep"]')!;
    cancel.click();
    expect(text('savings')).toBe(
      'You marked 1 payment to cancel. That could save about 215.88 a year.',
    );
    keep.click();
    expect(cancel.checked).toBe(false);
    expect(text('savings')).toBe(
      'Tick "Cancel" or "Keep" for each payment to make your checklist.',
    );
    cancel.click();
    findingCard('Tunely Music').querySelector<HTMLInputElement>('input[id$="-cancel"]')!.click();
    expect(text('savings')).toBe(
      'You marked 2 payments to cancel. That could save about 347.76 a year.',
    );

    byId('export-button').click();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.name).toBe(EXPORT_FILE_NAME);
    const lines = downloads[0]?.content.split('\r\n') ?? [];
    expect(lines[0]).toBe(
      'Merchant,How often,Type,Confidence,Typical amount,Yearly cost,Monthly cost,First charge,Last charge,Next expected charge,Status,Price increase,Duplicate charges,Started recently,Decision',
    );
    expect(lines).toContain(
      'Streamflix,Monthly,Subscription,High confidence,17.99,215.88,17.99,2025-09-03,2026-09-03,2026-10-03,Active,15.49 to 17.99 on 2026-04-03,,,cancel',
    );
    expect(text('status')).toBe(`Downloaded ${EXPORT_FILE_NAME}.`);

    byId('print-button').click();
    expect(prints()).toBe(1);
  });

  it('remembers the checklist only when asked', () => {
    const storage = new MemoryStorage();
    setup(storage);
    byId('sample-button').click();
    findingCard('Streamflix').querySelector<HTMLInputElement>('input[id$="-cancel"]')!.click();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(byId<HTMLInputElement>('remember').checked).toBe(false);
    byId('remember').click();
    expect(storage.getItem(STORAGE_KEY)).toBe('{"version":1,"decisions":{"STREAMFLIX":"cancel"}}');

    setup(storage);
    byId('sample-button').click();
    expect(byId<HTMLInputElement>('remember').checked).toBe(true);
    expect(
      findingCard('Streamflix').querySelector<HTMLInputElement>('input[id$="-cancel"]')!.checked,
    ).toBe(true);
    byId('remember').click();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(text('status')).toBe('Your saved checklist was deleted from this device.');
  });

  it('recalculates when the bill tolerance changes', () => {
    setup();
    byId('sample-button').click();
    choose('tolerance', '0.1');
    expect(findingNames()).not.toContain('City Power and Light');
    expect(text('total-count')).toBe('8');
    choose('tolerance', '0.25');
    expect(findingNames()).toContain('City Power and Light');
  });

  it('starts over', () => {
    setup();
    byId('sample-button').click();
    byId('reset-button').click();
    expect(document.getElementById('results-heading')).toBeNull();
    expect(document.querySelector('.files')).toBeNull();
    expect(document.activeElement?.id).toBe('upload-heading');
    expect(text('status')).toBe('Cleared all files. Nothing was saved.');
  });
});
