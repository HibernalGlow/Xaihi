/**
 * 容器入口占位。
 *
 * rspack 拒绝没有入口的构建，而本包只作为被装载的容器存在：对外契约在
 * rspack.config.mjs 的 `exposes` 里，运行时不会执行这个文件。
 */
export {}
