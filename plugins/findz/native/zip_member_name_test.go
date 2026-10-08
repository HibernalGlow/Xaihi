package main

import (
	"archive/zip"
	"testing"
)

func TestDisplayZipMemberNameKeepsValidUTF8WithoutTheZIPFlag(t *testing.T) {
	member := &zip.File{FileHeader: zip.FileHeader{Name: "\u9875\u9762/\u5c01\u9762.png", NonUTF8: true}}
	if got := displayZipMemberName(member); got != member.Name {
		t.Fatalf("expected valid UTF-8 name to remain unchanged, got %q", got)
	}
}

func TestDisplayZipMemberNameRejectsNonGBKLegacyBytes(t *testing.T) {
	member := &zip.File{FileHeader: zip.FileHeader{Name: string([]byte{0x82, 0x2e, 'p', 'n', 'g'}), NonUTF8: true}}
	if got := displayZipMemberName(member); got != member.Name {
		t.Fatalf("expected non-GBK name to remain unchanged, got %q", got)
	}
}
