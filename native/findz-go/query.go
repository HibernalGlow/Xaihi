package main

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

type archiveCursor struct {
	Value interface{} `json:"value"`
	ID    int64       `json:"id"`
}

type archiveSort struct {
	column  string
	numeric bool
}

func queryArchives(runtime *libraryRuntime, params archiveQueryParams) (pagedResult[archiveRow], error) {
	page, err := normalizedPage(params.Page)
	if err != nil {
		return pagedResult[archiveRow]{}, err
	}
	sort := archiveSortFor(params.SortBy)
	where, args, err := archiveFilters(params.Text, params.PathPrefix, params.Rules)
	if err != nil {
		return pagedResult[archiveRow]{}, err
	}
	countWhere := where
	countArgs := append([]interface{}(nil), args...)
	cursor, err := decodeArchiveCursor(params.Page.Cursor)
	if err != nil {
		return pagedResult[archiveRow]{}, err
	}
	if cursor != nil {
		comparison := ">"
		if params.SortDesc {
			comparison = "<"
		}
		where += fmt.Sprintf(" AND (archive_metrics.%s %s ? OR (archive_metrics.%s = ? AND archive_metrics.id > ?))", sort.column, comparison, sort.column)
		args = append(args, cursor.Value, cursor.Value, cursor.ID)
	}
	order := "ASC"
	if params.SortDesc {
		order = "DESC"
	}
	query := archiveMetricsCTE + `
		SELECT archive_metrics.id, archive_metrics.relative_path, archive_metrics.size, archive_metrics.mtime_ns, archive_metrics.scan_state, archive_metrics.error_code, archive_metrics.member_count, archive_metrics.image_member_count, archive_metrics.analyzed_image_count,
		archive_metrics.compressed_image_bytes, archive_metrics.average_image_bytes, archive_metrics.average_bytes_per_megapixel, archive_metrics.anomaly_count, archive_metrics.estimated_savings_bytes, archive_metrics.` + sort.column + ` AS sort_value
		FROM metrics AS archive_metrics WHERE ` + where + ` ORDER BY archive_metrics.` + sort.column + ` ` + order + `, archive_metrics.id ASC LIMIT ?`
	args = append(args, page.Limit+1)
	rows, err := runtime.db.Query(query, args...)
	if err != nil {
		return pagedResult[archiveRow]{}, fmt.Errorf("query archives: %w", err)
	}
	defer rows.Close()
	result := pagedResult[archiveRow]{Items: make([]archiveRow, 0, page.Limit)}
	var lastSortValue interface{}
	for rows.Next() {
		row, sortValue, err := scanArchiveRow(rows, sort.numeric)
		if err != nil {
			return result, err
		}
		if len(result.Items) == page.Limit {
			result.NextCursor, err = encodeArchiveCursor(archiveCursor{Value: lastSortValue, ID: result.Items[len(result.Items)-1].ID})
			if err != nil {
				return result, err
			}
			break
		}
		result.Items = append(result.Items, row)
		lastSortValue = sortValue
	}
	if err := rows.Err(); err != nil {
		return result, fmt.Errorf("read archive query rows: %w", err)
	}
	if err := runtime.db.QueryRow(archiveMetricsCTE+` SELECT COUNT(*) FROM metrics AS archive_metrics WHERE `+countWhere, countArgs...).Scan(&result.Total); err != nil {
		return result, fmt.Errorf("count archive query rows: %w", err)
	}
	if err := populateArchiveMedians(runtime, result.Items); err != nil {
		return result, err
	}
	return result, nil
}

const archiveMetricsCTE = `WITH metrics AS (
	SELECT
		a.id,
		a.relative_path,
		a.size,
		a.mtime_ns,
		a.scan_state,
		a.error_code,
		COUNT(m.id) AS member_count,
		SUM(CASE WHEN m.is_image_candidate = 1 THEN 1 ELSE 0 END) AS image_member_count,
		SUM(CASE WHEN metadata.status = 'complete' THEN 1 ELSE 0 END) AS analyzed_image_count,
		COALESCE(SUM(CASE WHEN m.is_image_candidate = 1 THEN m.compressed_size ELSE 0 END), 0) AS compressed_image_bytes,
		COALESCE(AVG(CASE WHEN metadata.status = 'complete' THEN m.compressed_size END), 0) AS average_image_bytes,
		COALESCE(AVG(CASE WHEN metadata.status = 'complete' THEN metadata.bytes_per_megapixel END), 0) AS average_bytes_per_megapixel,
		COALESCE(SUM(anomalies.anomaly_count), 0) AS anomaly_count,
		COALESCE(SUM(anomalies.estimated_savings_bytes), 0) AS estimated_savings_bytes
	FROM archive a
	LEFT JOIN archive_member m ON m.archive_id = a.id
	LEFT JOIN image_metadata metadata ON metadata.member_id = m.id AND metadata.policy_revision = 'image-header-v1'
	LEFT JOIN (
		SELECT member_id, COUNT(*) AS anomaly_count, SUM(estimated_savings_bytes) AS estimated_savings_bytes
		FROM anomaly WHERE policy_revision = 'image-header-v1' GROUP BY member_id
	) anomalies ON anomalies.member_id = m.id
	GROUP BY a.id
)`

func scanArchiveRow(rows *sql.Rows, numericSort bool) (archiveRow, interface{}, error) {
	var row archiveRow
	var modifiedNanoseconds int64
	var sortValue interface{}
	if numericSort {
		var numeric float64
		err := rows.Scan(&row.ID, &row.RelativePath, &row.Size, &modifiedNanoseconds, &row.ScanState, &row.ErrorCode, &row.MemberCount,
			&row.ImageMemberCount, &row.AnalyzedImageCount, &row.CompressedImageBytes, &row.AverageImageBytes, &row.AverageBytesPerMegapixel,
			&row.AnomalyCount, &row.EstimatedSavingsBytes, &numeric)
		sortValue = numeric
		row.ModifiedAt = unixNanosecondsToJSONTime(modifiedNanoseconds)
		return row, sortValue, err
	}
	var text string
	err := rows.Scan(&row.ID, &row.RelativePath, &row.Size, &modifiedNanoseconds, &row.ScanState, &row.ErrorCode, &row.MemberCount,
		&row.ImageMemberCount, &row.AnalyzedImageCount, &row.CompressedImageBytes, &row.AverageImageBytes, &row.AverageBytesPerMegapixel,
		&row.AnomalyCount, &row.EstimatedSavingsBytes, &text)
	sortValue = text
	row.ModifiedAt = unixNanosecondsToJSONTime(modifiedNanoseconds)
	return row, sortValue, err
}

func unixNanosecondsToJSONTime(value int64) string {
	return time.Unix(0, value).UTC().Format(time.RFC3339Nano)
}

func populateArchiveMedians(runtime *libraryRuntime, archives []archiveRow) error {
	for index := range archives {
		rows, err := runtime.db.Query(`SELECT bytes_per_megapixel FROM image_metadata metadata
			JOIN archive_member m ON m.id = metadata.member_id
			WHERE m.archive_id = ? AND metadata.policy_revision = ? AND metadata.status = 'complete' AND metadata.bytes_per_megapixel IS NOT NULL`,
			archives[index].ID, defaultAnalysisPolicy)
		if err != nil {
			return fmt.Errorf("read archive median metadata: %w", err)
		}
		values := make([]float64, 0)
		for rows.Next() {
			var value float64
			if err := rows.Scan(&value); err != nil {
				rows.Close()
				return err
			}
			values = append(values, value)
		}
		rows.Close()
		if len(values) > 0 {
			archives[index].MedianBytesPerMegapixel = median(values)
		}
	}
	return nil
}

func queryMembers(runtime *libraryRuntime, params memberQueryParams) (pagedResult[memberRow], error) {
	if params.ArchiveID <= 0 {
		return pagedResult[memberRow]{}, fmt.Errorf("archiveId is required")
	}
	page, err := normalizedPage(params.Page)
	if err != nil {
		return pagedResult[memberRow]{}, err
	}
	offset, err := cursorOffset(params.Page.Cursor)
	if err != nil {
		return pagedResult[memberRow]{}, err
	}
	args := []interface{}{defaultAnalysisPolicy, defaultAnalysisPolicy, params.ArchiveID}
	where := "m.archive_id = ?"
	if strings.TrimSpace(params.Text) != "" {
		where += " AND LOWER(m.member_path) LIKE LOWER(?)"
		args = append(args, "%"+strings.TrimSpace(params.Text)+"%")
	}
	query := `SELECT m.id, m.archive_id, m.member_path, m.nesting_depth, m.compressed_size, m.uncompressed_size, m.compression_method, m.crc32,
		m.extension, m.is_image_candidate, m.is_nested_archive, m.is_encrypted, metadata.actual_format, metadata.width, metadata.height,
		metadata.pixels, metadata.aspect_ratio, metadata.bytes_per_megapixel, metadata.animated, metadata.frame_count, metadata.status, metadata.error_code, anomaly.kind, anomaly.score,
		COALESCE(anomaly.estimated_savings_bytes, 0)
		FROM archive_member m
		LEFT JOIN image_metadata metadata ON metadata.member_id = m.id AND metadata.policy_revision = ?
		LEFT JOIN anomaly ON anomaly.member_id = m.id AND anomaly.policy_revision = ?
		WHERE ` + where + ` ORDER BY m.entry_index ASC LIMIT ? OFFSET ?`
	args = append(args, page.Limit+1, offset)
	rows, err := runtime.db.Query(query, args...)
	if err != nil {
		return pagedResult[memberRow]{}, fmt.Errorf("query archive members: %w", err)
	}
	defer rows.Close()
	result := pagedResult[memberRow]{Items: make([]memberRow, 0, page.Limit)}
	for rows.Next() {
		row, err := scanMemberRow(rows)
		if err != nil {
			return result, err
		}
		if len(result.Items) == page.Limit {
			result.NextCursor = strconv.Itoa(offset + page.Limit)
			break
		}
		result.Items = append(result.Items, row)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	countArgs := args[:len(args)-2]
	if err := runtime.db.QueryRow(`SELECT COUNT(*) FROM archive_member m WHERE `+where, countArgs[2:]...).Scan(&result.Total); err != nil {
		return result, fmt.Errorf("count archive members: %w", err)
	}
	return result, nil
}

func scanMemberRow(rows *sql.Rows) (memberRow, error) {
	var row memberRow
	var crc uint64
	var imageCandidate int
	var nestedArchive int
	var encrypted int
	var actualFormat sql.NullString
	var width sql.NullInt64
	var height sql.NullInt64
	var pixels sql.NullInt64
	var aspectRatio sql.NullFloat64
	var bytesPerMegapixel sql.NullFloat64
	var animated sql.NullInt64
	var frameCount sql.NullInt64
	var metadataStatus sql.NullString
	var metadataError sql.NullString
	var anomalyKind sql.NullString
	var anomalyScore sql.NullFloat64
	err := rows.Scan(&row.ID, &row.ArchiveID, &row.MemberPath, &row.NestingDepth, &row.CompressedSize, &row.UncompressedSize, &row.CompressionMethod, &crc,
		&row.Extension, &imageCandidate, &nestedArchive, &encrypted, &actualFormat, &width, &height, &pixels, &aspectRatio, &bytesPerMegapixel, &animated, &frameCount,
		&metadataStatus, &metadataError, &anomalyKind, &anomalyScore, &row.EstimatedSavingsBytes)
	if err != nil {
		return row, err
	}
	row.CRC32 = uint32(crc)
	row.ImageCandidate = imageCandidate == 1
	row.NestedArchive = nestedArchive == 1
	row.Encrypted = encrypted == 1
	row.ActualFormat = nullableString(actualFormat)
	row.Width = nullableInt64(width)
	row.Height = nullableInt64(height)
	row.Pixels = nullableInt64(pixels)
	row.AspectRatio = nullableFloat64(aspectRatio)
	row.BytesPerMegapixel = nullableFloat64(bytesPerMegapixel)
	row.Animated = nullableBool(animated)
	row.FrameCount = nullableInt64(frameCount)
	row.MetadataStatus = nullableString(metadataStatus)
	row.MetadataErrorCode = nullableString(metadataError)
	row.AnomalyKind = nullableString(anomalyKind)
	row.AnomalyScore = nullableFloat64(anomalyScore)
	return row, nil
}

func nullableInt64(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	result := value.Int64
	return &result
}

func nullableFloat64(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	result := value.Float64
	return &result
}

func nullableBool(value sql.NullInt64) *bool {
	if !value.Valid {
		return nil
	}
	result := value.Int64 != 0
	return &result
}

func nullableString(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func normalizedPage(request pageRequest) (pageRequest, error) {
	page := request
	if page.Limit == 0 {
		page.Limit = defaultPageSize
	}
	if page.Limit < 1 || page.Limit > maximumPageSize {
		return page, fmt.Errorf("page limit must be between 1 and %d", maximumPageSize)
	}
	return page, nil
}

func cursorOffset(cursor string) (int, error) {
	if cursor == "" {
		return 0, nil
	}
	offset, err := strconv.Atoi(cursor)
	if err != nil || offset < 0 {
		return 0, fmt.Errorf("invalid member cursor")
	}
	return offset, nil
}

func archiveSortFor(value string) archiveSort {
	switch value {
	case "relativePath", "name":
		return archiveSort{column: "relative_path"}
	case "imageCount":
		return archiveSort{column: "image_member_count", numeric: true}
	case "analysisCoverage":
		return archiveSort{column: "analyzed_image_count", numeric: true}
	case "totalImageSize":
		return archiveSort{column: "compressed_image_bytes", numeric: true}
	case "averageImageSize":
		return archiveSort{column: "average_image_bytes", numeric: true}
	case "averageBytesPerMegapixel":
		return archiveSort{column: "average_bytes_per_megapixel", numeric: true}
	case "anomalyCount":
		return archiveSort{column: "anomaly_count", numeric: true}
	case "estimatedSavings":
		return archiveSort{column: "estimated_savings_bytes", numeric: true}
	default:
		return archiveSort{column: "size", numeric: true}
	}
}

func encodeArchiveCursor(cursor archiveCursor) (string, error) {
	bytes, err := json.Marshal(cursor)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func decodeArchiveCursor(value string) (*archiveCursor, error) {
	if value == "" {
		return nil, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("invalid archive cursor")
	}
	var cursor archiveCursor
	if err := json.Unmarshal(decoded, &cursor); err != nil || cursor.ID <= 0 {
		return nil, fmt.Errorf("invalid archive cursor")
	}
	return &cursor, nil
}

func archiveFilters(text string, pathPrefix string, rules ruleTree) (string, []interface{}, error) {
	where := "1 = 1"
	args := make([]interface{}, 0)
	if strings.TrimSpace(text) != "" {
		where += " AND (LOWER(archive_metrics.relative_path) LIKE LOWER(?) OR archive_metrics.id IN (SELECT archive_id FROM archive_member WHERE LOWER(member_path) LIKE LOWER(?)))"
		needle := "%" + strings.TrimSpace(text) + "%"
		args = append(args, needle, needle)
	}
	if normalizedPrefix := strings.Trim(strings.ReplaceAll(pathPrefix, "\\", "/"), "/"); normalizedPrefix != "" {
		where += " AND archive_metrics.relative_path LIKE ?"
		args = append(args, normalizedPrefix+"/%")
	}
	if rules.Format == "" {
		return where, args, nil
	}
	if rules.Format != "xiranite-rule-tree/v1" || rules.Version != 1 {
		return "", nil, fmt.Errorf("unsupported rule tree format")
	}
	ruleSQL, ruleArgs, err := compileRuleGroup(rules.Root)
	if err != nil {
		return "", nil, err
	}
	if ruleSQL != "" {
		where += " AND (" + ruleSQL + ")"
		args = append(args, ruleArgs...)
	}
	return where, args, nil
}

func compileRuleGroup(group ruleGroup) (string, []interface{}, error) {
	if group.Kind != "group" {
		return "", nil, fmt.Errorf("invalid rule group")
	}
	parts := make([]string, 0, len(group.Children))
	args := make([]interface{}, 0)
	for _, child := range group.Children {
		var sql string
		var childArgs []interface{}
		var err error
		if child.Kind == "group" {
			sql, childArgs, err = compileRuleGroup(ruleGroup{ID: child.ID, Kind: child.Kind, Combinator: child.Combinator, Not: child.Not, Children: child.Children})
		} else {
			sql, childArgs, err = compileRuleCondition(child)
		}
		if err != nil {
			return "", nil, err
		}
		if sql != "" {
			parts = append(parts, "("+sql+")")
			args = append(args, childArgs...)
		}
	}
	if len(parts) == 0 {
		return "", nil, nil
	}
	joiner := " AND "
	if group.Combinator == "any" {
		joiner = " OR "
	} else if group.Combinator != "all" {
		return "", nil, fmt.Errorf("unsupported rule combinator: %s", group.Combinator)
	}
	result := strings.Join(parts, joiner)
	if group.Not {
		result = "NOT (" + result + ")"
	}
	return result, args, nil
}

func compileRuleCondition(condition ruleNode) (string, []interface{}, error) {
	if condition.Kind != "condition" {
		return "", nil, fmt.Errorf("invalid rule node")
	}
	expression, numeric, memberField := ruleFieldExpression(condition.Field)
	if expression == "" {
		return "", nil, fmt.Errorf("unsupported Findz filter field: %s", condition.Field)
	}
	if memberField {
		return compileMemberRuleCondition(condition, expression, numeric)
	}
	return compileRulePredicate(condition, expression, numeric)
}

func compileMemberRuleCondition(condition ruleNode, expression string, numeric bool) (string, []interface{}, error) {
	predicate, args, err := compileRulePredicate(condition, expression, numeric)
	if err != nil {
		return "", nil, err
	}
	return `EXISTS (
		SELECT 1 FROM archive_member AS member_filter
		LEFT JOIN image_metadata AS metadata_filter ON metadata_filter.member_id = member_filter.id AND metadata_filter.policy_revision = '` + defaultAnalysisPolicy + `'
		LEFT JOIN anomaly AS anomaly_filter ON anomaly_filter.member_id = member_filter.id AND anomaly_filter.policy_revision = '` + defaultAnalysisPolicy + `'
		WHERE member_filter.archive_id = archive_metrics.id AND (` + predicate + `)
	)`, args, nil
}

func compileRulePredicate(condition ruleNode, expression string, numeric bool) (string, []interface{}, error) {
	operator := condition.Operator
	if operator == "isEmpty" {
		return "(" + expression + " IS NULL OR " + expression + " = '')", nil, nil
	}
	if operator == "isNotEmpty" {
		return "(" + expression + " IS NOT NULL AND " + expression + " <> '')", nil, nil
	}
	if operator == "in" || operator == "notIn" {
		values, ok := condition.Value.([]interface{})
		if !ok {
			values = []interface{}{condition.Value}
		}
		if len(values) == 0 {
			return "1 = 0", nil, nil
		}
		placeholders := make([]string, len(values))
		args := make([]interface{}, len(values))
		for index, value := range values {
			converted, err := normalizeRuleValue(value, numeric)
			if err != nil {
				return "", nil, err
			}
			placeholders[index] = "?"
			args[index] = converted
		}
		negation := ""
		if operator == "notIn" {
			negation = " NOT"
		}
		return expression + negation + " IN (" + strings.Join(placeholders, ",") + ")", args, nil
	}
	value, err := normalizeRuleValue(condition.Value, numeric)
	if err != nil {
		return "", nil, err
	}
	switch operator {
	case "equal":
		return expression + " = ?", []interface{}{value}, nil
	case "notEqual":
		return expression + " <> ?", []interface{}{value}, nil
	case "lessThan":
		return expression + " < ?", []interface{}{value}, nil
	case "lessThanInclusive":
		return expression + " <= ?", []interface{}{value}, nil
	case "greaterThan":
		return expression + " > ?", []interface{}{value}, nil
	case "greaterThanInclusive":
		return expression + " >= ?", []interface{}{value}, nil
	case "contains", "doesNotContain", "startsWith", "endsWith":
		if numeric {
			return "", nil, fmt.Errorf("text operator %s is invalid for numeric field %s", operator, condition.Field)
		}
		text := fmt.Sprint(value)
		switch operator {
		case "contains", "doesNotContain":
			text = "%" + text + "%"
		case "startsWith":
			text += "%"
		case "endsWith":
			text = "%" + text
		}
		negation := ""
		if operator == "doesNotContain" {
			negation = " NOT"
		}
		return "LOWER(" + expression + ")" + negation + " LIKE LOWER(?)", []interface{}{text}, nil
	default:
		return "", nil, fmt.Errorf("unsupported Findz filter operator: %s", operator)
	}
}

func ruleFieldExpression(field string) (string, bool, bool) {
	switch field {
	case "relativePath", "archivePath", "name":
		return "archive_metrics.relative_path", false, false
	case "scanState", "status":
		return "archive_metrics.scan_state", false, false
	case "archiveSize", "size":
		return "archive_metrics.size", true, false
	case "memberCount":
		return "archive_metrics.member_count", true, false
	case "imageCount":
		return "archive_metrics.image_member_count", true, false
	case "analyzedImageCount", "analysisCoverage":
		return "archive_metrics.analyzed_image_count", true, false
	case "totalImageSize":
		return "archive_metrics.compressed_image_bytes", true, false
	case "averageImageSize":
		return "archive_metrics.average_image_bytes", true, false
	case "averageBytesPerMegapixel":
		return "archive_metrics.average_bytes_per_megapixel", true, false
	case "anomalyCount":
		return "archive_metrics.anomaly_count", true, false
	case "estimatedSavings":
		return "archive_metrics.estimated_savings_bytes", true, false
	case "memberPath":
		return "member_filter.member_path", false, true
	case "memberSize":
		return "member_filter.compressed_size", true, true
	case "extension":
		return "member_filter.extension", false, true
	case "actualFormat":
		return "metadata_filter.actual_format", false, true
	case "width":
		return "metadata_filter.width", true, true
	case "height":
		return "metadata_filter.height", true, true
	case "pixels":
		return "metadata_filter.pixels", true, true
	case "bytesPerMegapixel":
		return "metadata_filter.bytes_per_megapixel", true, true
	case "analysisStatus":
		return "metadata_filter.status", false, true
	case "anomalyKind":
		return "anomaly_filter.kind", false, true
	case "anomalyScore":
		return "anomaly_filter.score", true, true
	case "memberEstimatedSavings":
		return "anomaly_filter.estimated_savings_bytes", true, true
	default:
		return "", false, false
	}
}

func normalizeRuleValue(value interface{}, numeric bool) (interface{}, error) {
	if !numeric {
		switch typed := value.(type) {
		case string:
			return typed, nil
		case bool:
			return strconv.FormatBool(typed), nil
		default:
			return fmt.Sprint(typed), nil
		}
	}
	switch typed := value.(type) {
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return nil, fmt.Errorf("numeric filter value must be finite")
		}
		return typed, nil
	case float32:
		return float64(typed), nil
	case int:
		return typed, nil
	case int64:
		return typed, nil
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err
	case string:
		parsed, err := strconv.ParseFloat(typed, 64)
		if err != nil {
			return nil, fmt.Errorf("numeric filter value is invalid: %s", typed)
		}
		return parsed, nil
	default:
		return nil, fmt.Errorf("numeric filter value is invalid")
	}
}
