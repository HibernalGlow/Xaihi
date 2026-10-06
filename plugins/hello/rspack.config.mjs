/**
 * 示例节点的 UI 产物：一个只出不进的远程模块容器。
 *
 * 两处是有意的硬约束：
 * - `shared.*.import: false`：容器在共享域里拿不到 React 时必须失败，而不是悄悄打
 *   一份自己的 React——后者是跨边界 hooks 随机崩的来源，症状比原因晚很久。
 * - `name` 必须等于 package.json#xaihi.ui.remote，否则宿主按清单解析不到这个容器。
 */
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack'

const reactShared = {
  singleton: true,
  requiredVersion: '^18.3.1',
  import: false,
}

export default {
  mode: 'production',
  // rspack 要求一个入口；契约全在 exposes 里，这个文件不会被运行时消费。
  entry: './frontend/container-entry.ts',
  output: {
    path: new URL('dist/', import.meta.url).pathname,
    clean: true,
    publicPath: 'auto',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
                transform: { react: { runtime: 'automatic' } },
              },
            },
          },
        ],
        type: 'javascript/auto',
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'hello',
      filename: 'remoteEntry.js',
      exposes: {
        './Panel': './frontend/Panel.tsx',
      },
      shared: {
        react: reactShared,
        'react-dom': reactShared,
      },
      dts: false,
    }),
  ],
}
