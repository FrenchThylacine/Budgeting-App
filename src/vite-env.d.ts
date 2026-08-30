/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * The application's version, substituted at build time from `package.json`.
 *
 * Declared rather than imported: importing `package.json` into the client
 * would put its scripts, its dependency tree and its author into the bundle
 * to display one string.
 */
declare const __APP_VERSION__: string;
