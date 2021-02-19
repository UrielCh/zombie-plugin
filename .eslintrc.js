module.exports = {
    env: {
        browser: true,
        node: true,
        es6: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 2018,
        sourceType: 'module'
    },
    plugins: [
        '@typescript-eslint'
    ],
    rules: {
        "@typescript-eslint/no-floating-promises": "error",
        '@typescript-eslint/no-explicit-any': 'off',
        'no-promise-executor-return': 2,
        'indent': ['error', 4, {'SwitchCase': 1}],
        'linebreak-style': 'off',
        // 'linebreak-style': ['error', 'unix'],
        'quotes': ['error', 'single'],
        'semi': ['error', 'always'],
        'no-constant-condition': 'off',
        'max-len': 'off',
        'array-type': 'off',
    },
    globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
    },
    ignorePatterns: [ '**/*.d.ts' ],
};