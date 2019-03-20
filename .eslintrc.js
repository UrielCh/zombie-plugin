module.exports = {
    'env': {
        'browser': true,
        'node': true,
        'es6': true,
    },
    'plugins': [],
    'extends': 'eslint:recommended',
    'rules': {
        'semi': [
            'error',
            'always'
        ],
        'quotes': [2, 'single'],
    },



    'globals': {
        '_': true,
        '$': true,
    }
};