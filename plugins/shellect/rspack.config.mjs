import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'
import { fileURLToPath } from 'node:url'

const reactShared = { singleton: true, requiredVersion: '^18.3.1', import: false }

export default {
  mode: 'production',
  entry: './frontend/container-entry.ts',
  output: { path: fileURLToPath(new URL('dist/', import.meta.url)), clean: true, publicPath: 'auto' },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [{
      test: /\.tsx?$/,
      use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } } } }],
      type: 'javascript/auto',
    }],
  },
  plugins: [new ModuleFederationPlugin({
    name: 'shellect',
    filename: 'remoteEntry.js',
    exposes: { './Panel': './frontend/Manager.tsx' },
    shared: { react: reactShared, 'react-dom': reactShared, 'react/jsx-runtime': reactShared },
    dts: false,
  })],
}
