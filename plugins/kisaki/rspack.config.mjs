import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'

const reactShared = { singleton: true, requiredVersion: '^18.3.1', import: false }

export default {
  mode: 'production',
  entry: './frontend/container-entry.ts',
  output: { path: new URL('dist/', import.meta.url).pathname, clean: true, publicPath: 'auto' },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } } } }],
        type: 'javascript/auto',
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'kisaki',
      filename: 'remoteEntry.js',
      exposes: { './Panel': './frontend/Panel.tsx' },
      shared: { react: reactShared, 'react-dom': reactShared },
      dts: false,
    }),
  ],
}
