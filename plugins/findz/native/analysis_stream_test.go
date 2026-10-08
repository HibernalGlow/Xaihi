package main

import (
	"bytes"
	"io"
	"testing"
)

func TestFindzReadsPNGDimensionsWithoutConsumingThePrefixBudget(t *testing.T) {
	payload := append(pngFixture(t, 32, 16), bytes.Repeat([]byte{0}, standardImagePrefixBudget)...)
	reader := &countingReader{reader: bytes.NewReader(payload)}

	result := analyzeImageStream(reader, "png", 4_096)

	if result.status != "complete" || result.width != 32 || result.height != 16 {
		t.Fatalf("expected complete PNG metadata, got %#v", result)
	}
	if reader.bytesRead > metadataSniffBufferSize*2 {
		t.Fatalf("PNG header analysis read %d bytes; expected a small header read, not the %d byte prefix budget", reader.bytesRead, standardImagePrefixBudget)
	}
}

func TestFindzAppliesTheDetectedFormatBudgetAfterTheExtensionHint(t *testing.T) {
	if got := prefixBudgetForAnalysis("jpg", false); got != standardImagePrefixBudget {
		t.Fatalf("expected a JPEG extension to start at the standard budget, got %d", got)
	}
	if got := prefixBudgetForFormat("avif", false); got != isoImagePrefixBudget {
		t.Fatalf("expected an AVIF signature to receive the ISO budget, got %d", got)
	}
	if got := prefixBudgetForFormat("heif", true); got != deepISOImagePrefixBudget {
		t.Fatalf("expected deep HEIF retry to receive the deep ISO budget, got %d", got)
	}

	reader := &metadataBudgetReader{remaining: standardImagePrefixBudget - metadataSniffBufferSize}
	reader.setTotalBudget(standardImagePrefixBudget, isoImagePrefixBudget)
	if want := int64(isoImagePrefixBudget - metadataSniffBufferSize); reader.remaining != want {
		t.Fatalf("expected signature upgrade to preserve %d bytes of total ISO budget, got %d", want, reader.remaining)
	}
}

type countingReader struct {
	reader    io.Reader
	bytesRead int64
}

func (reader *countingReader) Read(buffer []byte) (int, error) {
	read, err := reader.reader.Read(buffer)
	reader.bytesRead += int64(read)
	return read, err
}
