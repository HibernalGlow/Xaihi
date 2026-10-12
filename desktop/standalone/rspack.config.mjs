import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { documentBase } from '../../packages/ui-host/rspack.document.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(repo, 'packages/ui-host/package.json'))
const { rspack } = require('@rspack/core')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/rspack')
const product = JSON.parse(readFileSync(process.env.XAIHI_DESKTOP_PRODUCT_CONFIG ?? join(repo, 'desktop/products/kisaki/product.json'), 'utf8'))
const generated = join(repo, 'desktop/.products', product.id, 'generated')
mkdirSync(generated, { recursive: true })
const manifest = JSON.parse(readFileSync(join(repo, 'plugins', product.id, 'package.json'), 'utf8')).xaihi.node
const registry = join(generated, 'packageModules.ts')
writeFileSync(registry, `import { nodeHelpFromManifest } from '@hibernalglow/xaihi-sdk';
export const NODE_MANIFESTS = { ${product.id}: ${JSON.stringify(manifest)} };
export const PACKAGE_MODULES = [{ id: ${JSON.stringify(product.id)}, name: ${JSON.stringify(product.title)}, version: '0.0.0', category: ${JSON.stringify(manifest.category)}, description: ${JSON.stringify(manifest.description.en)}, icon: ${JSON.stringify(manifest.icon)}, manifest: NODE_MANIFESTS.${product.id} }];
export const packageModuleLoaders = {};
export const nodeHelpLoaders = { ${product.id}: async () => ({help: nodeHelpFromManifest(NODE_MANIFESTS.${product.id})}) };
`)
const output = join(repo, 'desktop/.products', product.id, 'ui')
class ProductGraphEvidence {
  apply(compiler) {
    compiler.hooks.done.tap('ProductGraphEvidence', stats => {
      // `repo + '/'` 那种写法在 Windows 上永不匹配（模块资源带反斜杠），绝对路径就整条留在证据里；
      // 分隔符按长度切一刀，两边形状一致。
      const resources = [...stats.compilation.modules].map(module => module.resource).filter(Boolean)
        .map(file => file.startsWith(repo) ? file.slice(repo.length + 1) : file).sort()
      // 宿主这一路先跑，Windows 上远端的输出目录还没被 rspack 建出来 ⇒ 直接 write 就 ENOENT。
      const directory = stats.compilation.outputOptions.path
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'module-graph.json'), JSON.stringify(resources, null, 2) + '\n')
    })
  }
}
const base = {
  ...documentBase,
  mode: 'production',
  devtool: false,
  resolve: { ...documentBase.resolve, alias: { ...documentBase.resolve.alias, '@/components/modules/packageModules.generated$': registry } },
  output: { ...documentBase.output, path: output, clean: false, publicPath: 'auto' },
}
const shared = Object.fromEntries(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'].map(name => [name, {
  singleton: true, import: false, requiredVersion: '^19.0.0',
}]))
export default [
  {
    ...base, name: 'product-host',
    entry: { main: join(repo, 'desktop/standalone/host.tsx') },
    output: { ...base.output, publicPath: '', uniqueName: 'xaihi_product_host' },
    plugins: [...base.plugins, new rspack.NormalModuleReplacementPlugin(/packageModules\.generated/, registry), new ProductGraphEvidence(), new rspack.DefinePlugin({ __XAIHI_PRODUCT__: JSON.stringify(product) })],
  },
  {
    ...base, name: 'product-remote', entry: {},
    output: {
      ...base.output,
      path: join(output, product.remote),
      uniqueName: `xaihi_product_${product.remote}`,
      // Module Federation 的异步共享依赖会按 chunk id 请求 CSS；显式固定文件名，
      // 否则 rspack 只输出 expose 名称，remoteEntry 会请求不存在的 `855.css`。
      cssChunkFilename: '[id].css',
    },
    plugins: [...base.plugins, new rspack.NormalModuleReplacementPlugin(/packageModules\.generated/, registry), new ProductGraphEvidence(), new ModuleFederationPlugin({
      name: product.remote, filename: 'remoteEntry.js', dts: false,
      exposes: { [`./${product.exportName}`]: join(repo, product.entry) },
      shared,
    })],
  },
]
