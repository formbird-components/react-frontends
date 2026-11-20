import type { UserConfig } from 'vite';

export interface AppConfigOptions {
  /** The app's folder (import.meta.dirname in its vite.config.ts): `@` is its src/. */
  root: string;
  /** The app's port (PORT overrides it). */
  port: number;
  /** fieldtec-web's URL when FIELDTEC_URL isn't set. */
  backend: string;
  /** More config, merged in (e.g. build options, more plugins). */
  config?: UserConfig;
}

/** Packages there must be one copy of. */
export declare const DEDUPE: string[];

/** A Vite config for an app on fieldtec-web: React, Tailwind, the `@` alias, the proxy, ports and hosts. */
export declare function appConfig(options: AppConfigOptions): UserConfig;
