package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type taskController struct {
	mu       sync.Mutex
	paused   bool
	canceled bool
	wake     *sync.Cond
}

func newTaskController() *taskController {
	controller := &taskController{}
	controller.wake = sync.NewCond(&controller.mu)
	return controller
}

func (controller *taskController) pause() {
	controller.mu.Lock()
	controller.paused = true
	controller.mu.Unlock()
}

func (controller *taskController) resume() {
	controller.mu.Lock()
	controller.paused = false
	controller.wake.Broadcast()
	controller.mu.Unlock()
}

func (controller *taskController) cancel() {
	controller.mu.Lock()
	controller.canceled = true
	controller.paused = false
	controller.wake.Broadcast()
	controller.mu.Unlock()
}

func (controller *taskController) waitUntilRunnable() bool {
	controller.mu.Lock()
	defer controller.mu.Unlock()
	for controller.paused && !controller.canceled {
		controller.wake.Wait()
	}
	return !controller.canceled
}

func (service *findzService) createTask(runtime *libraryRuntime, kind string, params interface{}) (taskRecord, error) {
	paramsJSON, err := json.Marshal(params)
	if err != nil {
		return taskRecord{}, fmt.Errorf("encode task params: %w", err)
	}
	task := taskRecord{ID: newTaskID(), LibraryID: runtime.id, Kind: kind, Status: "queued", Message: "Queued."}
	if kind == "analysis" {
		task.AnalysisPolicy = defaultAnalysisPolicy
	}
	if _, err := runtime.db.Exec(`INSERT INTO task (id, kind, status, params_json, message) VALUES (?, ?, ?, ?, ?)`, task.ID, task.Kind, task.Status, string(paramsJSON), task.Message); err != nil {
		return taskRecord{}, fmt.Errorf("create Findz task: %w", err)
	}
	return task, nil
}

func newTaskID() string {
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("task-%d", time.Now().UnixNano())
	}
	return "task-" + hex.EncodeToString(bytes)
}

func readTask(runtime *libraryRuntime, taskID string) (taskRecord, error) {
	var task taskRecord
	task.LibraryID = runtime.id
	var startedAt sql.NullString
	var finishedAt sql.NullString
	err := runtime.db.QueryRow(`SELECT id, kind, status, total_archives, done_archives, total_members, done_members, skipped_members, failed_members, started_at, finished_at, message
		FROM task WHERE id = ?`, taskID).Scan(
		&task.ID, &task.Kind, &task.Status, &task.TotalArchives, &task.DoneArchives, &task.TotalMembers, &task.DoneMembers,
		&task.SkippedMembers, &task.FailedMembers, &startedAt, &finishedAt, &task.Message,
	)
	if err == sql.ErrNoRows {
		return task, fmt.Errorf("Findz task was not found: %s", taskID)
	}
	if err != nil {
		return task, fmt.Errorf("read Findz task: %w", err)
	}
	task.StartedAt = parseOptionalTime(startedAt)
	task.FinishedAt = parseOptionalTime(finishedAt)
	if task.Kind == "analysis" {
		task.AnalysisPolicy = defaultAnalysisPolicy
	}
	return task, nil
}

func parseOptionalTime(value sql.NullString) *time.Time {
	if !value.Valid || value.String == "" {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value.String)
	if err != nil {
		return nil
	}
	return &parsed
}

func updateTask(runtime *libraryRuntime, taskID string, status string, message string) error {
	startedAt := ""
	finishedAt := ""
	if status == "running" {
		startedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if isTerminalTaskStatus(status) {
		finishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, err := runtime.db.Exec(`UPDATE task SET status = ?, message = ?,
		started_at = CASE WHEN ? <> '' AND started_at IS NULL THEN ? ELSE started_at END,
		finished_at = CASE WHEN ? <> '' THEN ? ELSE finished_at END
		WHERE id = ?`, status, message, startedAt, startedAt, finishedAt, finishedAt, taskID)
	if err != nil {
		return fmt.Errorf("update Findz task: %w", err)
	}
	return nil
}

func updateTaskCounters(runtime *libraryRuntime, taskID string, archivesDone int64, membersDone int64, membersSkipped int64, membersFailed int64) error {
	_, err := runtime.db.Exec(`UPDATE task SET done_archives = ?, done_members = ?, skipped_members = ?, failed_members = ? WHERE id = ?`,
		archivesDone, membersDone, membersSkipped, membersFailed, taskID)
	if err != nil {
		return fmt.Errorf("update Findz task progress: %w", err)
	}
	return nil
}

func setTaskTotals(runtime *libraryRuntime, taskID string, archives int64, members int64) error {
	_, err := runtime.db.Exec(`UPDATE task SET total_archives = ?, total_members = ? WHERE id = ?`, archives, members, taskID)
	if err != nil {
		return fmt.Errorf("set Findz task totals: %w", err)
	}
	return nil
}

func isTerminalTaskStatus(status string) bool {
	switch status {
	case "completed", "completed_with_warnings", "failed", "cancelled":
		return true
	default:
		return false
	}
}

func (service *findzService) installTaskController(taskID string) *taskController {
	controller := newTaskController()
	service.mu.Lock()
	service.taskControls[taskID] = controller
	service.mu.Unlock()
	return controller
}

func (service *findzService) taskController(taskID string) *taskController {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.taskControls[taskID]
}

func (service *findzService) removeTaskController(taskID string) {
	service.mu.Lock()
	delete(service.taskControls, taskID)
	service.mu.Unlock()
}

func (service *findzService) pauseTask(runtime *libraryRuntime, taskID string) (taskRecord, error) {
	task, err := readTask(runtime, taskID)
	if err != nil {
		return task, err
	}
	if isTerminalTaskStatus(task.Status) {
		return task, fmt.Errorf("cannot pause terminal task %s", taskID)
	}
	if controller := service.taskController(taskID); controller != nil {
		controller.pause()
	}
	if err := updateTask(runtime, taskID, "paused", "Paused by user."); err != nil {
		return task, err
	}
	return readTask(runtime, taskID)
}

func (service *findzService) resumeTask(runtime *libraryRuntime, taskID string) (taskRecord, error) {
	task, err := readTask(runtime, taskID)
	if err != nil {
		return task, err
	}
	if task.Status != "paused" && task.Status != "queued" {
		return task, fmt.Errorf("cannot resume task in state %s", task.Status)
	}
	if controller := service.taskController(taskID); controller != nil {
		controller.resume()
		if err := updateTask(runtime, taskID, "running", "Resumed."); err != nil {
			return task, err
		}
		return readTask(runtime, taskID)
	}

	if task.Kind == "analysis" {
		if err := service.resumeStoredAnalysis(runtime, task); err != nil {
			return task, err
		}
	} else if task.Kind == "scan" || task.Kind == "watcher" {
		if err := service.resumeStoredScan(runtime, task); err != nil {
			return task, err
		}
	} else {
		return task, fmt.Errorf("unsupported resumable task kind: %s", task.Kind)
	}
	return readTask(runtime, taskID)
}

func (service *findzService) cancelTask(runtime *libraryRuntime, taskID string) (taskRecord, error) {
	task, err := readTask(runtime, taskID)
	if err != nil {
		return task, err
	}
	if isTerminalTaskStatus(task.Status) {
		return task, nil
	}
	if controller := service.taskController(taskID); controller != nil {
		controller.cancel()
	}
	if err := updateTask(runtime, taskID, "cancelled", "Cancelled by user."); err != nil {
		return task, err
	}
	service.mu.Lock()
	if service.activeImageAnalysisTask == taskID {
		service.activeImageAnalysisTask = ""
	}
	service.mu.Unlock()
	return readTask(runtime, taskID)
}
