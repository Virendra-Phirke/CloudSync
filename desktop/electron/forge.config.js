const path = require('path');

module.exports = {
  outDir: path.resolve(__dirname, 'out_dist'),
  packagerConfig: {
    name: 'CloudSync',
    executableName: 'CloudSync',
    asar: false,
    icon: path.resolve(__dirname, 'assets/icon.ico'),
    extraResource: [
      path.resolve(__dirname, 'standalone'),
    ],
    ignore: [
      /^\/src/,
      /^\/types/,
      /^\/tsconfig\.json$/,
      /\.ts$/,
      /\.map$/,
      /\.env.*/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [],
};
