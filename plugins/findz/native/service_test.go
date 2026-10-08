package main

import (
	"archive/zip"
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

func TestFindzIndexesDuplicateMembersAndCorruptArchives(t *testing.T) {
	root := t.TempDir()
	createZipFixture(t, filepath.Join(root, "valid.cbz"), []zipFixture{
		{name: "pages/cover.png", contents: pngFixture(t, 8, 4)},
		{name: "pages/cover.png", contents: pngFixture(t, 4, 8)},
	})
	if err := os.WriteFile(filepath.Join(root, "broken.zip"), []byte("not a ZIP"), 0o644); err != nil {
		t.Fatal(err)
	}

	service, runtime := openTestLibrary(t, root)
	task, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, task.ID)

	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if len(archives.Items) != 2 {
		t.Fatalf("expected 2 archives, got %d", len(archives.Items))
	}
	var valid archiveRow
	for _, archive := range archives.Items {
		if archive.RelativePath == "valid.cbz" {
			valid = archive
		}
	}
	if valid.ID == 0 || valid.MemberCount != 2 {
		t.Fatalf("expected duplicate ZIP entries to remain indexed, got %#v", valid)
	}
	members, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: valid.ID, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if len(members.Items) != 2 {
		t.Fatalf("expected 2 duplicate members, got %d", len(members.Items))
	}
}

func TestFindzIndexesLegacyGBKMemberNames(t *testing.T) {
	root := t.TempDir()
	memberPath := "\u9875\u9762/\u5c01\u9762.png"
	archivePath := filepath.Join(root, "legacy.cbz")
	createLegacyGBKZipFixture(t, archivePath, memberPath, pngFixture(t, 8, 8))

	service, runtime := openTestLibrary(t, root)
	task, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, task.ID)

	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	members, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: archives.Items[0].ID, Text: "\u5c01\u9762", Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if len(members.Items) != 1 || members.Items[0].MemberPath != memberPath {
		t.Fatalf("expected decoded CP936 member path %q, got %#v", memberPath, members.Items)
	}
}

func TestFindzManualAnalysisReadsBoundedImageMetadata(t *testing.T) {
	root := t.TempDir()
	createZipFixture(t, filepath.Join(root, "sample.zip"), []zipFixture{
		{name: "cover.png", contents: pngFixture(t, 12, 7)},
	})
	service, runtime := openTestLibrary(t, root)
	scan, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, scan.ID)

	analysis, err := service.startAnalysis(runtime, analysisScope{Kind: "all"})
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, analysis.ID)
	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	members, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: archives.Items[0].ID, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	member := members.Items[0]
	if member.ActualFormat != "png" || member.Width == nil || member.Height == nil || *member.Width != 12 || *member.Height != 7 {
		t.Fatalf("unexpected analyzed member: %#v", member)
	}
	if member.MetadataStatus != "complete" || member.BytesPerMegapixel == nil || member.AspectRatio == nil || *member.AspectRatio <= 0 {
		t.Fatalf("image analysis did not complete: %#v", member)
	}
}

func TestFindzDeepRetryRequeuesOnlyTheSelectedBudgetExceededMember(t *testing.T) {
	root := t.TempDir()
	createZipFixture(t, filepath.Join(root, "sample.cbz"), []zipFixture{{name: "cover.png", contents: pngFixture(t, 12, 7)}})
	service, runtime := openTestLibrary(t, root)
	scan, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, scan.ID)
	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	members, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: archives.Items[0].ID, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.db.Exec(`INSERT INTO analysis_run (id, policy_revision, started_at, status) VALUES ('budget-run', ?, ?, 'completed')`, defaultAnalysisPolicy, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	if err := storeImageMetadata(runtime, "budget-run", members.Items[0].ID, imageMetadataResult{actualFormat: "png", status: "metadata_budget_exceeded", errorCode: "metadata_budget_exceeded"}); err != nil {
		t.Fatal(err)
	}

	retry, err := service.startAnalysis(runtime, analysisScope{Kind: "members", MemberIDs: []int64{members.Items[0].ID}, DeepRetry: true})
	if err != nil {
		t.Fatal(err)
	}
	completed := waitForTask(t, runtime, retry.ID)
	if completed.TotalMembers != 1 || completed.DoneMembers != 1 {
		t.Fatalf("expected a one-member deep retry, got %#v", completed)
	}
	updated, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: archives.Items[0].ID, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Items[0].MetadataStatus != "complete" || updated.Items[0].Width == nil || *updated.Items[0].Width != 12 {
		t.Fatalf("deep retry did not replace the budget result: %#v", updated.Items[0])
	}
	if _, err := service.startAnalysis(runtime, analysisScope{Kind: "all", DeepRetry: true}); err == nil {
		t.Fatal("expected deep retry without selected members to be rejected")
	}
}

func TestFindzRecordsUnsupportedAndUnsafeZIPArchivesWithoutMembers(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "not-a-zip.zip"), []byte("not a ZIP"), 0o644); err != nil {
		t.Fatal(err)
	}
	createZipFixture(t, filepath.Join(root, "unsafe.cbz"), []zipFixture{{name: "../outside.png", contents: pngFixture(t, 8, 8)}})

	service, runtime := openTestLibrary(t, root)
	task, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, task.ID)
	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	states := make(map[string]archiveRow)
	for _, archive := range archives.Items {
		states[archive.RelativePath] = archive
	}
	if archive := states["not-a-zip.zip"]; archive.ScanState != "unsupported_archive" || archive.ErrorCode != "unsupported_archive" || archive.MemberCount != 0 {
		t.Fatalf("expected unsupported non-ZIP archive without members, got %#v", archive)
	}
	if archive := states["unsafe.cbz"]; archive.ScanState != "rejected_archive" || archive.ErrorCode != "unsafe_member_path" || archive.MemberCount != 0 {
		t.Fatalf("expected rejected unsafe archive without members, got %#v", archive)
	}
}

func TestFindzFiltersArchivesByTreemapPathPrefix(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "series"), 0o755); err != nil {
		t.Fatal(err)
	}
	createZipFixture(t, filepath.Join(root, "series", "volume.cbz"), []zipFixture{{name: "cover.txt", contents: []byte("series")}})
	createZipFixture(t, filepath.Join(root, "other.cbz"), []zipFixture{{name: "cover.txt", contents: []byte("other")}})
	service, runtime := openTestLibrary(t, root)
	scan, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, scan.ID)

	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, PathPrefix: "series", Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if len(archives.Items) != 1 || archives.Items[0].RelativePath != "series/volume.cbz" {
		t.Fatalf("unexpected prefix-filter result: %#v", archives.Items)
	}
}

func TestFindzFiltersArchivesByStructuredMemberMetadata(t *testing.T) {
	root := t.TempDir()
	createZipFixture(t, filepath.Join(root, "pages.cbz"), []zipFixture{{name: "pages/cover.png", contents: pngFixture(t, 12, 7)}})
	service, runtime := openTestLibrary(t, root)
	scan, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, scan.ID)
	analysis, err := service.startAnalysis(runtime, analysisScope{Kind: "all"})
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, analysis.ID)

	for _, condition := range []ruleNode{
		{ID: "format", Kind: "condition", Field: "actualFormat", Operator: "equal", Value: "png"},
		{ID: "width", Kind: "condition", Field: "width", Operator: "greaterThanInclusive", Value: 12},
		{ID: "path", Kind: "condition", Field: "memberPath", Operator: "contains", Value: "cover"},
	} {
		archives, err := queryArchives(runtime, archiveQueryParams{
			LibraryID: runtime.id,
			Rules:     ruleTree{Format: "xiranite-rule-tree/v1", Version: 1, Root: ruleGroup{ID: "root", Kind: "group", Combinator: "all", Children: []ruleNode{condition}}},
			Page:      pageRequest{Limit: 10},
		})
		if err != nil {
			t.Fatalf("filter %s failed: %v", condition.Field, err)
		}
		if len(archives.Items) != 1 || archives.Items[0].RelativePath != "pages.cbz" {
			t.Fatalf("filter %s did not return the matching archive: %#v", condition.Field, archives.Items)
		}
	}
}

func TestFindzArchivePaginationKeepsTheFilteredTotal(t *testing.T) {
	root := t.TempDir()
	createZipFixture(t, filepath.Join(root, "first.cbz"), []zipFixture{{name: "cover.txt", contents: []byte("first")}})
	createZipFixture(t, filepath.Join(root, "second.cbz"), []zipFixture{{name: "cover.txt", contents: []byte("second")}})
	service, runtime := openTestLibrary(t, root)
	scan, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, scan.ID)

	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 1}})
	if err != nil {
		t.Fatal(err)
	}
	if archives.Total != 2 || len(archives.Items) != 1 || archives.NextCursor == "" {
		t.Fatalf("unexpected paged archives: %#v", archives)
	}
}

func openTestLibrary(t *testing.T, root string) (*findzService, *libraryRuntime) {
	t.Helper()
	runtime, err := openLibraryDatabase(libraryOpenParams{
		LibraryID:    "test-library",
		Root:         root,
		DatabasePath: filepath.Join(t.TempDir(), "findz.sqlite"),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.db.Close() })
	return newFindzService(), runtime
}

func waitForTask(t *testing.T, runtime *libraryRuntime, taskID string) taskRecord {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		task, err := readTask(runtime, taskID)
		if err != nil {
			t.Fatal(err)
		}
		if isTerminalTaskStatus(task.Status) {
			if task.Status == "failed" {
				t.Fatalf("task %s failed: %s", task.ID, task.Message)
			}
			return task
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("task %s did not finish", taskID)
	return taskRecord{}
}

type zipFixture struct {
	name     string
	contents []byte
}

func createZipFixture(t testing.TB, path string, files []zipFixture) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for _, fixture := range files {
		entry, err := writer.Create(fixture.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(fixture.contents); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func createLegacyGBKZipFixture(t testing.TB, path string, memberPath string, contents []byte) {
	t.Helper()
	rawName, _, err := transform.String(simplifiedchinese.GBK.NewEncoder(), memberPath)
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	entry, err := writer.CreateHeader(&zip.FileHeader{Name: rawName, Method: zip.Deflate, NonUTF8: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write(contents); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func pngFixture(t testing.TB, width int, height int) []byte {
	t.Helper()
	imageValue := image.NewRGBA(image.Rect(0, 0, width, height))
	imageValue.Set(0, 0, color.RGBA{R: 64, G: 128, B: 255, A: 255})
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, imageValue); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}
