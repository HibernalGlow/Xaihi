// 内核的单例服务声明。
//
// 从 `ffi.go` 挪到这里（见 `docs/adr/0004-non-js-core-delivery.md` 与 `README.md` 的
// "移植差异"）：`ffi.go` 现在带 `//go:build cshared`，只在出 DLL 时参与编译，而
// `findz-host` 可执行文件（`host.go`，`//go:build !cshared`）同样需要这一个单例。
// 放在不带标签的文件里，两种交付形态共用**同一个**声明，未来再加一种形态也不会
// 各拿一份自己的服务实例。
//
// 这一行的内容与基线逐字相同，只是换了文件。

package main

var sharedFindzService = newFindzService()
