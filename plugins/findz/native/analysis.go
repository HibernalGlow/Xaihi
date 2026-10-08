package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/bep/imagemeta"
)

const (
	standardImagePrefixBudget = 512 * 1024
	isoImagePrefixBudget      = 4 * 1024 * 1024
	deepStandardPrefixBudget  = 8 * 1024 * 1024
	deepISOImagePrefixBudget  = 16 * 1024 * 1024
	metadataSniffBufferSize   = 64
)

func (service *findzService) startAnalysis(runtime *libraryRuntime, scope analysisScope) (taskRecord, error) {
	if scope.Kind == "" {
		scope.Kind = "all"
	}
	if scope.Kind != "all" && scope.Kind != "archives" && scope.Kind != "members" {
		return taskRecord{}, fmt.Errorf("unsupported analysis scope: %s", scope.Kind)
	}
	if scope.DeepRetry && (scope.Kind != "members" || len(scope.MemberIDs) == 0) {
		return taskRecord{}, fmt.Errorf("deep retry requires one or more selected members")
	}
	// Reserve the global analysis slot before creating its persisted work. Creating
	// the queue can take long enough for another request to otherwise race through.
	service.mu.Lock()
	if service.activeImageAnalysisTask != "" {
		activeTaskID := service.activeImageAnalysisTask
		service.mu.Unlock()
		return taskRecord{}, fmt.Errorf("image analysis is already running: %s", activeTaskID)
	}
	task, err := service.createTask(runtime, "analysis", analysisStartParams{LibraryID: runtime.id, Scope: scope})
	if err != nil {
		service.mu.Unlock()
		return task, err
	}
	service.activeImageAnalysisTask = task.ID
	service.mu.Unlock()
	if err := enqueueAnalysis(runtime, task.ID, scope); err != nil {
		_ = updateTask(runtime, task.ID, "failed", err.Error())
		service.finishAnalysisTask(task.ID)
		return task, err
	}
	controller := service.installTaskController(task.ID)
	go service.runAnalysis(runtime, task.ID, scope, controller)
	return readTask(runtime, task.ID)
}

func (service *findzService) resumeStoredAnalysis(runtime *libraryRuntime, task taskRecord) error {
	var params analysisStartParams
	if err := readTaskParams(runtime, task.ID, &params); err != nil {
		return err
	}
	service.mu.Lock()
	if service.activeImageAnalysisTask != "" && service.activeImageAnalysisTask != task.ID {
		activeTaskID := service.activeImageAnalysisTask
		service.mu.Unlock()
		return fmt.Errorf("image analysis is already running: %s", activeTaskID)
	}
	service.activeImageAnalysisTask = task.ID
	service.mu.Unlock()
	controller := service.installTaskController(task.ID)
	if err := updateTask(runtime, task.ID, "running", "Resumed image analysis."); err != nil {
		service.finishAnalysisTask(task.ID)
		return err
	}
	go service.runAnalysis(runtime, task.ID, params.Scope, controller)
	return nil
}

func enqueueAnalysis(runtime *libraryRuntime, taskID string, scope analysisScope) error {
	tx, err := runtime.db.Begin()
	if err != nil {
		return fmt.Errorf("begin analysis queue transaction: %w", err)
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.Exec(`INSERT INTO analysis_run (id, policy_revision, started_at, status) VALUES (?, ?, ?, 'queued')`, taskID, defaultAnalysisPolicy, now); err != nil {
		return fmt.Errorf("create analysis run: %w", err)
	}
	where := `m.is_image_candidate = 1 AND (metadata.member_id IS NULL OR metadata.status <> 'complete')`
	if scope.DeepRetry {
		where = `m.is_image_candidate = 1 AND metadata.status = 'metadata_budget_exceeded'`
	}
	args := []interface{}{defaultAnalysisPolicy}
	if scope.Kind == "archives" {
		if len(scope.ArchiveIDs) == 0 {
			where += " AND 1 = 0"
		} else {
			placeholders := make([]string, 0, len(scope.ArchiveIDs))
			for _, archiveID := range scope.ArchiveIDs {
				placeholders = append(placeholders, "?")
				args = append(args, archiveID)
			}
			where += " AND m.archive_id IN (" + strings.Join(placeholders, ",") + ")"
		}
	}
	if scope.Kind == "members" {
		if len(scope.MemberIDs) == 0 {
			where += " AND 1 = 0"
		} else {
			placeholders := make([]string, 0, len(scope.MemberIDs))
			for _, memberID := range scope.MemberIDs {
				placeholders = append(placeholders, "?")
				args = append(args, memberID)
			}
			where += " AND m.id IN (" + strings.Join(placeholders, ",") + ")"
		}
	}
	insert := `INSERT INTO analysis_queue (task_id, archive_id, member_id, status)
		SELECT ?, m.archive_id, m.id, CASE WHEN m.is_encrypted = 1 THEN 'skipped' ELSE 'queued' END
		FROM archive_member m
		LEFT JOIN image_metadata metadata ON metadata.member_id = m.id AND metadata.policy_revision = ?
		WHERE ` + where
	insertArgs := append([]interface{}{taskID}, args...)
	if _, err := tx.Exec(insert, insertArgs...); err != nil {
		return fmt.Errorf("create analysis queue: %w", err)
	}
	var archiveCount int64
	var memberCount int64
	if err := tx.QueryRow(`SELECT COUNT(DISTINCT archive_id), COUNT(*) FROM analysis_queue WHERE task_id = ?`, taskID).Scan(&archiveCount, &memberCount); err != nil {
		return fmt.Errorf("count analysis queue: %w", err)
	}
	if _, err := tx.Exec(`UPDATE task SET total_archives = ?, total_members = ?, skipped_members = (SELECT COUNT(*) FROM analysis_queue WHERE task_id = ? AND status = 'skipped') WHERE id = ?`, archiveCount, memberCount, taskID, taskID); err != nil {
		return fmt.Errorf("set analysis totals: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit analysis queue: %w", err)
	}
	return nil
}

func (service *findzService) runAnalysis(runtime *libraryRuntime, taskID string, scope analysisScope, controller *taskController) {
	defer service.finishAnalysisTask(taskID)
	message := "Reading image headers."
	if scope.DeepRetry {
		message = "Retrying image headers with the deep read budget."
	}
	if err := updateTask(runtime, taskID, "running", message); err != nil {
		return
	}
	archiveIDs, err := queuedArchiveIDs(runtime, taskID)
	if err != nil {
		_ = updateTask(runtime, taskID, "failed", err.Error())
		return
	}
	var doneArchives int64
	var doneMembers int64
	var skippedMembers int64
	var failedMembers int64
	for _, archiveID := range archiveIDs {
		if !controller.waitUntilRunnable() {
			return
		}
		done, skipped, failed := analyzeArchive(runtime, taskID, archiveID, scope.DeepRetry, controller)
		doneMembers += done
		skippedMembers += skipped
		failedMembers += failed
		doneArchives++
		_ = updateTaskCounters(runtime, taskID, doneArchives, doneMembers, skippedMembers, failedMembers)
	}
	if !controller.waitUntilRunnable() {
		return
	}
	if err := recomputeAnomalies(runtime); err != nil {
		_ = updateTask(runtime, taskID, "failed", err.Error())
		return
	}
	status := "completed"
	message = "Image analysis completed."
	if failedMembers > 0 {
		status = "completed_with_warnings"
		message = fmt.Sprintf("Image analysis completed with %d unreadable member(s).", failedMembers)
	}
	_, _ = runtime.db.Exec(`UPDATE analysis_run SET finished_at = ?, status = ? WHERE id = ?`, time.Now().UTC().Format(time.RFC3339Nano), status, taskID)
	_ = updateTask(runtime, taskID, status, message)
}

func (service *findzService) finishAnalysisTask(taskID string) {
	service.mu.Lock()
	if service.activeImageAnalysisTask == taskID {
		service.activeImageAnalysisTask = ""
	}
	delete(service.taskControls, taskID)
	service.mu.Unlock()
}

func queuedArchiveIDs(runtime *libraryRuntime, taskID string) ([]int64, error) {
	rows, err := runtime.db.Query(`SELECT DISTINCT archive_id FROM analysis_queue WHERE task_id = ? AND status = 'queued' ORDER BY archive_id`, taskID)
	if err != nil {
		return nil, fmt.Errorf("read analysis archives: %w", err)
	}
	defer rows.Close()
	archiveIDs := make([]int64, 0)
	for rows.Next() {
		var archiveID int64
		if err := rows.Scan(&archiveID); err != nil {
			return nil, fmt.Errorf("scan analysis archive id: %w", err)
		}
		archiveIDs = append(archiveIDs, archiveID)
	}
	return archiveIDs, rows.Err()
}

type queuedMember struct {
	memberID       int64
	entryIndex     int
	memberPath     string
	extension      string
	compressedSize int64
	unencrypted    bool
}

func analyzeArchive(runtime *libraryRuntime, taskID string, archiveID int64, deepRetry bool, controller *taskController) (done int64, skipped int64, failed int64) {
	archivePath, members, err := queuedMembersForArchive(runtime, taskID, archiveID)
	if err != nil {
		return 0, 0, 1
	}
	reader, err := zip.OpenReader(filepath.Join(runtime.root, filepath.FromSlash(archivePath)))
	if err != nil {
		for _, member := range members {
			_ = storeImageMetadata(runtime, taskID, member.memberID, imageMetadataResult{status: "parser_failure", errorCode: "corrupt_archive"})
			_ = updateQueueStatus(runtime, taskID, member.memberID, "failed")
		}
		return 0, 0, int64(len(members))
	}
	defer reader.Close()

	for _, member := range members {
		if !controller.waitUntilRunnable() {
			return done, skipped, failed
		}
		if !member.unencrypted {
			_ = storeImageMetadata(runtime, taskID, member.memberID, imageMetadataResult{status: "encrypted_member", errorCode: "encrypted_member"})
			_ = updateQueueStatus(runtime, taskID, member.memberID, "skipped")
			skipped++
			continue
		}
		if member.entryIndex < 0 || member.entryIndex >= len(reader.File) {
			_ = storeImageMetadata(runtime, taskID, member.memberID, imageMetadataResult{status: "parser_failure", errorCode: "missing_member"})
			_ = updateQueueStatus(runtime, taskID, member.memberID, "failed")
			failed++
			continue
		}
		result := analyzeZipMemberWithBudget(reader.File[member.entryIndex], member.extension, member.compressedSize, deepRetry)
		_ = storeImageMetadata(runtime, taskID, member.memberID, result)
		queueStatus := "completed"
		if result.status != "complete" && result.status != "unsupported_format" && result.status != "metadata_budget_exceeded" {
			queueStatus = "failed"
			failed++
		} else if result.status != "complete" {
			queueStatus = "skipped"
			skipped++
		} else {
			done++
		}
		_ = updateQueueStatus(runtime, taskID, member.memberID, queueStatus)
	}
	return done, skipped, failed
}

func queuedMembersForArchive(runtime *libraryRuntime, taskID string, archiveID int64) (string, []queuedMember, error) {
	rows, err := runtime.db.Query(`SELECT a.relative_path, m.id, m.entry_index, m.member_path, m.extension, m.compressed_size, m.is_encrypted
		FROM analysis_queue q
		JOIN archive_member m ON m.id = q.member_id
		JOIN archive a ON a.id = m.archive_id
		WHERE q.task_id = ? AND q.archive_id = ? AND q.status = 'queued'
		ORDER BY m.entry_index`, taskID, archiveID)
	if err != nil {
		return "", nil, fmt.Errorf("read queued archive members: %w", err)
	}
	defer rows.Close()
	var archivePath string
	members := make([]queuedMember, 0)
	for rows.Next() {
		var member queuedMember
		var encrypted int
		if err := rows.Scan(&archivePath, &member.memberID, &member.entryIndex, &member.memberPath, &member.extension, &member.compressedSize, &encrypted); err != nil {
			return "", nil, fmt.Errorf("scan queued archive member: %w", err)
		}
		member.unencrypted = encrypted == 0
		members = append(members, member)
	}
	return archivePath, members, rows.Err()
}

type imageMetadataResult struct {
	actualFormat      string
	width             int64
	height            int64
	pixels            int64
	aspectRatio       float64
	bytesPerMegapixel float64
	animated          *bool
	status            string
	errorCode         string
	extensionMismatch bool
}

func analyzeZipMember(member *zip.File, extension string, compressedSize int64) imageMetadataResult {
	return analyzeZipMemberWithBudget(member, extension, compressedSize, false)
}

func analyzeZipMemberWithBudget(member *zip.File, extension string, compressedSize int64, deepRetry bool) imageMetadataResult {
	reader, err := member.Open()
	if err != nil {
		return imageMetadataResult{status: "parser_failure", errorCode: "member_open_failed"}
	}
	defer reader.Close()
	return analyzeImageStreamWithBudget(reader, extension, compressedSize, deepRetry)
}

func analyzeImageStream(reader io.Reader, extension string, compressedSize int64) imageMetadataResult {
	return analyzeImageStreamWithBudget(reader, extension, compressedSize, false)
}

func analyzeImageStreamWithBudget(reader io.Reader, extension string, compressedSize int64, deepRetry bool) imageMetadataResult {
	hintBudget := prefixBudgetForAnalysis(extension, deepRetry)
	bounded := &metadataBudgetReader{reader: reader, remaining: hintBudget}
	buffered := bufio.NewReaderSize(bounded, metadataSniffBufferSize)
	format := detectImageFormat(peekImageSignature(buffered))
	if format == "jxl" {
		return imageMetadataResult{actualFormat: format, status: "unsupported_format", errorCode: "unsupported_format", extensionMismatch: !extensionMatchesFormat(extension, format)}
	}
	if format == "" {
		return imageMetadataResult{status: "unsupported_format", errorCode: "unsupported_format"}
	}
	budget := prefixBudgetForFormat(format, deepRetry)
	bounded.setTotalBudget(hintBudget, budget)

	var width int64
	var height int64
	var err error
	if isStreamingStandardFormat(format) {
		width, height, err = decodeImageDimensionsFromReader(format, buffered)
	} else {
		prefix, _, readErr := readPrefix(buffered, budget)
		if readErr != nil {
			return imageMetadataResult{actualFormat: format, status: "parser_failure", errorCode: "member_read_failed", extensionMismatch: !extensionMatchesFormat(extension, format)}
		}
		width, height, err = decodeImageDimensions(format, prefix)
	}
	if err != nil {
		if bounded.exhausted {
			return imageMetadataResult{actualFormat: format, status: "metadata_budget_exceeded", errorCode: "metadata_budget_exceeded", extensionMismatch: !extensionMatchesFormat(extension, format)}
		}
		return imageMetadataResult{actualFormat: format, status: "parser_failure", errorCode: "invalid_image_header", extensionMismatch: !extensionMatchesFormat(extension, format)}
	}
	pixels, overflow := safePixelCount(width, height)
	if overflow {
		return imageMetadataResult{actualFormat: format, status: "parser_failure", errorCode: "invalid_dimensions", extensionMismatch: !extensionMatchesFormat(extension, format)}
	}
	return imageMetadataResult{
		actualFormat: format, width: width, height: height, pixels: pixels,
		aspectRatio: float64(width) / float64(height), bytesPerMegapixel: bytesPerMegapixel(compressedSize, pixels), status: "complete",
		extensionMismatch: !extensionMatchesFormat(extension, format),
	}
}

type metadataBudgetReader struct {
	reader    io.Reader
	remaining int64
	exhausted bool
}

func (reader *metadataBudgetReader) setTotalBudget(previousTotal int64, total int64) {
	consumed := previousTotal - reader.remaining
	reader.remaining = total - consumed
	if reader.remaining < 0 {
		reader.remaining = 0
	}
	reader.exhausted = reader.remaining == 0
}

func (reader *metadataBudgetReader) Read(buffer []byte) (int, error) {
	if reader.remaining <= 0 {
		reader.exhausted = true
		return 0, io.EOF
	}
	if int64(len(buffer)) > reader.remaining {
		buffer = buffer[:reader.remaining]
	}
	read, err := reader.reader.Read(buffer)
	reader.remaining -= int64(read)
	if reader.remaining == 0 {
		reader.exhausted = true
	}
	return read, err
}

func peekImageSignature(reader *bufio.Reader) []byte {
	prefix, _ := reader.Peek(12)
	return prefix
}

func isStreamingStandardFormat(format string) bool {
	switch format {
	case "gif", "jpeg", "png":
		return true
	default:
		return false
	}
}

func readPrefix(reader io.Reader, budget int64) ([]byte, bool, error) {
	limited := io.LimitReader(reader, budget)
	prefix, err := io.ReadAll(limited)
	if err != nil {
		return nil, false, err
	}
	return prefix, int64(len(prefix)) == budget, nil
}

func prefixBudgetForExtension(extension string) int64 {
	return prefixBudgetForAnalysis(extension, false)
}

func prefixBudgetForAnalysis(extension string, deepRetry bool) int64 {
	switch strings.ToLower(extension) {
	case "avif", "heif", "heic":
		return prefixBudgetForFormat("avif", deepRetry)
	default:
		return prefixBudgetForFormat("standard", deepRetry)
	}
}

func prefixBudgetForFormat(format string, deepRetry bool) int64 {
	isISOFormat := format == "avif" || format == "heif"
	if isISOFormat {
		if deepRetry {
			return deepISOImagePrefixBudget
		}
		return isoImagePrefixBudget
	}
	if deepRetry {
		return deepStandardPrefixBudget
	}
	return standardImagePrefixBudget
}

func decodeImageDimensions(format string, prefix []byte) (int64, int64, error) {
	switch format {
	case "gif":
		return decodeImageDimensionsFromReader(format, bytes.NewReader(prefix))
	case "jpeg":
		return decodeImageDimensionsFromReader(format, bytes.NewReader(prefix))
	case "png":
		return decodeImageDimensionsFromReader(format, bytes.NewReader(prefix))
	}
	imageFormat := imagemeta.ImageFormatAuto
	switch format {
	case "webp":
		imageFormat = imagemeta.WebP
	case "avif":
		imageFormat = imagemeta.AVIF
	case "heif":
		imageFormat = imagemeta.HEIF
	default:
		return 0, 0, fmt.Errorf("unsupported image format")
	}
	result, err := imagemeta.Decode(imagemeta.Options{R: bytes.NewReader(prefix), ImageFormat: imageFormat, Sources: imagemeta.CONFIG})
	if err != nil {
		return 0, 0, err
	}
	if result.ImageConfig.Width <= 0 || result.ImageConfig.Height <= 0 {
		return 0, 0, fmt.Errorf("image dimensions were not found")
	}
	return int64(result.ImageConfig.Width), int64(result.ImageConfig.Height), nil
}

func decodeImageDimensionsFromReader(format string, reader io.Reader) (int64, int64, error) {
	switch format {
	case "gif":
		return decodeConfigDimensions(gif.DecodeConfig, reader)
	case "jpeg":
		return decodeConfigDimensions(jpeg.DecodeConfig, reader)
	case "png":
		return decodeConfigDimensions(png.DecodeConfig, reader)
	default:
		return 0, 0, fmt.Errorf("unsupported streaming image format")
	}
}

func decodeConfigDimensions(decode func(io.Reader) (image.Config, error), reader io.Reader) (int64, int64, error) {
	config, err := decode(reader)
	return int64(config.Width), int64(config.Height), err
}

func detectImageFormat(prefix []byte) string {
	if len(prefix) >= 3 && prefix[0] == 0xff && prefix[1] == 0xd8 && prefix[2] == 0xff {
		return "jpeg"
	}
	if len(prefix) >= 8 && bytes.Equal(prefix[:8], []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}) {
		return "png"
	}
	if len(prefix) >= 6 && (bytes.Equal(prefix[:6], []byte("GIF87a")) || bytes.Equal(prefix[:6], []byte("GIF89a"))) {
		return "gif"
	}
	if len(prefix) >= 12 && string(prefix[:4]) == "RIFF" && string(prefix[8:12]) == "WEBP" {
		return "webp"
	}
	if len(prefix) >= 12 && string(prefix[4:8]) == "ftyp" {
		brand := string(prefix[8:12])
		switch brand {
		case "avif", "avis":
			return "avif"
		case "heic", "heix", "hevc", "hevx", "mif1", "msf1":
			return "heif"
		case "jxl ", "jxll":
			return "jxl"
		}
	}
	if len(prefix) >= 2 && prefix[0] == 0xff && prefix[1] == 0x0a {
		return "jxl"
	}
	return ""
}

func extensionMatchesFormat(extension string, format string) bool {
	extension = strings.ToLower(extension)
	switch format {
	case "jpeg":
		return extension == "jpg" || extension == "jpeg"
	case "heif":
		return extension == "heif" || extension == "heic"
	default:
		return extension == format
	}
}

func safePixelCount(width int64, height int64) (int64, bool) {
	if width <= 0 || height <= 0 || width > math.MaxInt64/height {
		return 0, true
	}
	return width * height, false
}

func bytesPerMegapixel(bytes int64, pixels int64) float64 {
	if pixels <= 0 {
		return 0
	}
	return float64(bytes) * 1_000_000 / float64(pixels)
}

func storeImageMetadata(runtime *libraryRuntime, taskID string, memberID int64, result imageMetadataResult) error {
	_, err := runtime.db.Exec(`INSERT INTO image_metadata (
		member_id, analysis_run_id, policy_revision, actual_format, width, height, pixels, bytes_per_megapixel,
		aspect_ratio, animated, extension_mismatch, status, error_code, updated_at
	) VALUES (?, ?, ?, ?, NULLIF(?, 0), NULLIF(?, 0), NULLIF(?, 0), NULLIF(?, 0), NULLIF(?, 0), ?, ?, ?, ?, ?)
	ON CONFLICT(member_id) DO UPDATE SET analysis_run_id = excluded.analysis_run_id, policy_revision = excluded.policy_revision,
		actual_format = excluded.actual_format, width = excluded.width, height = excluded.height, pixels = excluded.pixels,
		bytes_per_megapixel = excluded.bytes_per_megapixel, aspect_ratio = excluded.aspect_ratio, animated = excluded.animated,
		extension_mismatch = excluded.extension_mismatch, status = excluded.status, error_code = excluded.error_code, updated_at = excluded.updated_at`,
		memberID, taskID, defaultAnalysisPolicy, result.actualFormat, result.width, result.height, result.pixels, result.bytesPerMegapixel,
		result.aspectRatio, boolPointerToNullableInt(result.animated), boolToInt(result.extensionMismatch), result.status, result.errorCode, time.Now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("store image metadata: %w", err)
	}
	return nil
}

func boolPointerToNullableInt(value *bool) interface{} {
	if value == nil {
		return nil
	}
	return boolToInt(*value)
}

func updateQueueStatus(runtime *libraryRuntime, taskID string, memberID int64, status string) error {
	_, err := runtime.db.Exec(`UPDATE analysis_queue SET status = ? WHERE task_id = ? AND member_id = ?`, status, taskID, memberID)
	return err
}

type anomalyCandidate struct {
	memberID             int64
	actualFormat         string
	pixels               int64
	bytesPerMegapixel    float64
	compressedMemberSize int64
}

func recomputeAnomalies(runtime *libraryRuntime) error {
	if _, err := runtime.db.Exec(`DELETE FROM anomaly WHERE policy_revision = ?`, defaultAnalysisPolicy); err != nil {
		return fmt.Errorf("clear prior anomalies: %w", err)
	}
	rows, err := runtime.db.Query(`SELECT m.id, metadata.actual_format, metadata.pixels, metadata.bytes_per_megapixel, m.compressed_size
		FROM image_metadata metadata
		JOIN archive_member m ON m.id = metadata.member_id
		WHERE metadata.policy_revision = ? AND metadata.status = 'complete' AND metadata.pixels > 0`, defaultAnalysisPolicy)
	if err != nil {
		return fmt.Errorf("read anomaly candidates: %w", err)
	}
	defer rows.Close()
	cohorts := make(map[string][]anomalyCandidate)
	for rows.Next() {
		var candidate anomalyCandidate
		if err := rows.Scan(&candidate.memberID, &candidate.actualFormat, &candidate.pixels, &candidate.bytesPerMegapixel, &candidate.compressedMemberSize); err != nil {
			return fmt.Errorf("scan anomaly candidate: %w", err)
		}
		cohort := candidate.actualFormat + ":" + pixelBucket(candidate.pixels)
		cohorts[cohort] = append(cohorts[cohort], candidate)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for cohort, candidates := range cohorts {
		if len(candidates) < 4 {
			continue
		}
		values := make([]float64, len(candidates))
		for index, candidate := range candidates {
			values[index] = candidate.bytesPerMegapixel
		}
		cohortMedian := median(values)
		deviations := make([]float64, len(values))
		for index, value := range values {
			deviations[index] = math.Abs(value - cohortMedian)
		}
		mad := median(deviations)
		for _, candidate := range candidates {
			score := robustScore(candidate.bytesPerMegapixel, cohortMedian, mad)
			if score < 3.5 {
				continue
			}
			estimated := int64(math.Max(0, float64(candidate.compressedMemberSize)-cohortMedian*float64(candidate.pixels)/1_000_000))
			if _, err := runtime.db.Exec(`INSERT INTO anomaly (member_id, policy_revision, kind, cohort, score, baseline_bytes_per_megapixel, estimated_savings_bytes)
				VALUES (?, ?, 'bytes_per_megapixel_high', ?, ?, ?, ?)`, candidate.memberID, defaultAnalysisPolicy, cohort, score, cohortMedian, estimated); err != nil {
				return fmt.Errorf("write anomaly: %w", err)
			}
		}
	}
	return nil
}

func pixelBucket(pixels int64) string {
	megapixels := (pixels + 999_999) / 1_000_000
	if megapixels < 1 {
		megapixels = 1
	}
	return fmt.Sprintf("%dmp", megapixels)
}

func median(values []float64) float64 {
	copyValues := append([]float64(nil), values...)
	sort.Float64s(copyValues)
	middle := len(copyValues) / 2
	if len(copyValues)%2 == 1 {
		return copyValues[middle]
	}
	return (copyValues[middle-1] + copyValues[middle]) / 2
}

func robustScore(value float64, median float64, mad float64) float64 {
	if value <= median {
		return 0
	}
	if mad == 0 {
		return math.Inf(1)
	}
	return 0.6745 * (value - median) / mad
}
