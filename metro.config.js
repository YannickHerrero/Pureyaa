const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle kuromoji's compressed dictionaries as binary assets.
config.resolver.assetExts.push('gz');

module.exports = config;
