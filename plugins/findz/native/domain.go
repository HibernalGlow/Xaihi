package main

import "time"

type libraryOpenParams struct {
	LibraryID    string `json:"libraryId"`
	Root         string `json:"root"`
	DatabasePath string `json:"databasePath"`
}

type librarySummary struct {
	LibraryID      string `json:"libraryId"`
	Root           string `json:"root"`
	DatabasePath   string `json:"databasePath"`
	ArchiveCount   int64  `json:"archiveCount"`
	MemberCount    int64  `json:"memberCount"`
	WatcherHealth  string `json:"watcherHealth"`
	AnalysisPolicy string `json:"analysisPolicy"`
}

type scanParams struct {
	LibraryID       string `json:"libraryId"`
	VerifyUnchanged bool   `json:"verifyUnchanged"`
}

type watcherChange struct {
	Path string `json:"path"`
	Type string `json:"type"`
}

type watcherApplyParams struct {
	LibraryID string          `json:"libraryId"`
	Changes   []watcherChange `json:"changes"`
}

type watcherHealthParams struct {
	LibraryID string `json:"libraryId"`
	Health    string `json:"health"`
}

type analysisScope struct {
	Kind       string  `json:"kind"`
	ArchiveIDs []int64 `json:"archiveIds"`
	MemberIDs  []int64 `json:"memberIds"`
	DeepRetry  bool    `json:"deepRetry"`
}

type analysisStartParams struct {
	LibraryID string        `json:"libraryId"`
	Scope     analysisScope `json:"scope"`
}

type taskControlParams struct {
	LibraryID string `json:"libraryId"`
	TaskID    string `json:"taskId"`
}

type taskRecord struct {
	ID             string     `json:"id"`
	LibraryID      string     `json:"libraryId"`
	Kind           string     `json:"kind"`
	Status         string     `json:"status"`
	TotalArchives  int64      `json:"totalArchives"`
	DoneArchives   int64      `json:"doneArchives"`
	TotalMembers   int64      `json:"totalMembers"`
	DoneMembers    int64      `json:"doneMembers"`
	SkippedMembers int64      `json:"skippedMembers"`
	FailedMembers  int64      `json:"failedMembers"`
	StartedAt      *time.Time `json:"startedAt,omitempty"`
	FinishedAt     *time.Time `json:"finishedAt,omitempty"`
	Message        string     `json:"message"`
	AnalysisPolicy string     `json:"analysisPolicy,omitempty"`
}

type pageRequest struct {
	Cursor string `json:"cursor"`
	Limit  int    `json:"limit"`
}

type ruleTree struct {
	Format  string    `json:"format"`
	Version int       `json:"version"`
	Root    ruleGroup `json:"root"`
}

type ruleGroup struct {
	ID         string     `json:"id"`
	Kind       string     `json:"kind"`
	Combinator string     `json:"combinator"`
	Not        bool       `json:"not"`
	Children   []ruleNode `json:"children"`
}

type ruleNode struct {
	ID         string      `json:"id"`
	Kind       string      `json:"kind"`
	Field      string      `json:"field"`
	Operator   string      `json:"operator"`
	Value      interface{} `json:"value"`
	Combinator string      `json:"combinator"`
	Not        bool        `json:"not"`
	Children   []ruleNode  `json:"children"`
}

type archiveQueryParams struct {
	LibraryID  string      `json:"libraryId"`
	Text       string      `json:"text"`
	PathPrefix string      `json:"pathPrefix"`
	Rules      ruleTree    `json:"rules"`
	SortBy     string      `json:"sortBy"`
	SortDesc   bool        `json:"sortDesc"`
	Page       pageRequest `json:"page"`
}

type memberQueryParams struct {
	LibraryID string      `json:"libraryId"`
	ArchiveID int64       `json:"archiveId"`
	Text      string      `json:"text"`
	Page      pageRequest `json:"page"`
}

type archiveRow struct {
	ID                       int64   `json:"id"`
	RelativePath             string  `json:"relativePath"`
	Size                     int64   `json:"size"`
	ModifiedAt               string  `json:"modifiedAt"`
	ScanState                string  `json:"scanState"`
	ErrorCode                string  `json:"errorCode,omitempty"`
	MemberCount              int64   `json:"memberCount"`
	ImageMemberCount         int64   `json:"imageMemberCount"`
	AnalyzedImageCount       int64   `json:"analyzedImageCount"`
	CompressedImageBytes     int64   `json:"compressedImageBytes"`
	AverageImageBytes        float64 `json:"averageImageBytes"`
	AverageBytesPerMegapixel float64 `json:"averageBytesPerMegapixel"`
	MedianBytesPerMegapixel  float64 `json:"medianBytesPerMegapixel"`
	AnomalyCount             int64   `json:"anomalyCount"`
	EstimatedSavingsBytes    int64   `json:"estimatedSavingsBytes"`
}

type memberRow struct {
	ID                    int64    `json:"id"`
	ArchiveID             int64    `json:"archiveId"`
	MemberPath            string   `json:"memberPath"`
	NestingDepth          int64    `json:"nestingDepth"`
	CompressedSize        int64    `json:"compressedSize"`
	UncompressedSize      int64    `json:"uncompressedSize"`
	CompressionMethod     int64    `json:"compressionMethod"`
	CRC32                 uint32   `json:"crc32"`
	Extension             string   `json:"extension"`
	ImageCandidate        bool     `json:"imageCandidate"`
	NestedArchive         bool     `json:"nestedArchive"`
	Encrypted             bool     `json:"encrypted"`
	ActualFormat          string   `json:"actualFormat,omitempty"`
	Width                 *int64   `json:"width,omitempty"`
	Height                *int64   `json:"height,omitempty"`
	Pixels                *int64   `json:"pixels,omitempty"`
	AspectRatio           *float64 `json:"aspectRatio,omitempty"`
	BytesPerMegapixel     *float64 `json:"bytesPerMegapixel,omitempty"`
	Animated              *bool    `json:"animated,omitempty"`
	FrameCount            *int64   `json:"frameCount,omitempty"`
	MetadataStatus        string   `json:"metadataStatus,omitempty"`
	MetadataErrorCode     string   `json:"metadataErrorCode,omitempty"`
	AnomalyKind           string   `json:"anomalyKind,omitempty"`
	AnomalyScore          *float64 `json:"anomalyScore,omitempty"`
	EstimatedSavingsBytes int64    `json:"estimatedSavingsBytes"`
}

type pagedResult[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"nextCursor,omitempty"`
	Total      int64  `json:"total"`
}

type treemapParams struct {
	LibraryID  string   `json:"libraryId"`
	Text       string   `json:"text"`
	PathPrefix string   `json:"pathPrefix"`
	Rules      ruleTree `json:"rules"`
	AreaBy     string   `json:"areaBy"`
}

type treemapNode struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Value     float64       `json:"value"`
	Color     float64       `json:"color"`
	ArchiveID int64         `json:"archiveId,omitempty"`
	Children  []treemapNode `json:"children,omitempty"`
}
