// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

const path = require('path');
const HtmlWebpackPlugin = require('../node_modules/html-webpack-plugin');
const CopyPlugin = require('../node_modules/copy-webpack-plugin');
const uiConfig = require('../cvat-ui/webpack.config');

module.exports = (env, argv) => {
    const config = uiConfig(env, argv);
    return {
        ...config,
        entry: path.join(__dirname, 'src/index.tsx'),
        output: {
            path: path.join(__dirname, 'dist'),
            filename: 'assets/[name].[contenthash].js',
            publicPath: '/',
            clean: true,
        },
        resolve: {
            ...config.resolve,
            modules: [path.join(__dirname, 'node_modules'), ...config.resolve.modules],
        },
        module: {
            ...config.module,
            rules: [...config.module.rules, { test: /\.(woff2?|ttf)$/i, type: 'asset/resource' }],
        },
        plugins: [
            new HtmlWebpackPlugin({ template: path.join(__dirname, 'src/index.html') }),
            new CopyPlugin({ patterns: [
                { from: 'src/assets/*.{png,webp}', to: 'assets/[name][ext]' },
                { from: 'src/assets/opencv_4.8.0.js', to: 'assets/opencv_4.8.0.js' },
                { from: '../cvat-data/src/ts/3rdparty/avc.wasm', to: 'assets/3rdparty/' },
            ] }),
        ],
        devServer: {
            host: process.env.CVAT_UI_HOST || '127.0.0.1',
            port: 3001,
            historyApiFallback: true,
        },
        performance: { hints: false },
    };
};
