module.exports = {
    entry: [
        "babel-polyfill",
        "./lib/basket.js"
    ],

    output: {
        path: __dirname + '/output/',
        publicPath: "/output/",
        filename: 'basket.min.js'
    },

    module: {
        loaders: [
            {
                test: /\.jsx?$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'babel-loader', // 'babel-loader' is also a legal name to reference
                query: {
                    presets: ['es2015']
                }
            }
        ]
    }
};