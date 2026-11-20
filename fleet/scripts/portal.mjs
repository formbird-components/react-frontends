// How the demo portal (solidjs-components/portal) shows and serves this app: it builds the app with
// APP_BASE=/<basePath>/ into dist-portal/, serves that at /<basePath>/, and proxies
// /<basePath>/api and /<basePath>/auth to fieldtec-web on ownConfig.port.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ownConfig } from './config.mjs';

export const portal = {
  basePath: 'react-fleet',
  name: 'Fleet (React)',
  company: 'Harbourline Services',
  tagline: 'The fleet app as a React single-page app: bookings, the asset register, the workshop, Daily Driver checks, fuel and a fleet map. Same data model and server rules as the Solid fleet demo, in a database of its own.',
  accent: '#0ea5e9',
  ownConfig,
};

/**
 * The accounts and start pages the portal lists, and its banner picture.
 * @param {{ solidRoot: string }} o - The solidjs-components checkout
 */
export async function portalDetails({ solidRoot }) {
  const fleetRoot = path.join(solidRoot, 'solidjs-components-fleet');
  const { buildDemo } = await import(pathToFileURL(path.join(fleetRoot, 'demo/lib/build.mjs')).href);
  const demo = buildDemo({ now: new Date(), urlRoot: `/${portal.basePath}` });
  return {
    people: demo.people,
    password: demo.password,
    urls: { overview: '/overview', bookings: '/bookings', newBooking: '/bookings/new', assets: '/assets', workshop: '/workshop', dailyDriver: '/checks/new', fuel: '/fuel', map: '/map' },
    picture: path.join(fleetRoot, 'demo/backgrounds/login-2.jpg'),
  };
}
