"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.runPluginUnderTestHere = exports.default = void 0;

var _assert = _interopRequireDefault(require("assert"));

var _path = _interopRequireDefault(require("path"));

var _fs = _interopRequireDefault(require("fs"));

var _os = require("os");

var _lodash = _interopRequireDefault(require("lodash.mergewith"));

var _stripIndent = _interopRequireDefault(require("strip-indent"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const runPluginUnderTestHere = Symbol('run-plugin-under-test-here');
exports.runPluginUnderTestHere = runPluginUnderTestHere;

const noop = () => {}; // thanks to node throwing an error if you try to use instanceof with an arrow
// function we have to have this function. I guess it's spec... SMH...
// NOTE: I tried doing the "proper thing" using Symbol.hasInstance
// but no matter what that did, I couldn't make that work with a SyntaxError
// because SyntaxError[Symbol.hasInstance]() returns false. What. The. Heck!?
// So I'm doing this .prototype stuff :-/


function instanceOf(inst, cls) {
  return cls.prototype !== undefined && inst instanceof cls;
}

const fullDefaultConfig = {
  babelOptions: {
    parserOpts: {},
    generatorOpts: {},
    babelrc: false,
    configFile: false
  }
};

function mergeCustomizer(objValue, srcValue) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue);
  }

  return undefined;
}

function pluginTester({
  /* istanbul ignore next (TODO: write a test for this) */
  babel = require('@babel/core'),
  plugin = requiredParam('plugin'),
  pluginName,
  title: describeBlockTitle,
  pluginOptions,
  tests,
  fixtures,
  fixtureOutputName = 'output',
  filename,
  endOfLine = 'lf',
  ...rest
} = {}) {
  const tryInferPluginName = () => {
    try {
      // https://github.com/babel/babel/blob/abb26aaac2c0f6d7a8a8a1d03cde3ebc5c3c42ae/packages/babel-helper-plugin-utils/src/index.ts#L53-L70
      return plugin({
        assertVersion: () => {},
        targets: () => ({}),
        assumption: () => {}
      }, {}, process.cwd()).name;
    } catch {
      return undefined;
    }
  };

  pluginName = pluginName || tryInferPluginName() || 'unknown plugin';
  describeBlockTitle = describeBlockTitle || pluginName;
  let testNumber = 1;

  if (fixtures) {
    testFixtures({
      plugin,
      pluginName,
      pluginOptions,
      title: describeBlockTitle,
      fixtures,
      fixtureOutputName,
      filename,
      babel,
      endOfLine,
      ...rest
    });
  }

  const testAsArray = toTestArray(tests);

  if (!testAsArray.length) {
    return;
  }

  const testerConfig = (0, _lodash.default)({}, fullDefaultConfig, rest, mergeCustomizer);
  describe(describeBlockTitle, () => {
    testAsArray.forEach(testConfig => {
      if (!testConfig) {
        return;
      }

      const {
        skip,
        only,
        title,
        code,
        babelOptions,
        output,
        snapshot,
        error,
        setup = noop,
        teardown,
        formatResult = r => r,
        fixture,
        testFilepath: testFilename = fixture || filename
      } = (0, _lodash.default)({}, testerConfig, toTestConfig(testConfig), mergeCustomizer);
      (0, _assert.default)(!skip && !only || skip !== only, 'Cannot enable both skip and only on a test');
      finalizePluginRunOrder(babelOptions);

      if (skip) {
        // eslint-disable-next-line jest/no-disabled-tests
        it.skip(title, testerWrapper);
      } else if (only) {
        // eslint-disable-next-line jest/no-focused-tests
        it.only(title, testerWrapper);
      } else {
        it(title, testerWrapper);
      }

      async function testerWrapper() {
        const teardowns = teardown ? [teardown] : [];
        let returnedTeardown;

        try {
          returnedTeardown = await setup();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('There was a problem during setup');
          throw e;
        }

        if (typeof returnedTeardown === 'function') {
          teardowns.push(returnedTeardown);
        }

        try {
          await tester();
        } finally {
          try {
            await Promise.all(teardowns.map(t => t()));
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('There was a problem during teardown'); // eslint-disable-next-line no-unsafe-finally

            throw e;
          }
        }
      } // eslint-disable-next-line complexity


      async function tester() {
        (0, _assert.default)(code, 'A string or object with a `code` or `fixture` property must be provided');
        (0, _assert.default)(!babelOptions.babelrc || babelOptions.filename, 'babelrc set to true, but no filename specified in babelOptions');
        (0, _assert.default)(!snapshot || !output, '`output` cannot be provided with `snapshot: true`');
        let result, transformed;
        let errored = false;

        try {
          if (babel.transformAsync) {
            transformed = await babel.transformAsync(code, babelOptions);
          } else {
            transformed = babel.transform(code, babelOptions);
          }

          result = formatResult(fixLineEndings(transformed.code, endOfLine, code), {
            filename: testFilename
          });
        } catch (err) {
          if (error) {
            errored = true;
            result = err;
          } else {
            throw err;
          }
        }

        const expectedToThrowButDidNot = error && !errored;
        (0, _assert.default)(!expectedToThrowButDidNot, 'Expected to throw error, but it did not.');

        if (snapshot) {
          (0, _assert.default)(result !== code, 'Code was unmodified but attempted to take a snapshot. If the code should not be modified, set `snapshot: false`');
          const separator = '\n\n      ↓ ↓ ↓ ↓ ↓ ↓\n\n';
          const formattedOutput = [code, separator, result].join('');
          expect(`\n${formattedOutput}\n`).toMatchSnapshot(title);
        } else if (error) {
          assertError(result, error);
        } else if (typeof output === 'string') {
          _assert.default.equal(result.trim(), output.trim(), 'Output is incorrect.');
        } else {
          _assert.default.equal(result.trim(), fixLineEndings(code, endOfLine), 'Expected output to not change, but it did');
        }
      }
    });
  });

  function toTestConfig(testConfig) {
    if (typeof testConfig === 'string') {
      testConfig = {
        code: testConfig
      };
    }

    const {
      title,
      fixture,
      code = getCode(filename, fixture),
      fullTitle = title || `${testNumber++}. ${pluginName}`,
      output = getCode(filename, testConfig.outputFixture) || undefined,
      pluginOptions: testOptions = pluginOptions
    } = testConfig;
    return (0, _lodash.default)({
      babelOptions: {
        filename: getPath(filename, fixture)
      }
    }, testConfig, {
      babelOptions: {
        plugins: [[plugin, testOptions]]
      },
      title: fullTitle,
      code: (0, _stripIndent.default)(code).trim(),
      ...(output ? {
        output: (0, _stripIndent.default)(output).trim()
      } : {})
    }, mergeCustomizer);
  }
}

function fixLineEndings(string, endOfLine, input = string) {
  return String(string).replace(/\r?\n/g, getReplacement()).trim();

  function getReplacement() {
    switch (endOfLine) {
      case 'lf':
        {
          return '\n';
        }

      case 'crlf':
        {
          return '\r\n';
        }

      case 'auto':
        {
          return _os.EOL;
        }

      case 'preserve':
        {
          const match = input.match(/\r?\n/);

          if (match === null) {
            return _os.EOL;
          }

          return match[0];
        }

      default:
        {
          throw new Error("Invalid 'endOfLine' value");
        }
    }
  }
}

const createFixtureTests = (fixturesDir, options) => {
  if (!_fs.default.statSync(fixturesDir).isDirectory()) return;

  const rootOptionsPath = _path.default.join(fixturesDir, 'options.json');

  let rootFixtureOptions = {};

  if (_fs.default.existsSync(rootOptionsPath)) {
    rootFixtureOptions = require(rootOptionsPath);
  }

  _fs.default.readdirSync(fixturesDir).forEach(caseName => {
    const fixtureDir = _path.default.join(fixturesDir, caseName);

    const optionsPath = _path.default.join(fixtureDir, 'options.json');

    const jsCodePath = _path.default.join(fixtureDir, 'code.js');

    const tsCodePath = _path.default.join(fixtureDir, 'code.ts');

    const jsxCodePath = _path.default.join(fixtureDir, 'code.jsx');

    const tsxCodePath = _path.default.join(fixtureDir, 'code.tsx');

    const blockTitle = caseName.split('-').join(' ');
    const codePath = _fs.default.existsSync(jsCodePath) && jsCodePath || _fs.default.existsSync(tsCodePath) && tsCodePath || _fs.default.existsSync(jsxCodePath) && jsxCodePath || _fs.default.existsSync(tsxCodePath) && tsxCodePath;
    let localFixtureOptions = {};

    if (_fs.default.existsSync(optionsPath)) {
      localFixtureOptions = require(optionsPath);
    }

    const mergedFixtureAndPluginOptions = { ...rootFixtureOptions,
      ...options.pluginOptions,
      ...localFixtureOptions
    };

    if (!codePath) {
      describe(blockTitle, () => {
        createFixtureTests(fixtureDir, { ...options,
          pluginOptions: mergedFixtureAndPluginOptions
        });
      });
      return;
    }

    const {
      only,
      skip,
      title
    } = localFixtureOptions;
    (0, _assert.default)(!skip && !only || skip !== only, 'Cannot enable both skip and only on a test');
    (only ? it.only : skip ? it.skip : it)(title || blockTitle, async () => {
      const {
        plugin,
        pluginOptions,
        fixtureOutputName,
        babel,
        endOfLine,
        formatResult = r => r,
        ...rest
      } = options;
      const hasBabelrc = ['.babelrc', '.babelrc.js', '.babelrc.cjs'].some(babelrc => _fs.default.existsSync(_path.default.join(fixtureDir, babelrc)));
      const {
        babelOptions
      } = (0, _lodash.default)({}, fullDefaultConfig, {
        babelOptions: {
          // if they have a babelrc, then we'll let them use that
          // otherwise, we'll just use our simple config
          babelrc: hasBabelrc
        }
      }, rest, {
        babelOptions: {
          // Ensure `rest` comes before `babelOptions.plugins` to preserve
          // default plugin run order
          plugins: [[plugin, mergedFixtureAndPluginOptions]]
        }
      }, mergeCustomizer);
      finalizePluginRunOrder(babelOptions);

      const input = _fs.default.readFileSync(codePath).toString();

      let transformed, ext;

      if (babel.transformAsync) {
        transformed = await babel.transformAsync(input, { ...babelOptions,
          filename: codePath
        });
      } else {
        transformed = babel.transform(input, { ...babelOptions,
          filename: codePath
        });
      }

      const actual = formatResult(fixLineEndings(transformed.code, endOfLine, input));
      const {
        fixtureOutputExt
      } = mergedFixtureAndPluginOptions;

      if (fixtureOutputExt) {
        ext = fixtureOutputExt;
      } else {
        ext = `.${codePath.split('.').pop()}`;
      }

      const outputPath = _path.default.join(fixtureDir, `${fixtureOutputName}${ext}`);

      if (!_fs.default.existsSync(outputPath)) {
        _fs.default.writeFileSync(outputPath, actual);

        return;
      }

      const output = _fs.default.readFileSync(outputPath, 'utf8');

      _assert.default.equal(actual.trim(), fixLineEndings(output, endOfLine), `actual output does not match ${fixtureOutputName}${ext}`);
    });
  });
};

function testFixtures({
  title: describeBlockTitle,
  fixtures,
  filename,
  ...rest
}) {
  describe(`${describeBlockTitle} fixtures`, () => {
    const fixturesDir = getPath(filename, fixtures);
    createFixtureTests(fixturesDir, rest);
  });
}

function toTestArray(tests) {
  tests = tests || []; // null/0/false are ok, so no default param

  if (Array.isArray(tests)) {
    return tests;
  }

  return Object.keys(tests).reduce((testsArray, key) => {
    let value = tests[key];

    if (typeof value === 'string') {
      value = {
        code: value
      };
    }

    testsArray.push({
      title: key,
      ...value
    });
    return testsArray;
  }, []);
}

function getCode(filename, fixture) {
  if (!fixture) {
    return '';
  }

  return _fs.default.readFileSync(getPath(filename, fixture), 'utf8');
}

function getPath(filename, basename) {
  if (!basename) {
    return undefined;
  }

  if (_path.default.isAbsolute(basename)) {
    return basename;
  }

  return _path.default.join(_path.default.dirname(filename), basename);
} // eslint-disable-next-line complexity


function assertError(result, error) {
  if (typeof error === 'function') {
    if (!(instanceOf(result, error) || error(result) === true)) {
      throw result;
    }
  } else if (typeof error === 'string') {
    (0, _assert.default)(result.message.includes(error), 'Error message is incorrect');
  } else if (error instanceof RegExp) {
    (0, _assert.default)(error.test(result.message), `Expected ${result.message} to match ${error}`);
  } else {
    (0, _assert.default)(typeof error === 'boolean', 'The given `error` must be a function, string, boolean, or RegExp');
  }
}

function requiredParam(name) {
  throw new Error(`${name} is a required parameter.`);
}

function finalizePluginRunOrder(babelOptions) {
  if (babelOptions.plugins.includes(runPluginUnderTestHere)) {
    babelOptions.plugins.splice(babelOptions.plugins.indexOf(runPluginUnderTestHere), 1, babelOptions.plugins.pop());
  }
}

var _default = pluginTester; // unfortunately the ESLint plugin for Jest thinks this is a test file
// a better solution might be to adjust the eslint config so it doesn't
// but I don't have time to do that at the moment.

/*
eslint
  complexity: off,
  jest/valid-describe: off,
  jest/no-if: off,
  jest/valid-title: off,
  jest/no-export: off,
  jest/no-try-expect: off,
  jest/no-conditional-expect: off,
*/

exports.default = _default;