// How the demo portal (solidjs-components/portal) shows and serves this app: it builds the app with
// APP_BASE=/<basePath>/ into dist-portal/, serves that at /<basePath>/, and proxies
// /<basePath>/api and /<basePath>/auth to fieldtec-web on ownConfig.port.

import path from 'node:path';
import { PASSWORD, PEOPLE, emailOf } from '../demo/catalog.mjs';
import { ownConfig } from './config.mjs';

export const portal = {
  basePath: 'react-sdms',
  name: 'SDMS (React)',
  company: 'a made-up software team',
  tagline: 'Formbird\'s internal service desk (SDMS) as a React single-page app: My View with its board and notifications, All Items with saved filters and bulk updates, the Item form and Recent, on an SDMS-shaped demo database.',
  accent: '#7c3aed',
  ownConfig,
};

/**
 * The accounts and start pages the portal lists, and its banner picture.
 * @param {{ solidRoot: string }} o - The solidjs-components checkout
 */
export async function portalDetails({ solidRoot }) {
  return {
    people: PEOPLE.map((p) => ({ name: `${p.first} ${p.last}`, email: emailOf(p), role: p.admin ? `${p.title}, SDMS admin` : p.title })),
    password: PASSWORD,
    urls: { myView: '/my-view', allItems: '/items', newItem: '/items/new', recent: '/recent', closedItem: '/items/1223' },
    picture: path.join(solidRoot, 'solidjs-components-internal/demo/backgrounds/login-2.jpg'),
  };
}
