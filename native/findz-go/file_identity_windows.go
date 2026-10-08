//go:build windows

package main

import (
	"fmt"
	"os"
	"syscall"
)

func fileIdentity(path string) string {
	file, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer file.Close()
	var information syscall.ByHandleFileInformation
	if err := syscall.GetFileInformationByHandle(syscall.Handle(file.Fd()), &information); err != nil {
		return ""
	}
	return fmt.Sprintf("%08x:%08x%08x", information.VolumeSerialNumber, information.FileIndexHigh, information.FileIndexLow)
}
