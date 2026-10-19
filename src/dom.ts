/** A tiny helper for building DOM elements. Text is always set as text, never as HTML. */

export type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  on?: Partial<Record<string, (event: Event) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) {
    el.className = props.class;
  }
  if (props.text !== undefined) {
    el.textContent = props.text;
  }
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === undefined || value === false) {
      continue;
    }
    el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [event, handler] of Object.entries(props.on ?? {})) {
    if (handler) {
      el.addEventListener(event, handler);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
