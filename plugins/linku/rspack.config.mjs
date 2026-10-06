import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'

// shared.import:false ⇒ 拿不到宿主 React 就硬失败，绝不允许自带第二份。
// name 必须等于 package.json#xaihi.ui.remote。
const reactShared = { singleton: true, requiredVersion: '^18.3.1', import: false }

export default {
  mode: 'production',
  // rspack 要求一个入口；契约在 exposes 里，这个文件不会被运行时消费。
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
      name: 'linku',
      filename: 'remoteEntry.js',
      exposes: { './Panel': './frontend/Panel.tsx' },
      shared: { react: reactShared, 'react-dom': reactShared },
      dts: false,
    }),
  ],
}
