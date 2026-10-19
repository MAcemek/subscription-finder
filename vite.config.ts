import { defineConfig, type Plugin } from 'vite';

/**
 * The Content-Security-Policy of the built page. It only allows the page's own scripts,
 * styles and images, and blocks every network request (connect-src 'none') and form
 * submission, so the page cannot send your data anywhere.
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

/**
 * Adds the CSP meta tag to the built index.html. It is left out of the dev server, which
 * needs inline styles and a WebSocket for hot reloading.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'subscription-finder-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="utf-8" />',
        `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base: '/subscription-finder/',
  plugins: [contentSecurityPolicy()],
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
