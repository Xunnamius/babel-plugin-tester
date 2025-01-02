// @ts-check
'use strict';

import { deepMergeConfig } from '@-xun/symbiote/assets';
import { moduleExport } from '@-xun/symbiote/assets/commitlint.config.mjs';
// TODO: publish latest rejoinder package first, then update configs to use it
//import { createDebugLogger } from 'rejoinder';

/*const debug = createDebugLogger({ namespace: 'symbiote:config:commitlint' });*/

const config = deepMergeConfig(moduleExport(), {
  // Any custom configs here will be deep merged with moduleExport's result
});

export default config;

/*debug('exported config: %O', config);*/
