import { defineConfig } from 'tsdown'

/**
 * 浏览器半边用的组件库：platform neutral，React 与 jsx-runtime 走外部
 * （宿主模块表里 React 是真单例，内联第二份就是双 React 事故的旧路）。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'neutral',
  target: 'es2024',
  dts: true,
  clean: true,
  fixedExtension: false,
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
})
