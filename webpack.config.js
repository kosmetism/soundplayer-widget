'use strict';

var env = process.env.NODE_ENV || 'development';
var path = require('path');
var filename = env === 'production' ? 'soundplayer-widget.min.js' : 'soundplayer-widget.js';

module.exports = {
    entry: './src/index.js',

    output: {
        path: path.join(__dirname, '/dist/'),
        filename: filename
    },

    resolve: {
        extensions: ['', '.js', '.jsx']
    },

    module: {
        loaders: [{
            test: /\.css$/,
            loader: 'style?singleton!css!cssnext'
        }, {
            test: /\.jsx?$/,
            exclude: /node_modules/,
            loader: 'babel',
            query: { stage: 0 }
        }],
        postLoaders: [{
            test: /\.jsx?$/,
            loader: 'transform?envify'
        }]
    }
};
