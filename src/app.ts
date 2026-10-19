import { applyMapping, applySettings, dataRows, importBytes, importText } from './csv/import';
import { isMappingComplete } from './csv/columns';
import { combineTransactions } from './detect/combine';
import { analyzeTransactions } from './detect/recurrence';
import { h } from './dom';
import { buildResultsCsv } from './export';
import {
  CADENCE_LABELS,
  CONFIDENCE_LABELS,
  EXCLUSION_LABELS,
  KIND_LABELS,
  formatDate,
  formatMoney,
  joinList,
  plural,
} from './format';
import { SAMPLE_CSV, SAMPLE_NAME } from './sample';
import { clearChecklist, getStorage, loadChecklist, saveChecklist } from './storage';
import type {
  Analysis,
  ColumnMapping,
  ColumnRole,
  Decision,
  ExclusionReason,
  FileSettings,
  Finding,
  ImportedFile,
} from './types';

export interface AppEnv {
  locale: string;
  storage: Storage | null;
  download: (fileName: string, content: string) => void;
  print: () => void;
}

export interface Draft {
  file: number;
  headerRow: number;
  mapping: ColumnMapping;
  error: string;
}

export interface AppState {
  files: ImportedFile[];
  draft: Draft | null;
  billTolerance: number;
  decisions: Map<string, Decision>;
  remember: boolean;
  analysis: Analysis | null;
  duplicatesRemoved: number;
  errors: string[];
}

export interface AppApi {
  addFiles(files: readonly File[]): Promise<void>;
  loadSample(): void;
  state(): Readonly<AppState>;
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const TOLERANCE_OPTIONS: readonly number[] = [0.1, 0.25, 0.5];
export const EXPORT_FILE_NAME = 'subscription-finder-results.csv';

const ROLE_LABELS: Record<ColumnRole, string> = {
  date: 'Date',
  description: 'Description or merchant',
  amount: 'Amount (money in and out in one column)',
  debit: 'Money out (if it has its own column)',
  credit: 'Money in (if it has its own column)',
  direction: 'Money in or out indicator (like "Debit" / "Credit")',
};

const ROLES: readonly ColumnRole[] = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'direction',
];

export function defaultEnv(): AppEnv {
  return {
    locale: navigator.language || 'en-US',
    storage: getStorage(),
    download(fileName, content) {
      const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    print() {
      window.print();
    },
  };
}

/** Checks for files that are clearly not CSV. Returns a message, or null when the file is fine. */
export function fileProblem(name: string, bytes: Uint8Array): string | null {
  if (bytes.length === 0) {
    return `${name} is empty.`;
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return `${name} looks like an Excel or zip file. Save or export it as CSV and try again.`;
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return `${name} is a PDF. Look for a CSV or spreadsheet download on your bank's website instead.`;
  }
  return null;
}

function columnLabel(file: ImportedFile, headerRow: number, col: number): string {
  const header = headerRow >= 0 ? (file.rows[headerRow]?.cells[col] ?? '').trim() : '';
  return header !== '' ? `Column ${col + 1}: ${header}` : `Column ${col + 1}`;
}

function columnName(file: ImportedFile, col: number): string {
  const header =
    file.settings.headerRow >= 0
      ? (file.rows[file.settings.headerRow]?.cells[col] ?? '').trim()
      : '';
  return header !== '' ? `"${header}"` : `column ${col + 1}`;
}

function fileWidth(file: ImportedFile): number {
  return Math.max(0, ...file.rows.slice(0, 50).map((row) => row.cells.length));
}

export function mountApp(root: HTMLElement, env: AppEnv = defaultEnv()): AppApi {
  const saved = loadChecklist(env.storage);
  const state: AppState = {
    files: [],
    draft: null,
    billTolerance: 0.25,
    decisions: saved ?? new Map<string, Decision>(),
    remember: saved !== null,
    analysis: null,
    duplicatesRemoved: 0,
    errors: [],
  };
  const money = (cents: number): string => formatMoney(cents, env.locale);
  const date = (iso: string): string => formatDate(iso, env.locale);
  const view = h('div', { class: 'view' });
  const status = h('p', { class: 'visually-hidden', attrs: { role: 'status', id: 'status' } });
  root.replaceChildren(view, status);

  function announce(message: string): void {
    status.textContent = message;
  }

  function recompute(): void {
    const combined = combineTransactions(state.files);
    state.duplicatesRemoved = combined.duplicatesRemoved;
    state.analysis =
      combined.transactions.length > 0
        ? analyzeTransactions(combined.transactions, { billTolerance: state.billTolerance })
        : null;
  }

  function render(focusId?: string): void {
    const active = document.activeElement;
    const keep = focusId ?? (active instanceof HTMLElement ? active.id : '');
    view.replaceChildren(
      ...[renderUpload(), renderErrors(), renderFiles(), renderResults()].filter(
        (el): el is HTMLElement => el !== null,
      ),
    );
    if (keep) {
      document.getElementById(keep)?.focus();
    }
  }

  function startDraft(index: number): void {
    const file = state.files[index];
    if (file) {
      state.draft = {
        file: index,
        headerRow: file.settings.headerRow,
        mapping: { ...file.settings.mapping },
        error: '',
      };
    }
  }

  function resultMessage(): string {
    const analysis = state.analysis;
    if (!analysis) {
      return 'No transactions could be read yet.';
    }
    const active = analysis.findings.filter((f) => f.status === 'active').length;
    return active === 0
      ? 'No recurring payments found.'
      : `Found ${plural(active, 'recurring payment', 'recurring payments')}, about ${money(analysis.monthlyTotal)} a month.`;
  }

  function afterImport(added: number): void {
    if (state.draft === null) {
      const index = state.files.findIndex((file) => file.needsReview);
      if (index >= 0) {
        startDraft(index);
      }
    }
    recompute();
    const waiting = state.files.filter((file) => file.needsReview).length;
    let focusId: string | undefined;
    if (added > 0 && waiting > 0) {
      focusId = 'mapping-heading';
    } else if (added > 0 && state.analysis) {
      focusId = 'results-heading';
    }
    render(focusId);
    const parts = [added > 0 ? `Added ${plural(added, 'file', 'files')}.` : ''];
    if (waiting > 0) {
      parts.push('Please choose the columns for your file.');
    } else if (added > 0) {
      parts.push(resultMessage());
    }
    parts.push(...state.errors);
    announce(parts.filter(Boolean).join(' '));
  }

  async function addFiles(files: readonly File[]): Promise<void> {
    state.errors = [];
    let added = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        state.errors.push(`${file.name} is larger than 20 MB. Export a shorter date range.`);
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const problem = fileProblem(file.name, bytes);
      if (problem) {
        state.errors.push(problem);
        continue;
      }
      const imported = importBytes(file.name, bytes);
      if (imported.rows.length < 2) {
        state.errors.push(`${file.name} does not contain any transactions.`);
        continue;
      }
      state.files.push(imported);
      added += 1;
    }
    afterImport(added);
  }

  function loadSample(): void {
    state.errors = [];
    if (!state.files.some((file) => file.name === SAMPLE_NAME)) {
      state.files.push(importText(SAMPLE_NAME, SAMPLE_CSV, 'utf-8'));
    }
    recompute();
    render('results-heading');
    announce(`Loaded the sample data. ${resultMessage()}`);
  }

  function reset(): void {
    state.files = [];
    state.draft = null;
    state.errors = [];
    state.analysis = null;
    state.duplicatesRemoved = 0;
    if (!state.remember) {
      state.decisions.clear();
    }
    render('upload-heading');
    announce('Cleared all files. Nothing was saved.');
  }

  function updateSettings(index: number, change: Partial<FileSettings>): void {
    const file = state.files[index];
    if (!file) {
      return;
    }
    state.files[index] = applySettings(file, { ...file.settings, ...change });
    recompute();
    render();
    announce(resultMessage());
  }

  function removeFile(index: number): void {
    const [removed] = state.files.splice(index, 1);
    if (state.draft?.file === index) {
      state.draft = null;
    } else if (state.draft && state.draft.file > index) {
      state.draft.file -= 1;
    }
    recompute();
    render('upload-heading');
    announce(`Removed ${removed?.name ?? 'the file'}.`);
  }

  function applyDraft(): void {
    const draft = state.draft;
    const file = draft ? state.files[draft.file] : undefined;
    if (!draft || !file) {
      return;
    }
    if (!isMappingComplete(draft.mapping)) {
      draft.error =
        'Choose a date column, a description column, and an amount column (or a money out or money in column).';
      render('mapping-error');
      return;
    }
    const updated = applyMapping(file, draft.mapping, draft.headerRow);
    if (updated.transactions.length === 0) {
      draft.error =
        'No transactions could be read with these columns. Check the date and amount columns.';
      render('mapping-error');
      return;
    }
    state.files[draft.file] = updated;
    state.draft = null;
    const next = state.files.findIndex((f) => f.needsReview);
    if (next >= 0) {
      startDraft(next);
    }
    recompute();
    render(next >= 0 ? 'mapping-heading' : 'results-heading');
    announce(`Using the columns you chose for ${updated.name}. ${resultMessage()}`);
  }

  function setDecision(finding: Finding, index: number, decision: Decision, on: boolean): void {
    if (on) {
      state.decisions.set(finding.id, decision);
      const other = decision === 'cancel' ? 'keep' : 'cancel';
      const box = document.getElementById(`decision-${index}-${other}`);
      if (box instanceof HTMLInputElement) {
        box.checked = false;
      }
    } else if (state.decisions.get(finding.id) === decision) {
      state.decisions.delete(finding.id);
    }
    if (state.remember) {
      saveChecklist(env.storage, state.decisions);
    }
    const savings = document.getElementById('savings');
    if (savings) {
      savings.textContent = savingsText();
    }
  }

  function savingsText(): string {
    const findings = state.analysis?.findings ?? [];
    const cancel = findings.filter(
      (f) => f.status === 'active' && state.decisions.get(f.id) === 'cancel',
    );
    if (cancel.length === 0) {
      return 'Tick "Cancel" or "Keep" for each payment to make your checklist.';
    }
    const yearly = cancel.reduce((sum, f) => sum + f.yearlyCost, 0);
    return `You marked ${plural(cancel.length, 'payment', 'payments')} to cancel. That could save about ${money(yearly)} a year.`;
  }

  function renderUpload(): HTMLElement {
    const input = h('input', {
      class: 'visually-hidden',
      attrs: {
        type: 'file',
        id: 'file-input',
        accept: '.csv,.tsv,.txt,text/csv',
        multiple: true,
      },
    });
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      void addFiles(files);
    });
    const zone = h(
      'label',
      {
        class: 'dropzone',
        attrs: { for: 'file-input' },
        on: {
          dragover: (event) => {
            event.preventDefault();
            zone.classList.add('dragging');
          },
          dragleave: () => zone.classList.remove('dragging'),
          drop: (event) => {
            event.preventDefault();
            zone.classList.remove('dragging');
            void addFiles(Array.from((event as DragEvent).dataTransfer?.files ?? []));
          },
        },
      },
      [
        h('span', { class: 'dropzone-title', text: 'Drop your CSV files here' }),
        h('span', { class: 'dropzone-hint' }, [
          'or ',
          h('span', { class: 'link-like', text: 'choose files' }),
          ' from your device',
        ]),
      ],
    );
    return h('section', { class: 'card', attrs: { 'aria-labelledby': 'upload-heading' } }, [
      h('h2', {
        attrs: { id: 'upload-heading', tabindex: -1 },
        text: state.files.length > 0 ? 'Add more statements' : 'Add your statements',
      }),
      h('p', {
        text: 'Download your transactions as a CSV file from your bank or credit card website (look for "Export" or "Download transactions"). Twelve months or more gives the best results. You can add several files, even if their dates overlap.',
      }),
      input,
      zone,
      h('div', { class: 'actions' }, [
        h('button', {
          class: 'button secondary',
          attrs: { type: 'button', id: 'sample-button' },
          text: 'Try with sample data',
          on: { click: () => loadSample() },
        }),
        state.files.length > 0
          ? h('button', {
              class: 'button secondary',
              attrs: { type: 'button', id: 'reset-button' },
              text: 'Start over',
              on: { click: () => reset() },
            })
          : null,
      ]),
    ]);
  }

  function renderErrors(): HTMLElement | null {
    if (state.errors.length === 0) {
      return null;
    }
    return h(
      'div',
      { class: 'notice error', attrs: { id: 'errors' } },
      state.errors.map((message) => h('p', { text: message })),
    );
  }

  function select(
    id: string,
    label: string,
    options: ReadonlyArray<[string, string]>,
    value: string,
    onChange: (value: string) => void,
  ): HTMLElement {
    const el = h(
      'select',
      { attrs: { id } },
      options.map(([optionValue, text]) => h('option', { attrs: { value: optionValue }, text })),
    );
    el.value = value;
    el.addEventListener('change', () => onChange(el.value));
    return h('div', { class: 'field' }, [h('label', { attrs: { for: id }, text: label }), el]);
  }

  function fileSummary(file: ImportedFile): string {
    if (file.needsReview) {
      return `${plural(file.rows.length, 'row', 'rows')}. Choose the columns to read this file.`;
    }
    const count = file.transactions.length;
    const first = file.transactions.reduce((min, t) => Math.min(min, t.day), Infinity);
    const last = file.transactions.reduce((max, t) => Math.max(max, t.day), -Infinity);
    const range =
      count > 0
        ? ` from ${date(file.transactions.find((t) => t.day === first)?.date ?? '')} to ${date(file.transactions.find((t) => t.day === last)?.date ?? '')}`
        : '';
    const skipped =
      file.skipped > 0
        ? ` ${plural(file.skipped, 'row', 'rows')} could not be read and ${file.skipped === 1 ? 'was' : 'were'} skipped.`
        : '';
    return `${plural(count, 'transaction', 'transactions')}${range}.${skipped}`;
  }

  function columnsSummary(file: ImportedFile): string {
    const m = file.settings.mapping;
    const parts = [`dates from ${columnName(file, m.date)}`];
    parts.push(`descriptions from ${columnName(file, m.description)}`);
    if (m.amount >= 0) {
      parts.push(`amounts from ${columnName(file, m.amount)}`);
    }
    if (m.amount < 0 && m.debit >= 0) {
      parts.push(`money out from ${columnName(file, m.debit)}`);
    }
    if (m.amount < 0 && m.credit >= 0) {
      parts.push(`money in from ${columnName(file, m.credit)}`);
    }
    if (m.direction >= 0) {
      parts.push(`in or out from ${columnName(file, m.direction)}`);
    }
    return `Reading ${joinList(parts)}.`;
  }

  function renderFileSettings(file: ImportedFile, index: number): HTMLElement {
    const s = file.settings;
    const controls: HTMLElement[] = [];
    if (file.hasNumericDates) {
      controls.push(
        select(
          `file-${index}-date-order`,
          'Dates are written as',
          [
            ['mdy', 'Month/day/year (12/31/2026)'],
            ['dmy', 'Day/month/year (31/12/2026)'],
          ],
          s.dateOrder,
          (value) => updateSettings(index, { dateOrder: value === 'dmy' ? 'dmy' : 'mdy' }),
        ),
      );
    }
    if (s.mapping.amount >= 0 && s.mapping.direction < 0) {
      controls.push(
        select(
          `file-${index}-signs`,
          'Money you spent is shown as',
          [
            ['negative', 'Negative numbers, like -12.99'],
            ['positive', 'Positive numbers, like 12.99'],
          ],
          s.flipSigns ? 'positive' : 'negative',
          (value) => updateSettings(index, { flipSigns: value === 'positive' }),
        ),
      );
    }
    controls.push(
      select(
        `file-${index}-decimal`,
        'Decimal separator',
        [
          ['.', 'Point (1,234.56)'],
          [',', 'Comma (1.234,56)'],
        ],
        s.decimal,
        (value) => updateSettings(index, { decimal: value === ',' ? ',' : '.' }),
      ),
    );
    const open = file.dateAmbiguous || state.draft?.file === index;
    return h('details', { class: 'file-settings', attrs: { open } }, [
      h('summary', { text: 'Check how this file was read' }),
      h('div', { class: 'fields' }, controls),
      h('div', { class: 'actions' }, [
        h('button', {
          class: 'button secondary',
          attrs: { type: 'button', id: `file-${index}-columns` },
          text: 'Change columns',
          on: {
            click: () => {
              startDraft(index);
              render('mapping-heading');
            },
          },
        }),
      ]),
    ]);
  }

  function renderMapping(file: ImportedFile, draft: Draft): HTMLElement {
    const width = fileWidth(file);
    const columnOptions: Array<[string, string]> = [['-1', 'Not in this file']];
    for (let col = 0; col < width; col += 1) {
      columnOptions.push([String(col), columnLabel(file, draft.headerRow, col)]);
    }
    const headerOptions: Array<[string, string]> = [['-1', 'None (the file has no column names)']];
    for (let row = 0; row < Math.min(file.rows.length, 30); row += 1) {
      const preview = (file.rows[row]?.cells ?? [])
        .slice(0, 3)
        .map((cell) => cell.trim())
        .join(', ');
      headerOptions.push([String(row), `Row ${row + 1}: ${preview.slice(0, 60)}`]);
    }
    const fields: HTMLElement[] = [
      select(
        'map-header-row',
        'Column names are in',
        headerOptions,
        String(draft.headerRow),
        (value) => {
          draft.headerRow = Number(value);
          draft.error = '';
          render('map-header-row');
        },
      ),
    ];
    for (const role of ROLES) {
      fields.push(
        select(
          `map-${role}`,
          ROLE_LABELS[role],
          columnOptions,
          String(draft.mapping[role]),
          (v) => {
            draft.mapping[role] = Number(v);
          },
        ),
      );
    }
    const preview = dataRows(file.rows, draft.headerRow).slice(0, 5);
    const table = h('table', { class: 'preview' }, [
      h('caption', { text: 'The first rows of your file' }),
      h('thead', {}, [
        h(
          'tr',
          {},
          Array.from({ length: width }, (_, col) =>
            h('th', { attrs: { scope: 'col' }, text: columnLabel(file, draft.headerRow, col) }),
          ),
        ),
      ]),
      h(
        'tbody',
        {},
        preview.map((row) =>
          h(
            'tr',
            {},
            Array.from({ length: width }, (_, col) => h('td', { text: row.cells[col] ?? '' })),
          ),
        ),
      ),
    ]);
    return h('div', { class: 'mapping' }, [
      h('h3', {
        attrs: { id: 'mapping-heading', tabindex: -1 },
        text: `Choose the columns for ${file.name}`,
      }),
      h('p', {
        text: 'We could not be sure which columns hold the date, the description and the amount. Pick them below; the preview shows the first rows of your file.',
      }),
      h('div', { class: 'fields' }, fields),
      h('div', { class: 'table-scroll' }, [table]),
      draft.error
        ? h('p', {
            class: 'notice error',
            attrs: { id: 'mapping-error', tabindex: -1 },
            text: draft.error,
          })
        : null,
      h('div', { class: 'actions' }, [
        h('button', {
          class: 'button',
          attrs: { type: 'button', id: 'map-apply' },
          text: 'Use these columns',
          on: { click: () => applyDraft() },
        }),
        file.needsReview
          ? null
          : h('button', {
              class: 'button secondary',
              attrs: { type: 'button', id: 'map-cancel' },
              text: 'Cancel',
              on: {
                click: () => {
                  state.draft = null;
                  render(`file-${draft.file}-columns`);
                },
              },
            }),
      ]),
    ]);
  }

  function renderFiles(): HTMLElement | null {
    if (state.files.length === 0) {
      return null;
    }
    const items = state.files.map((file, index) => {
      const draft = state.draft?.file === index ? state.draft : null;
      return h('li', { class: 'file' }, [
        h('div', { class: 'file-head' }, [
          h('h3', { text: file.name }),
          h('button', {
            class: 'button link',
            attrs: {
              type: 'button',
              id: `file-${index}-remove`,
              'aria-label': `Remove ${file.name}`,
            },
            text: 'Remove',
            on: { click: () => removeFile(index) },
          }),
        ]),
        h('p', { text: fileSummary(file) }),
        file.needsReview ? null : h('p', { class: 'muted', text: columnsSummary(file) }),
        file.dateAmbiguous && !file.needsReview
          ? h('p', {
              class: 'notice',
              text: `The dates in this file could be month/day or day/month, and we read them as ${file.settings.dateOrder === 'mdy' ? 'month/day/year' : 'day/month/year'}. If a date below looks wrong, change it in "Check how this file was read".`,
            })
          : null,
        file.needsReview && !draft
          ? h('button', {
              class: 'button',
              attrs: { type: 'button', id: `file-${index}-columns` },
              text: 'Choose columns',
              on: {
                click: () => {
                  startDraft(index);
                  render('mapping-heading');
                },
              },
            })
          : null,
        file.needsReview ? null : renderFileSettings(file, index),
        draft ? renderMapping(file, draft) : null,
      ]);
    });
    return h('section', { class: 'card', attrs: { 'aria-labelledby': 'files-heading' } }, [
      h('h2', { attrs: { id: 'files-heading' }, text: 'Your files' }),
      h('p', {
        class: 'muted',
        text: 'Your files are read on this device and are never uploaded.',
      }),
      h('ul', { class: 'files' }, items),
    ]);
  }

  function excludedText(analysis: Analysis): string {
    const parts: string[] = [];
    for (const reason of Object.keys(EXCLUSION_LABELS) as ExclusionReason[]) {
      const count = analysis.excluded[reason];
      if (count > 0) {
        const [one, many] = EXCLUSION_LABELS[reason];
        parts.push(plural(count, one, many));
      }
    }
    return parts.length > 0 ? `Not counted: ${joinList(parts)}.` : '';
  }

  function renderFinding(finding: Finding, index: number): HTMLElement {
    const nameId = `finding-${index}-name`;
    const flags: HTMLElement[] = [];
    if (finding.priceIncrease) {
      const p = finding.priceIncrease;
      flags.push(
        h('li', {
          class: 'flag warn',
          text: `Price went up from ${money(p.from)} to ${money(p.to)} on ${date(p.date)}.`,
        }),
      );
    }
    for (const d of finding.duplicates) {
      flags.push(
        h('li', {
          class: 'flag warn',
          text: `Charged twice: ${money(d.second.amount)} on ${date(d.first.date)} and ${date(d.second.date)}. Check whether one was refunded.`,
        }),
      );
    }
    if (finding.isNew) {
      flags.push(
        h('li', {
          class: 'flag info',
          text: `Started on ${date(finding.firstDate)}. If you signed up for a free trial, this may be when it turned into a paid plan.`,
        }),
      );
    }
    const decision = state.decisions.get(finding.id);
    const box = (value: Decision, label: string): HTMLElement => {
      const id = `decision-${index}-${value}`;
      const input = h('input', {
        attrs: { type: 'checkbox', id, checked: decision === value },
      });
      input.addEventListener('change', () => setDecision(finding, index, value, input.checked));
      return h('label', { class: 'check', attrs: { for: id } }, [
        input,
        label,
        h('span', { class: 'visually-hidden', text: ` ${finding.merchant}` }),
      ]);
    };
    const facts: Array<[string, string]> = [
      ['Usual amount', money(finding.typicalAmount)],
      ['Per year', money(finding.yearlyCost)],
      ['Last charge', date(finding.lastDate)],
    ];
    if (finding.status === 'active') {
      facts.push(['Next charge expected', date(finding.nextDate)]);
    } else {
      facts.push(['Status', `No charge since ${date(finding.lastDate)}`]);
    }
    return h('li', { class: 'finding' }, [
      h('article', { attrs: { 'aria-labelledby': nameId } }, [
        h('div', { class: 'finding-head' }, [
          h('h3', { attrs: { id: nameId }, text: finding.merchant }),
          h('p', { class: 'finding-amount' }, [
            money(finding.typicalAmount),
            h('span', {
              class: 'muted',
              text: ` ${CADENCE_LABELS[finding.cadence].toLowerCase()}`,
            }),
          ]),
        ]),
        h('ul', { class: 'badges', attrs: { 'aria-label': 'Details' } }, [
          h('li', { class: 'badge', text: CADENCE_LABELS[finding.cadence] }),
          h('li', { class: 'badge', text: KIND_LABELS[finding.kind] }),
          h('li', {
            class: `badge confidence-${finding.confidence}`,
            text: CONFIDENCE_LABELS[finding.confidence],
          }),
        ]),
        h(
          'dl',
          { class: 'facts' },
          facts.map(([term, value]) =>
            h('div', { class: 'fact' }, [h('dt', { text: term }), h('dd', { text: value })]),
          ),
        ),
        flags.length > 0 ? h('ul', { class: 'flags' }, flags) : null,
        h('fieldset', { class: 'decision' }, [
          h('legend', { text: 'Your checklist' }),
          box('cancel', 'Cancel'),
          box('keep', 'Keep'),
        ]),
        renderWhy(finding),
      ]),
    ]);
  }

  function renderWhy(finding: Finding): HTMLElement {
    const gaps = finding.intervals;
    const average = Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(gaps.length, 1));
    const lines = [
      `${plural(finding.charges.length, 'charge', 'charges')} in a row, about every ${plural(average, 'day', 'days')} (${CADENCE_LABELS[finding.cadence].toLowerCase()}).`,
    ];
    if (finding.kind === 'bill') {
      lines.push(
        `The amount changes from charge to charge, so this looks like a bill. Every charge was within ${Math.round(state.billTolerance * 100)}% of the usual amount.`,
      );
    } else {
      lines.push('The amount stays the same, so this looks like a subscription.');
    }
    lines.push(
      finding.confidence === 'high'
        ? 'High confidence: enough charges in a row, all at regular gaps.'
        : 'Medium confidence: the pattern is short or the gaps vary a little.',
    );
    if (finding.earlierCharges > 0) {
      lines.push(
        `${plural(finding.earlierCharges, 'earlier charge', 'earlier charges')} from this merchant did not fit the pattern and ${finding.earlierCharges === 1 ? 'is' : 'are'} not listed.`,
      );
    }
    const last = finding.charges[finding.charges.length - 1];
    const rows = finding.charges.map((charge, i) =>
      h('tr', {}, [
        h('td', { text: date(charge.date) }),
        h('td', { class: 'number', text: money(charge.amount) }),
        h('td', { class: 'number', text: i === 0 ? '' : String(gaps[i - 1] ?? '') }),
      ]),
    );
    return h('details', { class: 'why' }, [
      h('summary', { text: 'Why we think this repeats' }),
      ...lines.map((line) => h('p', { text: line })),
      last ? h('p', { class: 'muted', text: `On your statement: ${last.description}` }) : null,
      h('div', { class: 'table-scroll' }, [
        h('table', { class: 'charges' }, [
          h('caption', { class: 'visually-hidden', text: `Charges from ${finding.merchant}` }),
          h('thead', {}, [
            h('tr', {}, [
              h('th', { attrs: { scope: 'col' }, text: 'Date' }),
              h('th', { attrs: { scope: 'col' }, class: 'number', text: 'Amount' }),
              h('th', { attrs: { scope: 'col' }, class: 'number', text: 'Days since previous' }),
            ]),
          ]),
          h('tbody', {}, rows),
        ]),
      ]),
    ]);
  }

  function renderResults(): HTMLElement | null {
    const analysis = state.analysis;
    if (!analysis) {
      return null;
    }
    const active = analysis.findings.filter((f) => f.status === 'active');
    const stopped = analysis.findings.filter((f) => f.status === 'stopped');
    const indexOf = (f: Finding): number => analysis.findings.indexOf(f);
    const remember = h('input', {
      attrs: { type: 'checkbox', id: 'remember', checked: state.remember },
    });
    remember.addEventListener('change', () => {
      state.remember = remember.checked;
      if (state.remember) {
        saveChecklist(env.storage, state.decisions);
        announce('Your checklist will be remembered on this device.');
      } else {
        clearChecklist(env.storage);
        announce('Your saved checklist was deleted from this device.');
      }
    });
    const based = `Based on ${plural(analysis.transactionCount, 'transaction', 'transactions')} from ${date(analysis.dataStart)} to ${date(analysis.dataEnd)}.`;
    const merged =
      state.duplicatesRemoved > 0
        ? ` ${plural(state.duplicatesRemoved, 'row', 'rows')} found in more than one file ${state.duplicatesRemoved === 1 ? 'was' : 'were'} counted once.`
        : '';
    return h(
      'section',
      { class: 'card results', attrs: { 'aria-labelledby': 'results-heading' } },
      [
        h('h2', { attrs: { id: 'results-heading', tabindex: -1 }, text: 'What we found' }),
        h('p', { text: based + merged }),
        h('div', { class: 'totals' }, [
          h('div', { class: 'total' }, [
            h('span', { class: 'total-label', text: 'Per month' }),
            h('span', {
              class: 'total-value',
              attrs: { id: 'total-month' },
              text: money(analysis.monthlyTotal),
            }),
          ]),
          h('div', { class: 'total' }, [
            h('span', { class: 'total-label', text: 'Per year' }),
            h('span', {
              class: 'total-value',
              attrs: { id: 'total-year' },
              text: money(analysis.yearlyTotal),
            }),
          ]),
          h('div', { class: 'total' }, [
            h('span', { class: 'total-label', text: 'Recurring payments' }),
            h('span', {
              class: 'total-value',
              attrs: { id: 'total-count' },
              text: String(active.length),
            }),
          ]),
        ]),
        h('p', {
          class: 'muted',
          text: 'Amounts are in the currency of your statement. Totals include active payments only.',
        }),
        excludedText(analysis) ? h('p', { class: 'muted', text: excludedText(analysis) }) : null,
        h('div', { class: 'toolbar no-print' }, [
          select(
            'tolerance',
            'Bills can change by up to',
            TOLERANCE_OPTIONS.map((t) => [String(t), `${Math.round(t * 100)}%`]),
            String(state.billTolerance),
            (value) => {
              state.billTolerance = Number(value);
              recompute();
              render();
              announce(resultMessage());
            },
          ),
          h('div', { class: 'actions' }, [
            h('button', {
              class: 'button',
              attrs: { type: 'button', id: 'export-button' },
              text: 'Download results (CSV)',
              on: {
                click: () => {
                  env.download(
                    EXPORT_FILE_NAME,
                    buildResultsCsv(analysis.findings, state.decisions),
                  );
                  announce(`Downloaded ${EXPORT_FILE_NAME}.`);
                },
              },
            }),
            h('button', {
              class: 'button secondary',
              attrs: { type: 'button', id: 'print-button' },
              text: 'Print',
              on: { click: () => env.print() },
            }),
          ]),
          h('div', { class: 'remember' }, [
            h('label', { class: 'check', attrs: { for: 'remember' } }, [
              remember,
              'Remember my checklist on this device',
            ]),
            h('p', {
              class: 'muted small',
              text: 'Off by default. Saves only merchant names and your choices in this browser, never your transactions. Turn it off to delete them.',
            }),
          ]),
        ]),
        h('p', { class: 'savings', attrs: { id: 'savings' }, text: savingsText() }),
        active.length > 0
          ? h(
              'ol',
              { class: 'findings', attrs: { 'aria-label': 'Recurring payments' } },
              active.map((f) => renderFinding(f, indexOf(f))),
            )
          : h('p', {
              class: 'notice',
              text: 'We did not find any regular payments in these files. Try adding a longer date range: most patterns need at least three charges.',
            }),
        stopped.length > 0
          ? h('div', { class: 'stopped' }, [
              h('h3', { text: 'Possibly stopped' }),
              h('p', {
                class: 'muted',
                text: 'These had a regular pattern but no recent charge, so they are not in the totals. Check that they were really cancelled.',
              }),
              h(
                'ol',
                { class: 'findings', attrs: { 'aria-label': 'Possibly stopped payments' } },
                stopped.map((f) => renderFinding(f, indexOf(f))),
              ),
            ])
          : null,
      ],
    );
  }

  render();
  return {
    addFiles,
    loadSample,
    state: () => state,
  };
}
