// pnpm db:setup: the fleet demo's database for this app (react-fleet-demo), and fieldtec-web's
// server/config/react-fleet.json pointing at it. Add --reset to replace it.
//
// The documents are the Solid fleet demo's (solidjs-components-fleet/demo/lib/build.mjs): the same
// templates, server rules (numbering, hire cost, workshop requests from failed checks…), people and
// records, loaded into a database of this app's own. The Solid repo's bundles must be built once
// (its pnpm db:setup does that), because its templates reference them.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupDatabase } from '@react-frontends/shared/dev/db-setup';
import { APP_PORT, ownConfig } from './config.mjs';

await setupDatabase({
  title: 'Fleet demo',
  appRoot: path.resolve(import.meta.dirname, '..'),
  ownConfig,
  appPort: APP_PORT,
  build: async ({ solidRoot, now, urlRoot }) => {
    const file = path.join(solidRoot, 'solidjs-components-fleet/demo/lib/build.mjs');
    if (!existsSync(path.join(solidRoot, 'solidjs-components-fleet/node_modules'))) {
      throw new Error(`solidjs-components-fleet isn't installed: run pnpm db:setup in ${path.dirname(path.dirname(path.dirname(file)))} once.`);
    }
    const { buildDemo } = await import(pathToFileURL(file).href);
    return buildDemo({ now, urlRoot });
  },
});
