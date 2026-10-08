package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFindzReadsCommonImageHeaderAdapters(t *testing.T) {
	imageValue := image.NewRGBA(image.Rect(0, 0, 13, 17))
	imageValue.Set(0, 0, color.RGBA{R: 64, G: 128, B: 255, A: 255})
	var jpegBytes bytes.Buffer
	if err := jpeg.Encode(&jpegBytes, imageValue, nil); err != nil {
		t.Fatal(err)
	}
	var gifBytes bytes.Buffer
	if err := gif.Encode(&gifBytes, imageValue, nil); err != nil {
		t.Fatal(err)
	}
	for _, testCase := range []struct {
		format string
		prefix []byte
	}{
		{format: "png", prefix: pngFixture(t, 13, 17)},
		{format: "jpeg", prefix: jpegBytes.Bytes()},
		{format: "gif", prefix: gifBytes.Bytes()},
	} {
		t.Run(testCase.format, func(t *testing.T) {
			width, height, err := decodeImageDimensions(testCase.format, testCase.prefix)
			if err != nil {
				t.Fatal(err)
			}
			if width != 13 || height != 17 {
				t.Fatalf("expected 13x17 dimensions, got %dx%d", width, height)
			}
		})
	}
}

func TestFindzIndexesNestedAndEncryptedMembers(t *testing.T) {
	root := t.TempDir()
	archivePath := filepath.Join(root, "marked.cbz")
	createZipFixture(t, archivePath, []zipFixture{
		{name: "locked.png", contents: pngFixture(t, 8, 8)},
		{name: "nested/child.zip", contents: []byte("nested archive")},
	})
	markZipMemberEncrypted(t, archivePath, "locked.png")

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
	members, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: archives.Items[0].ID, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if len(members.Items) != 2 {
		t.Fatalf("expected two members, got %#v", members.Items)
	}
	if !members.Items[0].Encrypted || !members.Items[1].NestedArchive {
		t.Fatalf("expected encrypted and nested markers, got %#v", members.Items)
	}
}

func TestFindzValidatesZIPSafetyLimitsBeforeWritingMembers(t *testing.T) {
	limits := zipSafetyLimits{maxEntries: 1, maxMemberPathBytes: 16}
	if err := limits.validate([]*zip.File{{FileHeader: zip.FileHeader{Name: "first.png"}}, {FileHeader: zip.FileHeader{Name: "second.png"}}}); err == nil {
		t.Fatal("expected entry-count safety failure")
	} else if failure, ok := err.(*zipScanFailure); !ok || failure.code != "member_count_limit_exceeded" {
		t.Fatalf("expected entry-count failure, got %#v", err)
	}
	if err := limits.validate([]*zip.File{{FileHeader: zip.FileHeader{Name: "this/member/path/is/too/long.png"}}}); err == nil {
		t.Fatal("expected member-path safety failure")
	} else if failure, ok := err.(*zipScanFailure); !ok || failure.code != "member_path_length_exceeded" {
		t.Fatalf("expected member-path failure, got %#v", err)
	}
	if err := limits.validate([]*zip.File{{FileHeader: zip.FileHeader{Name: "../escape.png"}}}); err == nil {
		t.Fatal("expected unsafe member-path failure")
	} else if failure, ok := err.(*zipScanFailure); !ok || failure.code != "unsafe_member_path" {
		t.Fatalf("expected unsafe path failure, got %#v", err)
	}
}

func TestFindzWatcherReindexesChangedArchivesAndDeletesRemovedPaths(t *testing.T) {
	root := t.TempDir()
	archivePath := filepath.Join(root, "volume.cbz")
	createZipFixture(t, archivePath, []zipFixture{{name: "before.txt", contents: []byte("before")}})
	service, runtime := openTestLibrary(t, root)
	initial, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, initial.ID)

	createZipFixture(t, archivePath, []zipFixture{{name: "after.txt", contents: []byte("after")}})
	changedAt := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(archivePath, changedAt, changedAt); err != nil {
		t.Fatal(err)
	}
	update, err := service.applyWatcherChanges(runtime, []watcherChange{{Path: archivePath, Type: "update"}})
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, update.ID)
	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	members, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: archives.Items[0].ID, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if len(members.Items) != 1 || members.Items[0].MemberPath != "after.txt" {
		t.Fatalf("changed archive retained stale members: %#v", members.Items)
	}

	if err := os.Remove(archivePath); err != nil {
		t.Fatal(err)
	}
	deleted, err := service.applyWatcherChanges(runtime, []watcherChange{{Path: archivePath, Type: "delete"}})
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, deleted.ID)
	archives, err = queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if archives.Total != 0 {
		t.Fatalf("deleted archive remained indexed: %#v", archives)
	}
}

func TestFindzReconciliationVerifiesCentralDirectoryWhenStatFingerprintIsUnchanged(t *testing.T) {
	root := t.TempDir()
	archivePath := filepath.Join(root, "volume.cbz")
	imageBytes := pngFixture(t, 8, 8)
	createZipFixture(t, archivePath, []zipFixture{{name: "old.png", contents: imageBytes}})
	service, runtime := openTestLibrary(t, root)
	initial, err := service.startScan(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, initial.ID)
	before, err := os.Stat(archivePath)
	if err != nil {
		t.Fatal(err)
	}

	createZipFixture(t, archivePath, []zipFixture{{name: "new.png", contents: imageBytes}})
	if err := os.Chtimes(archivePath, before.ModTime(), before.ModTime()); err != nil {
		t.Fatal(err)
	}
	after, err := os.Stat(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	if before.Size() != after.Size() || before.ModTime().UnixNano() != after.ModTime().UnixNano() {
		t.Fatalf("fixture did not preserve the stat fingerprint: before=%#v after=%#v", before, after)
	}

	reconciliation, err := service.startReconciliation(runtime)
	if err != nil {
		t.Fatal(err)
	}
	waitForTask(t, runtime, reconciliation.ID)
	archives, err := queryArchives(runtime, archiveQueryParams{LibraryID: runtime.id, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	members, err := queryMembers(runtime, memberQueryParams{LibraryID: runtime.id, ArchiveID: archives.Items[0].ID, Page: pageRequest{Limit: 10}})
	if err != nil {
		t.Fatal(err)
	}
	if len(members.Items) != 1 || members.Items[0].MemberPath != "new.png" {
		t.Fatalf("central-directory reconciliation retained stale members: %#v", members.Items)
	}
}

func TestFindzQueuesAndCoalescesWatcherChangesBehindAnActiveScan(t *testing.T) {
	root := t.TempDir()
	service, runtime := openTestLibrary(t, root)
	runtime.scanQueue.mu.Lock()
	runtime.scanQueue.active = true
	runtime.scanQueue.mu.Unlock()

	first, err := service.applyWatcherChanges(runtime, []watcherChange{{Path: filepath.Join(root, "first.cbz"), Type: "create"}})
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.applyWatcherChanges(runtime, []watcherChange{
		{Path: filepath.Join(root, "first.cbz"), Type: "update"},
		{Path: filepath.Join(root, "second.cbz"), Type: "delete"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID {
		t.Fatalf("expected watcher events to share a queued task, got %s and %s", first.ID, second.ID)
	}
	var params watcherApplyParams
	if err := readTaskParams(runtime, first.ID, &params); err != nil {
		t.Fatal(err)
	}
	if len(params.Changes) != 2 || params.Changes[0].Type != "update" || params.Changes[1].Type != "delete" {
		t.Fatalf("expected coalesced watcher changes, got %#v", params.Changes)
	}
}

func TestFindzRecoversRunningTasksAndRecordsSchemaMigration(t *testing.T) {
	root := t.TempDir()
	databasePath := filepath.Join(t.TempDir(), "findz.sqlite")
	runtime, err := openLibraryDatabase(libraryOpenParams{LibraryID: "recovery", Root: root, DatabasePath: databasePath})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.db.Exec(`INSERT INTO task (id, kind, status, params_json, message) VALUES ('running-task', 'scan', 'running', '{}', '')`); err != nil {
		t.Fatal(err)
	}
	if err := runtime.db.Close(); err != nil {
		t.Fatal(err)
	}

	recovered, err := openLibraryDatabase(libraryOpenParams{LibraryID: "recovery", Root: root, DatabasePath: databasePath})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = recovered.db.Close() })
	task, err := readTask(recovered, "running-task")
	if err != nil {
		t.Fatal(err)
	}
	if task.Status != "paused" {
		t.Fatalf("expected recovered task to be paused, got %#v", task)
	}
	var migrationCount int
	if err := recovered.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount != latestFindzSchemaVersion {
		t.Fatalf("expected %d applied schema migrations, got %d", latestFindzSchemaVersion, migrationCount)
	}
}

func TestFindzMigratesVersionOneIndexesWithoutDroppingExistingData(t *testing.T) {
	root := t.TempDir()
	databasePath := filepath.Join(t.TempDir(), "legacy-findz.sqlite")
	legacy, err := sql.Open("sqlite3", databasePath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	tx, err := legacy.Begin()
	if err != nil {
		t.Fatal(err)
	}
	if err := applyFindzSchemaV1(tx); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if _, err := tx.Exec(`INSERT INTO archive (relative_path, source_identity, size, mtime_ns, scan_state, last_seen_scan, created_at, updated_at)
		VALUES ('legacy.cbz', 'legacy-source', 1, 1, 'indexed', 'legacy-scan', ?, ?)`, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if _, err := tx.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)`, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}

	runtime, err := openLibraryDatabase(libraryOpenParams{LibraryID: "legacy", Root: root, DatabasePath: databasePath})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.db.Close() })
	for _, column := range []struct {
		table string
		name  string
	}{
		{table: "archive", name: "central_directory_fingerprint"},
		{table: "archive_member", name: "nesting_depth"},
		{table: "image_metadata", name: "aspect_ratio"},
	} {
		if !findzTableHasColumn(t, runtime.db, column.table, column.name) {
			t.Fatalf("migration did not add %s.%s", column.table, column.name)
		}
	}
	var versionTwoCount int
	if err := runtime.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = 2`).Scan(&versionTwoCount); err != nil {
		t.Fatal(err)
	}
	if versionTwoCount != 1 {
		t.Fatalf("expected migration 2 to be recorded once, got %d", versionTwoCount)
	}
	var preservedPath string
	if err := runtime.db.QueryRow(`SELECT relative_path FROM archive WHERE relative_path = 'legacy.cbz'`).Scan(&preservedPath); err != nil {
		t.Fatalf("migration removed legacy archive data: %v", err)
	}
}

func TestFindzFlagsStatisticalImageOutliers(t *testing.T) {
	root := t.TempDir()
	fixtures := make([]zipFixture, 0, 5)
	for index := 0; index < 5; index++ {
		fixtures = append(fixtures, zipFixture{name: "page-" + string(rune('a'+index)) + ".png", contents: pngFixture(t, 8, 8)})
	}
	createZipFixture(t, filepath.Join(root, "pages.cbz"), fixtures)
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
	if _, err := runtime.db.Exec(`INSERT INTO analysis_run (id, policy_revision, started_at, status) VALUES ('outlier-run', ?, ?, 'completed')`, defaultAnalysisPolicy, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	values := []float64{100, 105, 95, 110, 900}
	for index, member := range members.Items {
		if _, err := runtime.db.Exec(`UPDATE archive_member SET compressed_size = ? WHERE id = ?`, int64(values[index]), member.ID); err != nil {
			t.Fatal(err)
		}
		if err := storeImageMetadata(runtime, "outlier-run", member.ID, imageMetadataResult{actualFormat: "png", width: 1_000, height: 1_000, pixels: 1_000_000, bytesPerMegapixel: values[index], status: "complete"}); err != nil {
			t.Fatal(err)
		}
	}
	if err := recomputeAnomalies(runtime); err != nil {
		t.Fatal(err)
	}
	var anomalyCount int
	if err := runtime.db.QueryRow(`SELECT COUNT(*) FROM anomaly WHERE member_id = ? AND kind = 'bytes_per_megapixel_high'`, members.Items[4].ID).Scan(&anomalyCount); err != nil {
		t.Fatal(err)
	}
	if anomalyCount != 1 {
		t.Fatalf("expected only the high-density member to be anomalous, got %d", anomalyCount)
	}
}

func TestFindzProtocolErrorsUseStructuredEnvelopes(t *testing.T) {
	service := newFindzService()
	for _, testCase := range []struct {
		name string
		raw  string
		code string
	}{
		{name: "invalid json", raw: "{", code: "invalid_request"},
		{name: "unsupported version", raw: `{"requestVersion": 99, "requestId": "version", "method": "api.info"}`, code: "unsupported_request_version"},
		{name: "missing method", raw: `{"requestVersion": 1, "requestId": "method"}`, code: "invalid_request"},
		{name: "unsupported method", raw: `{"requestVersion": 1, "requestId": "unsupported", "method": "nope"}`, code: "unsupported_method"},
		{name: "invalid params", raw: `{"requestVersion": 1, "requestId": "params", "method": "library.open", "params": "not-an-object"}`, code: "invalid_params"},
		{name: "closed library", raw: `{"requestVersion": 1, "requestId": "library", "method": "query.archives", "params": {"libraryId": "missing"}}`, code: "library_not_open"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			response := service.handle([]byte(testCase.raw))
			if response.OK || response.Error == nil || response.Error.Code != testCase.code {
				t.Fatalf("expected %s envelope, got %#v", testCase.code, response)
			}
		})
	}
}

func TestFindzCachesSuccessfulMutatingRequestsByID(t *testing.T) {
	root := t.TempDir()
	createZipFixture(t, filepath.Join(root, "sample.cbz"), []zipFixture{{name: "page.png", contents: pngFixture(t, 8, 8)}})
	service := newFindzService()
	libraryID := "idempotency-library"
	databasePath := filepath.Join(t.TempDir(), "findz.sqlite")

	openResponse := service.handle(marshalTestRequest(t, "open-once", "library.open", libraryOpenParams{LibraryID: libraryID, Root: root, DatabasePath: databasePath}))
	if !openResponse.OK {
		t.Fatalf("open library request failed: %#v", openResponse)
	}
	t.Cleanup(func() { _ = service.closeLibrary(libraryID) })

	request := marshalTestRequest(t, "scan-once", "scan.start", scanParams{LibraryID: libraryID})
	first := service.handle(request)
	second := service.handle(request)
	if !first.OK || !second.OK {
		t.Fatalf("expected cached scan response, got %#v then %#v", first, second)
	}
	firstTask, firstOK := first.Result.(taskRecord)
	secondTask, secondOK := second.Result.(taskRecord)
	if !firstOK || !secondOK || firstTask.ID == "" || firstTask.ID != secondTask.ID {
		t.Fatalf("expected the duplicate request to return its original task, got %#v then %#v", first.Result, second.Result)
	}

	runtime, err := service.library(libraryID)
	if err != nil {
		t.Fatal(err)
	}
	var taskCount int
	if err := runtime.db.QueryRow(`SELECT COUNT(*) FROM task WHERE kind = 'scan'`).Scan(&taskCount); err != nil {
		t.Fatal(err)
	}
	if taskCount != 1 {
		t.Fatalf("expected one scan task after a duplicate request, got %d", taskCount)
	}
}

func marshalTestRequest(t *testing.T, requestID string, method string, params interface{}) []byte {
	t.Helper()
	paramsJSON, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	request, err := json.Marshal(requestEnvelope{RequestVersion: findzRequestVersion, RequestID: requestID, Method: method, Params: paramsJSON})
	if err != nil {
		t.Fatal(err)
	}
	return request
}

func markZipMemberEncrypted(t *testing.T, path string, memberName string) {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	updated := 0
	for offset := 0; offset <= len(contents)-30; offset++ {
		signature := binary.LittleEndian.Uint32(contents[offset:])
		flagsOffset, nameOffset, nameLengthOffset := 0, 0, 0
		switch signature {
		case 0x04034b50:
			flagsOffset, nameLengthOffset, nameOffset = offset+6, offset+26, offset+30
		case 0x02014b50:
			if offset > len(contents)-46 {
				continue
			}
			flagsOffset, nameLengthOffset, nameOffset = offset+8, offset+28, offset+46
		default:
			continue
		}
		nameLength := int(binary.LittleEndian.Uint16(contents[nameLengthOffset:]))
		if nameOffset+nameLength > len(contents) || string(contents[nameOffset:nameOffset+nameLength]) != memberName {
			continue
		}
		flags := binary.LittleEndian.Uint16(contents[flagsOffset:]) | zipEncryptionFlag
		binary.LittleEndian.PutUint16(contents[flagsOffset:], flags)
		updated++
	}
	if updated != 2 {
		t.Fatalf("expected local and central ZIP encryption flags for %s, updated %d headers", memberName, updated)
	}
	if err := os.WriteFile(path, contents, 0o644); err != nil {
		t.Fatal(err)
	}
}

func findzTableHasColumn(t *testing.T, db *sql.DB, table string, name string) bool {
	t.Helper()
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var ordinal int
		var columnName string
		var columnType string
		var notNull int
		var defaultValue interface{}
		var primaryKey int
		if err := rows.Scan(&ordinal, &columnName, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatal(err)
		}
		if columnName == name {
			return true
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return false
}
