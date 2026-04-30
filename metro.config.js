const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle dictionary files as binary assets, not source modules.
// JMdict/JMnedict use .dict; kuromoji's compressed dictionaries use .gz.
config.resolver.assetExts.push('dict', 'gz');

module.exports = config;
