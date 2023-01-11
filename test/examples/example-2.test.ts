/* eslint jest/require-hook: ["error", { "allowedFunctionCalls": ["pluginTester"] }] */

import { pluginTester } from '../../src/index';
import { identifierReversePlugin } from '../helpers/plugins';

// * Simple example from README.md
pluginTester({
  plugin: identifierReversePlugin,
  snapshot: true,
  tests: [
    {
      code: '"hello";'
      // Snapshot should show that code has not changed.
    },
    {
      snapshot: false,
      code: 'var hello = "hi";',
      output: "var olleh = 'hi';"
    },
    `
      function sayHi(person) {
        return 'Hello ' + person + '!'
      }
      console.log(sayHi('Jenny'))
    `
  ]
});
