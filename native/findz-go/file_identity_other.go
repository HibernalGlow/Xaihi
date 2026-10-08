//go:build !windows

package main

func fileIdentity(_ string) string {
	return ""
}
