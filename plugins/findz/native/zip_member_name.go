package main

import (
	"archive/zip"
	"bytes"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

// displayZipMemberName converts only the legacy CP936 names that can be
// round-tripped exactly. ZIPs that declare UTF-8, including writers that omit
// the flag but store valid UTF-8 bytes, keep their original names.
func displayZipMemberName(member *zip.File) string {
	rawName := member.Name
	if !member.NonUTF8 || utf8.ValidString(rawName) {
		return rawName
	}

	decoded, _, err := transform.String(simplifiedchinese.GBK.NewDecoder(), rawName)
	if err != nil || !containsHan(decoded) {
		return rawName
	}
	reencoded, _, err := transform.Bytes(simplifiedchinese.GBK.NewEncoder(), []byte(decoded))
	if err != nil || !bytes.Equal(reencoded, []byte(rawName)) {
		return rawName
	}
	return decoded
}

func containsHan(value string) bool {
	for _, character := range value {
		if unicode.Is(unicode.Han, character) {
			return true
		}
	}
	return false
}
