package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const latestFindzSchemaVersion = 2

type schemaMigration struct {
	version int
	apply   func(*sql.Tx) error
}

type libraryRuntime struct {
	id           string
	root         string
	databasePath string
	db           *sql.DB
	scanQueue    libraryScanQueue
}

func openLibraryDatabase(params libraryOpenParams) (*libraryRuntime, error) {
	if strings.TrimSpace(params.Root) == "" {
		return nil, fmt.Errorf("library root is required")
	}
	root, err := filepath.Abs(params.Root)
	if err != nil {
		return nil, fmt.Errorf("resolve library root: %w", err)
	}
	info, err := os.Stat(root)
	if err != nil {
		return nil, fmt.Errorf("stat library root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("library root is not a directory: %s", root)
	}

	libraryID := strings.TrimSpace(params.LibraryID)
	if libraryID == "" {
		libraryID = libraryIDForRoot(root)
	}
	databasePath := strings.TrimSpace(params.DatabasePath)
	if databasePath == "" {
		databasePath, err = defaultDatabasePath(libraryID)
		if err != nil {
			return nil, err
		}
	}
	if err := os.MkdirAll(filepath.Dir(databasePath), 0o755); err != nil {
		return nil, fmt.Errorf("create Findz index directory: %w", err)
	}

	db, err := sql.Open("sqlite3", databasePath+"?_foreign_keys=on&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open Findz index: %w", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect Findz index: %w", err)
	}
	if err := initializeSchema(db, libraryID, root); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec(`UPDATE task SET status = 'paused', message = 'Recovered after the native worker stopped.' WHERE status = 'running'`); err != nil {
		db.Close()
		return nil, fmt.Errorf("recover Findz tasks: %w", err)
	}
	return &libraryRuntime{id: libraryID, root: root, databasePath: databasePath, db: db}, nil
}

func initializeSchema(db *sql.DB, libraryID string, root string) error {
	if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
		return fmt.Errorf("enable Findz WAL mode: %w", err)
	}
	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		return fmt.Errorf("enable Findz foreign keys: %w", err)
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at TEXT NOT NULL
		)`); err != nil {
		return fmt.Errorf("create Findz schema migration ledger: %w", err)
	}
	if err := applyFindzSchemaMigrations(db); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := db.Exec(`INSERT OR REPLACE INTO library (id, root_path, watcher_health, analysis_policy, created_at, updated_at)
		VALUES (?, ?, COALESCE((SELECT watcher_health FROM library WHERE id = ?), 'healthy'), ?, COALESCE((SELECT created_at FROM library WHERE id = ?), ?), ?)`,
		libraryID, root, libraryID, defaultAnalysisPolicy, libraryID, now, now); err != nil {
		return fmt.Errorf("initialize Findz library record: %w", err)
	}
	return nil
}

func applyFindzSchemaMigrations(db *sql.DB) error {
	applied, err := readAppliedFindzSchemaMigrations(db)
	if err != nil {
		return err
	}
	for _, migration := range findzSchemaMigrations() {
		if applied[migration.version] {
			continue
		}
		for laterVersion := migration.version + 1; laterVersion <= latestFindzSchemaVersion; laterVersion++ {
			if applied[laterVersion] {
				return fmt.Errorf("Findz schema history is missing migration %d before migration %d", migration.version, laterVersion)
			}
		}
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("begin Findz schema migration %d: %w", migration.version, err)
		}
		if err := migration.apply(tx); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply Findz schema migration %d: %w", migration.version, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, migration.version, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record Findz schema migration %d: %w", migration.version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit Findz schema migration %d: %w", migration.version, err)
		}
	}
	return nil
}

func readAppliedFindzSchemaMigrations(db *sql.DB) (map[int]bool, error) {
	rows, err := db.Query(`SELECT version FROM schema_migrations ORDER BY version ASC`)
	if err != nil {
		return nil, fmt.Errorf("read Findz schema migrations: %w", err)
	}
	defer rows.Close()
	applied := make(map[int]bool)
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return nil, fmt.Errorf("read Findz schema migration version: %w", err)
		}
		if version < 1 || version > latestFindzSchemaVersion {
			return nil, fmt.Errorf("Findz index schema version %d is not supported by this core", version)
		}
		applied[version] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate Findz schema migrations: %w", err)
	}
	return applied, nil
}

func findzSchemaMigrations() []schemaMigration {
	return []schemaMigration{
		{version: 1, apply: applyFindzSchemaV1},
		{version: 2, apply: applyFindzSchemaV2},
	}
}

func applyFindzSchemaV1(tx *sql.Tx) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS library (
			id TEXT PRIMARY KEY,
			root_path TEXT NOT NULL,
			watcher_health TEXT NOT NULL DEFAULT 'healthy',
			analysis_policy TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS archive (
			id INTEGER PRIMARY KEY,
			relative_path TEXT NOT NULL UNIQUE,
			source_identity TEXT NOT NULL,
			size INTEGER NOT NULL,
			mtime_ns INTEGER NOT NULL,
			scan_state TEXT NOT NULL,
			error_code TEXT NOT NULL DEFAULT '',
			last_seen_scan TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS archive_member (
			id INTEGER PRIMARY KEY,
			archive_id INTEGER NOT NULL REFERENCES archive(id) ON DELETE CASCADE,
			entry_index INTEGER NOT NULL,
			member_path TEXT NOT NULL,
			crc32 INTEGER NOT NULL,
			compressed_size INTEGER NOT NULL,
			uncompressed_size INTEGER NOT NULL,
			compression_method INTEGER NOT NULL,
			modified_at TEXT NOT NULL,
			extension TEXT NOT NULL,
			is_directory INTEGER NOT NULL,
			is_image_candidate INTEGER NOT NULL,
			is_nested_archive INTEGER NOT NULL,
			is_encrypted INTEGER NOT NULL,
			UNIQUE(archive_id, entry_index)
		)`,
		`CREATE TABLE IF NOT EXISTS analysis_run (
			id TEXT PRIMARY KEY,
			policy_revision TEXT NOT NULL,
			started_at TEXT NOT NULL,
			finished_at TEXT,
			status TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS image_metadata (
			member_id INTEGER PRIMARY KEY REFERENCES archive_member(id) ON DELETE CASCADE,
			analysis_run_id TEXT REFERENCES analysis_run(id) ON DELETE SET NULL,
			policy_revision TEXT NOT NULL,
			actual_format TEXT NOT NULL DEFAULT '',
			width INTEGER,
			height INTEGER,
			pixels INTEGER,
			bytes_per_megapixel REAL,
			animated INTEGER,
			frame_count INTEGER,
			extension_mismatch INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL,
			error_code TEXT NOT NULL DEFAULT '',
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS task (
			id TEXT PRIMARY KEY,
			kind TEXT NOT NULL,
			status TEXT NOT NULL,
			params_json TEXT NOT NULL,
			total_archives INTEGER NOT NULL DEFAULT 0,
			done_archives INTEGER NOT NULL DEFAULT 0,
			total_members INTEGER NOT NULL DEFAULT 0,
			done_members INTEGER NOT NULL DEFAULT 0,
			skipped_members INTEGER NOT NULL DEFAULT 0,
			failed_members INTEGER NOT NULL DEFAULT 0,
			started_at TEXT,
			finished_at TEXT,
			message TEXT NOT NULL DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS analysis_queue (
			task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
			archive_id INTEGER NOT NULL REFERENCES archive(id) ON DELETE CASCADE,
			member_id INTEGER NOT NULL REFERENCES archive_member(id) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'queued',
			PRIMARY KEY(task_id, member_id)
		)`,
		`CREATE TABLE IF NOT EXISTS anomaly (
			member_id INTEGER NOT NULL REFERENCES archive_member(id) ON DELETE CASCADE,
			policy_revision TEXT NOT NULL,
			kind TEXT NOT NULL,
			cohort TEXT NOT NULL,
			score REAL NOT NULL,
			baseline_bytes_per_megapixel REAL NOT NULL,
			estimated_savings_bytes INTEGER NOT NULL,
			PRIMARY KEY(member_id, policy_revision, kind)
		)`,
		`CREATE INDEX IF NOT EXISTS archive_by_relative_path ON archive(relative_path)`,
		`CREATE INDEX IF NOT EXISTS archive_by_scan_state ON archive(scan_state)`,
		`CREATE INDEX IF NOT EXISTS archive_member_by_archive_path ON archive_member(archive_id, member_path)`,
		`CREATE INDEX IF NOT EXISTS archive_member_by_image_candidate ON archive_member(is_image_candidate, archive_id)`,
		`CREATE INDEX IF NOT EXISTS image_metadata_by_policy_status ON image_metadata(policy_revision, status)`,
		`CREATE INDEX IF NOT EXISTS anomaly_by_policy_score ON anomaly(policy_revision, score DESC)`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			return fmt.Errorf("create Findz schema v1: %w", err)
		}
	}
	return nil
}

func applyFindzSchemaV2(tx *sql.Tx) error {
	statements := []string{
		`ALTER TABLE archive ADD COLUMN central_directory_fingerprint TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE archive_member ADD COLUMN nesting_depth INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE image_metadata ADD COLUMN aspect_ratio REAL`,
	}
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}

func libraryIDForRoot(root string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(filepath.Clean(root))))
	return "library-" + hex.EncodeToString(sum[:8])
}

func defaultDatabasePath(libraryID string) (string, error) {
	localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
	if localAppData == "" {
		cacheDirectory, err := os.UserCacheDir()
		if err != nil {
			return "", fmt.Errorf("resolve Findz cache directory: %w", err)
		}
		localAppData = cacheDirectory
	}
	return filepath.Join(localAppData, "Xiranite", "findz", "indexes", libraryID+".sqlite"), nil
}

func librarySummaryFor(runtime *libraryRuntime) (librarySummary, error) {
	summary := librarySummary{
		LibraryID: runtime.id, Root: runtime.root, DatabasePath: runtime.databasePath,
		WatcherHealth: "healthy", AnalysisPolicy: defaultAnalysisPolicy,
	}
	if err := runtime.db.QueryRow(`SELECT watcher_health, analysis_policy FROM library WHERE id = ?`, runtime.id).Scan(&summary.WatcherHealth, &summary.AnalysisPolicy); err != nil {
		return summary, fmt.Errorf("read Findz library settings: %w", err)
	}
	if err := runtime.db.QueryRow(`SELECT COUNT(*) FROM archive`).Scan(&summary.ArchiveCount); err != nil {
		return summary, fmt.Errorf("count Findz archives: %w", err)
	}
	if err := runtime.db.QueryRow(`SELECT COUNT(*) FROM archive_member`).Scan(&summary.MemberCount); err != nil {
		return summary, fmt.Errorf("count Findz archive members: %w", err)
	}
	return summary, nil
}

func setWatcherHealth(runtime *libraryRuntime, health string) (librarySummary, error) {
	if health != "healthy" && health != "degraded" {
		return librarySummary{}, fmt.Errorf("unsupported watcher health: %s", health)
	}
	if _, err := runtime.db.Exec(`UPDATE library SET watcher_health = ?, updated_at = ? WHERE id = ?`, health, time.Now().UTC().Format(time.RFC3339Nano), runtime.id); err != nil {
		return librarySummary{}, fmt.Errorf("update Findz watcher health: %w", err)
	}
	return librarySummaryFor(runtime)
}
