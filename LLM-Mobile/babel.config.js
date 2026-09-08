module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

// Removed the react-native-dotenv plugin. It exposed an "@env" module reading
// path: '../.env' - the REPOSITORY ROOT env file, not this app's. Nothing ever
// imported "@env"; the app reads process.env.EXPO_PUBLIC_API_URL, which Expo
// loads from LLM-Mobile/.env.local. Keeping a second env mechanism pointed at
// the wrong file was a trap waiting for whoever tried to use it.