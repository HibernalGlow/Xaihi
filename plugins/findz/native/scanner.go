package main

import (
	"archive/zip"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/laktak/zfind/filter"
	"github.com/laktak/zfind/find"
)

const zipEncryptionFlag = 1

var defaultZipSafetyLimits = zipSafetyLimits{
	maxEntries:         100_000,
	maxMemberPathBytes: 4_096,
}

type zipSafetyLimits struct {
	maxEntries         int
	maxMemberPathBytes int
}

type zipScanFailure struct {
	code string
	err  error
}

type scheduledScanWork struct {
	taskID          string
	kind            string
	changes         []watcherChange
	verifyUnchanged bool
}

type libraryScanQueue struct {
	mu      sync.Mutex
	active  bool
	pending []scheduledScanWork
}

func (failure *zipScanFailure) Error() string {
	return failure.err.Error()
}

func (limits zipSafetyLimits) validate(files []*zip.File) error {
	if len(files) > limits.maxEntries {
		return &zipScanFailure{code: "member_count_limit_exceeded", err: fmt.Errorf("ZIP contains %d members; Findz allows at most %d", len(files), limits.maxEntries)}
	}
	for _, member := range files {
		if len(member.Name) > limits.maxMemberPathBytes {
			return &zipScanFailure{code: "member_path_length_exceeded", err: fmt.Errorf("ZIP member path exceeds the %d byte limit", limits.maxMemberPathBytes)}
		}
		memberName := displayZipMemberName(member)
		if !isSafeZipMemberPath(memberName) {
			return &zipScanFailure{code: "unsafe_member_path", err: fmt.Errorf("ZIP member path is unsafe: %s", memberName)}
		}
	}
	return nil
}

func isSafeZipMemberPath(memberPath string) bool {
	normalized := filepath.ToSlash(memberPath)
	if normalized == "" || strings.ContainsRune(normalized, 0) || path.IsAbs(normalized) {
		return false
	}
	if len(normalized) >= 2 && normalized[1] == ':' {
		return false
	}
	cleaned := path.Clean(normalized)
	return cleaned != "." && cleaned != ".." && !strings.HasPrefix(cleaned, "../")
}

func (service *findzService) startScan(runtime *libraryRuntime) (taskRecord, error) {
	return service.startScanWithVerification(runtime, false)
}

func (service *findzService) startReconciliation(runtime *libraryRuntime) (taskRecord, error) {
	return service.startScanWithVerification(runtime, true)
}

func (service *findzService) startScanWithVerification(runtime *libraryRuntime, verifyUnchanged bool) (taskRecord, error) {
	task, err := service.createTask(runtime, "scan", scanParams{LibraryID: runtime.id, VerifyUnchanged: verifyUnchanged})
	if err != nil {
		return task, err
	}
	service.installTaskController(task.ID)
	service.enqueueScanWork(runtime, scheduledScanWork{taskID: task.ID, kind: "scan", verifyUnchanged: verifyUnchanged})
	return task, nil
}

func (service *findzService) enqueueScanWork(runtime *libraryRuntime, work scheduledScanWork) {
	queue := &runtime.scanQueue
	queue.mu.Lock()
	if queue.active {
		queue.pending = append(queue.pending, work)
		queue.mu.Unlock()
		_ = updateTask(runtime, work.taskID, "queued", "Waiting for the active library scan.")
		return
	}
	queue.active = true
	queue.mu.Unlock()
	go service.runScheduledScanWork(runtime, work)
}

func (service *findzService) runScheduledScanWork(runtime *libraryRuntime, work scheduledScanWork) {
	defer service.finishScheduledScanWork(runtime, work.taskID)
	controller := service.taskController(work.taskID)
	if controller == nil || !controller.waitUntilRunnable() {
		return
	}
	switch work.kind {
	case "scan":
		service.runFullScan(runtime, work.taskID, controller, work.verifyUnchanged)
	case "watcher":
		service.runWatcherChanges(runtime, work.taskID, work.changes, controller)
	}
}

func (service *findzService) finishScheduledScanWork(runtime *libraryRuntime, taskID string) {
	service.removeTaskController(taskID)
	queue := &runtime.scanQueue
	queue.mu.Lock()
	if len(queue.pending) == 0 {
		queue.active = false
		queue.mu.Unlock()
		return
	}
	next := queue.pending[0]
	queue.pending = queue.pending[1:]
	queue.mu.Unlock()
	go service.runScheduledScanWork(runtime, next)
}

func (service *findzService) runFullScan(runtime *libraryRuntime, taskID string, controller *taskController, verifyUnchanged bool) {
	if err := updateTask(runtime, taskID, "running", "Discovering ZIP and CBZ archives."); err != nil {
		return
	}
	paths, discoveryErrors := discoverArchivesWithZfind(runtime.root)
	_ = setTaskTotals(runtime, taskID, int64(len(paths)), 0)

	scanToken := newTaskID()
	var done int64
	warnings := len(discoveryErrors)
	for _, path := range paths {
		if !controller.waitUntilRunnable() {
			return
		}
		if err := indexArchiveWithVerification(runtime, path, scanToken, verifyUnchanged); err != nil {
			warnings++
		}
		done++
		_ = updateTaskCounters(runtime, taskID, done, 0, 0, int64(warnings))
	}
	if controller.waitUntilRunnable() {
		if _, err := runtime.db.Exec(`DELETE FROM archive WHERE last_seen_scan <> ?`, scanToken); err != nil {
			warnings++
		}
	}
	finishScanTask(runtime, taskID, warnings)
}

func finishScanTask(runtime *libraryRuntime, taskID string, warnings int) {
	status := "completed"
	message := "ZIP index is current."
	if warnings > 0 {
		status = "completed_with_warnings"
		message = fmt.Sprintf("ZIP index completed with %d warning(s).", warnings)
	}
	_ = updateTask(runtime, taskID, status, message)
}

func discoverArchivesWithZfind(root string) ([]string, []error) {
	matcher, err := filter.CreateFilter(`type = "file"`)
	if err != nil {
		return nil, []error{fmt.Errorf("create zfind discovery filter: %w", err)}
	}
	results := make(chan find.FileInfo)
	errors := make(chan string)
	go func() {
		// zfind owns recursive discovery. NoArchive prevents its archive walker from
		// opening every member; Findz indexes ZIP central directories separately.
		find.Walk(root, find.WalkParams{Chan: results, Err: errors, Filter: matcher, NoArchive: true})
		close(results)
		close(errors)
	}()

	paths := make([]string, 0)
	discoveryErrors := make([]error, 0)
	for results != nil || errors != nil {
		select {
		case file, open := <-results:
			if !open {
				results = nil
				continue
			}
			if isFindzArchivePath(file.Path) {
				paths = append(paths, file.Path)
			}
		case message, open := <-errors:
			if !open {
				errors = nil
				continue
			}
			discoveryErrors = append(discoveryErrors, fmt.Errorf("zfind discovery: %s", message))
		}
	}
	sort.Strings(paths)
	return paths, discoveryErrors
}

func (service *findzService) applyWatcherChanges(runtime *libraryRuntime, changes []watcherChange) (taskRecord, error) {
	queue := &runtime.scanQueue
	queue.mu.Lock()
	if pendingCount := len(queue.pending); pendingCount > 0 && queue.pending[pendingCount-1].kind == "watcher" {
		pending := &queue.pending[pendingCount-1]
		pending.changes = coalesceWatcherChanges(pending.changes, changes)
		taskID := pending.taskID
		mergedChanges := append([]watcherChange(nil), pending.changes...)
		queue.mu.Unlock()
		if err := updateTaskParams(runtime, taskID, watcherApplyParams{LibraryID: runtime.id, Changes: mergedChanges}); err != nil {
			return taskRecord{}, err
		}
		return readTask(runtime, taskID)
	}
	queue.mu.Unlock()

	task, err := service.createTask(runtime, "watcher", watcherApplyParams{LibraryID: runtime.id, Changes: changes})
	if err != nil {
		return task, err
	}
	service.installTaskController(task.ID)
	service.enqueueScanWork(runtime, scheduledScanWork{taskID: task.ID, kind: "watcher", changes: coalesceWatcherChanges(nil, changes)})
	return task, nil
}

func coalesceWatcherChanges(existing []watcherChange, incoming []watcherChange) []watcherChange {
	merged := append([]watcherChange(nil), existing...)
	byPath := make(map[string]int, len(merged)+len(incoming))
	for index, change := range merged {
		byPath[change.Path] = index
	}
	for _, change := range incoming {
		if index, exists := byPath[change.Path]; exists {
			merged[index] = change
			continue
		}
		byPath[change.Path] = len(merged)
		merged = append(merged, change)
	}
	return merged
}

func (service *findzService) runWatcherChanges(runtime *libraryRuntime, taskID string, changes []watcherChange, controller *taskController) {
	if err := updateTask(runtime, taskID, "running", "Applying filesystem changes."); err != nil {
		return
	}
	byPath := make(map[string]watcherChange)
	for _, change := range changes {
		absolute, err := filepath.Abs(change.Path)
		if err != nil || !pathWithinRoot(runtime.root, absolute) || !isFindzArchivePath(absolute) {
			continue
		}
		byPath[absolute] = change
	}
	paths := make([]string, 0, len(byPath))
	for path := range byPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	_ = setTaskTotals(runtime, taskID, int64(len(paths)), 0)

	var done int64
	warnings := 0
	for _, path := range paths {
		if !controller.waitUntilRunnable() {
			return
		}
		change := byPath[path]
		if change.Type == "delete" || !pathExists(path) {
			if err := deleteArchiveByPath(runtime, path); err != nil {
				warnings++
			}
		} else if err := indexArchive(runtime, path, newTaskID()); err != nil {
			warnings++
		}
		done++
		_ = updateTaskCounters(runtime, taskID, done, 0, 0, int64(warnings))
	}
	finishScanTask(runtime, taskID, warnings)
}

func (service *findzService) resumeStoredScan(runtime *libraryRuntime, task taskRecord) error {
	var params watcherApplyParams
	if task.Kind == "watcher" {
		if err := readTaskParams(runtime, task.ID, &params); err != nil {
			return err
		}
		service.installTaskController(task.ID)
		service.enqueueScanWork(runtime, scheduledScanWork{taskID: task.ID, kind: "watcher", changes: coalesceWatcherChanges(nil, params.Changes)})
		return nil
	}
	var scan scanParams
	if err := readTaskParams(runtime, task.ID, &scan); err != nil {
		return err
	}
	service.installTaskController(task.ID)
	service.enqueueScanWork(runtime, scheduledScanWork{taskID: task.ID, kind: "scan", verifyUnchanged: scan.VerifyUnchanged})
	return nil
}

func updateTaskParams(runtime *libraryRuntime, taskID string, params interface{}) error {
	raw, err := json.Marshal(params)
	if err != nil {
		return fmt.Errorf("encode Findz task params: %w", err)
	}
	if _, err := runtime.db.Exec(`UPDATE task SET params_json = ? WHERE id = ?`, string(raw), taskID); err != nil {
		return fmt.Errorf("update Findz task params: %w", err)
	}
	return nil
}

func readTaskParams(runtime *libraryRuntime, taskID string, target interface{}) error {
	var raw string
	if err := runtime.db.QueryRow(`SELECT params_json FROM task WHERE id = ?`, taskID).Scan(&raw); err != nil {
		return fmt.Errorf("read Findz task params: %w", err)
	}
	if err := json.Unmarshal([]byte(raw), target); err != nil {
		return fmt.Errorf("decode Findz task params: %w", err)
	}
	return nil
}

func indexArchive(runtime *libraryRuntime, fullPath string, scanToken string) error {
	return indexArchiveWithVerification(runtime, fullPath, scanToken, false)
}

func indexArchiveWithVerification(runtime *libraryRuntime, fullPath string, scanToken string, verifyUnchanged bool) error {
	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("archive is not a regular file: %s", fullPath)
	}
	relativePath, err := filepath.Rel(runtime.root, fullPath)
	if err != nil || relativePath == "." || strings.HasPrefix(relativePath, "..") {
		return fmt.Errorf("archive is outside library root: %s", fullPath)
	}
	relativePath = filepath.ToSlash(relativePath)
	fingerprint := sourceFingerprint(fullPath, info)

	var existingID int64
	var existingFingerprint string
	var existingDirectoryFingerprint string
	err = runtime.db.QueryRow(`SELECT id, source_identity, central_directory_fingerprint FROM archive WHERE relative_path = ?`, relativePath).Scan(&existingID, &existingFingerprint, &existingDirectoryFingerprint)
	if err == nil && existingFingerprint == fingerprint {
		if !verifyUnchanged || existingDirectoryFingerprint == "" {
			return markArchiveSeen(runtime, existingID, scanToken)
		}
		directoryFingerprint, fingerprintErr := zipDirectoryFingerprintForPath(fullPath)
		if fingerprintErr == nil && directoryFingerprint == existingDirectoryFingerprint {
			return markArchiveSeen(runtime, existingID, scanToken)
		}
	}
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("read indexed archive fingerprint: %w", err)
	}

	tx, err := runtime.db.Begin()
	if err != nil {
		return fmt.Errorf("begin archive transaction: %w", err)
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	archiveID, err := upsertArchive(tx, relativePath, fingerprint, info, scanToken, now)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM archive_member WHERE archive_id = ?`, archiveID); err != nil {
		return fmt.Errorf("clear changed archive members: %w", err)
	}

	reader, err := zip.OpenReader(fullPath)
	if err != nil {
		state := "corrupt_archive"
		if errors.Is(err, zip.ErrFormat) {
			state = "unsupported_archive"
		}
		if recordErr := recordArchiveScanFailure(tx, archiveID, state, state, now); recordErr != nil {
			return recordErr
		}
		return fmt.Errorf("open ZIP central directory: %w", err)
	}
	defer reader.Close()
	if err := defaultZipSafetyLimits.validate(reader.File); err != nil {
		failure, ok := err.(*zipScanFailure)
		if !ok {
			return err
		}
		if recordErr := recordArchiveScanFailure(tx, archiveID, "rejected_archive", failure.code, now); recordErr != nil {
			return recordErr
		}
		return failure
	}
	directoryFingerprint := zipDirectoryFingerprint(reader.File)

	statement, err := tx.Prepare(`INSERT INTO archive_member (
		archive_id, entry_index, member_path, crc32, compressed_size, uncompressed_size, compression_method, modified_at, extension,
		is_directory, is_image_candidate, is_nested_archive, is_encrypted, nesting_depth
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare member insert: %w", err)
	}
	defer statement.Close()
	for entryIndex, member := range reader.File {
		if err := insertArchiveMember(statement, archiveID, entryIndex, member); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`UPDATE archive SET scan_state = 'indexed', error_code = '', central_directory_fingerprint = ?, updated_at = ? WHERE id = ?`, directoryFingerprint, now, archiveID); err != nil {
		return fmt.Errorf("mark indexed archive: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit archive index: %w", err)
	}
	return nil
}

func recordArchiveScanFailure(tx *sql.Tx, archiveID int64, state string, code string, now string) error {
	if _, err := tx.Exec(`DELETE FROM archive_member WHERE archive_id = ?`, archiveID); err != nil {
		return fmt.Errorf("clear rejected archive members: %w", err)
	}
	if _, err := tx.Exec(`UPDATE archive SET scan_state = ?, error_code = ?, central_directory_fingerprint = '', updated_at = ? WHERE id = ?`, state, code, now, archiveID); err != nil {
		return fmt.Errorf("record archive scan failure: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit archive scan failure: %w", err)
	}
	return nil
}

func upsertArchive(tx *sql.Tx, relativePath string, fingerprint string, info os.FileInfo, scanToken string, now string) (int64, error) {
	if _, err := tx.Exec(`INSERT INTO archive (relative_path, source_identity, size, mtime_ns, scan_state, last_seen_scan, central_directory_fingerprint, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'indexing', ?, '', ?, ?)
		ON CONFLICT(relative_path) DO UPDATE SET source_identity = excluded.source_identity, size = excluded.size,
		mtime_ns = excluded.mtime_ns, scan_state = 'indexing', error_code = '', last_seen_scan = excluded.last_seen_scan, central_directory_fingerprint = '',
		updated_at = excluded.updated_at`, relativePath, fingerprint, info.Size(), info.ModTime().UnixNano(), scanToken, now, now); err != nil {
		return 0, fmt.Errorf("upsert archive: %w", err)
	}
	var archiveID int64
	if err := tx.QueryRow(`SELECT id FROM archive WHERE relative_path = ?`, relativePath).Scan(&archiveID); err != nil {
		return 0, fmt.Errorf("resolve archive id: %w", err)
	}
	return archiveID, nil
}

func insertArchiveMember(statement *sql.Stmt, archiveID int64, entryIndex int, member *zip.File) error {
	if member.CompressedSize64 > math.MaxInt64 || member.UncompressedSize64 > math.MaxInt64 {
		return fmt.Errorf("ZIP member exceeds SQLite integer range: %s", member.Name)
	}
	memberName := displayZipMemberName(member)
	isDirectory := member.FileInfo().IsDir() || strings.HasSuffix(memberName, "/")
	extension := strings.TrimPrefix(strings.ToLower(filepath.Ext(memberName)), ".")
	_, err := statement.Exec(
		archiveID, entryIndex, strings.TrimSuffix(filepath.ToSlash(memberName), "/"), uint64(member.CRC32), int64(member.CompressedSize64), int64(member.UncompressedSize64),
		member.Method, member.Modified.UTC().Format(time.RFC3339Nano), extension, boolToInt(isDirectory), boolToInt(!isDirectory && isImageExtension(extension)),
		boolToInt(!isDirectory && isFindzArchivePath(memberName)), boolToInt(member.Flags&zipEncryptionFlag != 0), 1,
	)
	if err != nil {
		return fmt.Errorf("insert ZIP member %s: %w", member.Name, err)
	}
	return nil
}

func deleteArchiveByPath(runtime *libraryRuntime, fullPath string) error {
	relativePath, err := filepath.Rel(runtime.root, fullPath)
	if err != nil || strings.HasPrefix(relativePath, "..") {
		return fmt.Errorf("archive is outside library root: %s", fullPath)
	}
	_, err = runtime.db.Exec(`DELETE FROM archive WHERE relative_path = ?`, filepath.ToSlash(relativePath))
	return err
}

func isFindzArchivePath(path string) bool {
	extension := strings.ToLower(filepath.Ext(path))
	return extension == ".zip" || extension == ".cbz"
}

func isImageExtension(extension string) bool {
	switch strings.ToLower(extension) {
	case "jpg", "jpeg", "png", "gif", "webp", "avif", "heif", "heic", "jxl":
		return true
	default:
		return false
	}
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func pathWithinRoot(root string, path string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func sourceFingerprint(path string, info os.FileInfo) string {
	return fmt.Sprintf("%s:%d:%d", fileIdentity(path), info.Size(), info.ModTime().UnixNano())
}

func markArchiveSeen(runtime *libraryRuntime, archiveID int64, scanToken string) error {
	_, err := runtime.db.Exec(`UPDATE archive SET last_seen_scan = ?, updated_at = ? WHERE id = ?`, scanToken, time.Now().UTC().Format(time.RFC3339Nano), archiveID)
	return err
}

func zipDirectoryFingerprintForPath(fullPath string) (string, error) {
	reader, err := zip.OpenReader(fullPath)
	if err != nil {
		return "", err
	}
	defer reader.Close()
	return zipDirectoryFingerprint(reader.File), nil
}

func zipDirectoryFingerprint(files []*zip.File) string {
	hash := sha256.New()
	var buffer [8]byte
	for _, member := range files {
		binary.BigEndian.PutUint64(buffer[:], uint64(len(member.Name)))
		_, _ = hash.Write(buffer[:])
		_, _ = hash.Write([]byte(member.Name))
		binary.BigEndian.PutUint64(buffer[:], uint64(member.CRC32))
		_, _ = hash.Write(buffer[:])
		binary.BigEndian.PutUint64(buffer[:], member.CompressedSize64)
		_, _ = hash.Write(buffer[:])
		binary.BigEndian.PutUint64(buffer[:], member.UncompressedSize64)
		_, _ = hash.Write(buffer[:])
		binary.BigEndian.PutUint64(buffer[:], uint64(member.Method))
		_, _ = hash.Write(buffer[:])
		binary.BigEndian.PutUint64(buffer[:], uint64(member.Flags))
		_, _ = hash.Write(buffer[:])
		binary.BigEndian.PutUint64(buffer[:], uint64(member.Modified.UnixNano()))
		_, _ = hash.Write(buffer[:])
	}
	return hex.EncodeToString(hash.Sum(nil))
}
