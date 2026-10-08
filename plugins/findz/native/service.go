package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

const (
	maximumRequestIDBytes   = 256
	maximumMutationReceipts = 1_024
)

type findzService struct {
	mu                      sync.Mutex
	libraries               map[string]*libraryRuntime
	taskControls            map[string]*taskController
	activeImageAnalysisTask string
	mutationMu              sync.Mutex
	mutationReceipts        map[string]responseEnvelope
	mutationReceiptOrder    []string
}

func newFindzService() *findzService {
	return &findzService{
		libraries:        make(map[string]*libraryRuntime),
		taskControls:     make(map[string]*taskController),
		mutationReceipts: make(map[string]responseEnvelope),
	}
}

func (service *findzService) handle(raw []byte) responseEnvelope {
	var request requestEnvelope
	if err := json.Unmarshal(raw, &request); err != nil {
		return failure("", "invalid_request", err, false, nil)
	}
	if request.RequestVersion != findzRequestVersion {
		return failure(request.RequestID, "unsupported_request_version", fmt.Errorf("request version %d is not supported", request.RequestVersion), false, currentAPIInfo())
	}
	if request.Method == "" {
		return failure(request.RequestID, "invalid_request", fmt.Errorf("request method is required"), false, nil)
	}
	if len(request.RequestID) > maximumRequestIDBytes {
		return failure("", "invalid_request", fmt.Errorf("request id exceeds %d bytes", maximumRequestIDBytes), false, nil)
	}
	if isMutationMethod(request.Method) {
		if strings.TrimSpace(request.RequestID) == "" {
			return failure("", "invalid_request", fmt.Errorf("request id is required for mutating method %s", request.Method), false, nil)
		}
		return service.dispatchMutation(request)
	}
	return service.dispatch(request)
}

func (service *findzService) dispatchMutation(request requestEnvelope) responseEnvelope {
	service.mutationMu.Lock()
	defer service.mutationMu.Unlock()
	if cached, found := service.mutationReceipts[request.RequestID]; found {
		return cached
	}
	response := service.dispatch(request)
	if response.OK {
		service.rememberMutation(request.RequestID, response)
	}
	return response
}

func (service *findzService) rememberMutation(requestID string, response responseEnvelope) {
	service.mutationReceipts[requestID] = response
	service.mutationReceiptOrder = append(service.mutationReceiptOrder, requestID)
	if len(service.mutationReceiptOrder) <= maximumMutationReceipts {
		return
	}
	oldest := service.mutationReceiptOrder[0]
	service.mutationReceiptOrder = service.mutationReceiptOrder[1:]
	delete(service.mutationReceipts, oldest)
}

func isMutationMethod(method string) bool {
	switch method {
	case "library.open", "library.close", "scan.start", "scan.reconcile", "watcher.apply_changes", "watcher.set_health", "analysis.start", "task.pause", "task.resume", "task.cancel":
		return true
	default:
		return false
	}
}

func (service *findzService) dispatch(request requestEnvelope) responseEnvelope {
	switch request.Method {
	case "library.open":
		params, err := decodeParams[libraryOpenParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := openLibraryDatabase(params)
		if err != nil {
			return failure(request.RequestID, "library_open_failed", err, false, nil)
		}
		service.mu.Lock()
		previous := service.libraries[runtime.id]
		if previous != nil && previous.root == runtime.root && previous.databasePath == runtime.databasePath {
			service.mu.Unlock()
			_ = runtime.db.Close()
			summary, summaryErr := librarySummaryFor(previous)
			if summaryErr != nil {
				return failure(request.RequestID, "library_read_failed", summaryErr, true, nil)
			}
			return success(request.RequestID, summary)
		}
		service.libraries[runtime.id] = runtime
		service.mu.Unlock()
		if previous != nil {
			_ = previous.db.Close()
		}
		summary, err := librarySummaryFor(runtime)
		if err != nil {
			return failure(request.RequestID, "library_read_failed", err, true, nil)
		}
		return success(request.RequestID, summary)
	case "library.close":
		params, err := decodeParams[scanParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		if err := service.closeLibrary(params.LibraryID); err != nil {
			return failure(request.RequestID, "library_close_failed", err, true, nil)
		}
		return success(request.RequestID, map[string]string{"libraryId": params.LibraryID})
	case "scan.start", "scan.reconcile":
		params, err := decodeParams[scanParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		var task taskRecord
		if request.Method == "scan.reconcile" {
			task, err = service.startReconciliation(runtime)
		} else {
			task, err = service.startScan(runtime)
		}
		if err != nil {
			return failure(request.RequestID, "scan_start_failed", err, true, nil)
		}
		return success(request.RequestID, task)
	case "watcher.apply_changes":
		params, err := decodeParams[watcherApplyParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		task, err := service.applyWatcherChanges(runtime, params.Changes)
		if err != nil {
			return failure(request.RequestID, "watcher_apply_failed", err, true, nil)
		}
		return success(request.RequestID, task)
	case "watcher.set_health":
		params, err := decodeParams[watcherHealthParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		summary, err := setWatcherHealth(runtime, params.Health)
		if err != nil {
			return failure(request.RequestID, "watcher_health_failed", err, false, nil)
		}
		return success(request.RequestID, summary)
	case "analysis.start":
		params, err := decodeParams[analysisStartParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		task, err := service.startAnalysis(runtime, params.Scope)
		if err != nil {
			return failure(request.RequestID, "analysis_start_failed", err, false, nil)
		}
		return success(request.RequestID, task)
	case "task.get", "task.pause", "task.resume", "task.cancel":
		params, err := decodeParams[taskControlParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		var task taskRecord
		switch request.Method {
		case "task.get":
			task, err = readTask(runtime, params.TaskID)
		case "task.pause":
			task, err = service.pauseTask(runtime, params.TaskID)
		case "task.resume":
			task, err = service.resumeTask(runtime, params.TaskID)
		case "task.cancel":
			task, err = service.cancelTask(runtime, params.TaskID)
		}
		if err != nil {
			return failure(request.RequestID, "task_operation_failed", err, false, nil)
		}
		return success(request.RequestID, task)
	case "query.archives":
		params, err := decodeParams[archiveQueryParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		result, err := queryArchives(runtime, params)
		if err != nil {
			return failure(request.RequestID, "query_failed", err, false, nil)
		}
		return success(request.RequestID, result)
	case "export.rows":
		params, err := decodeParams[archiveQueryParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		result, err := queryArchives(runtime, params)
		if err != nil {
			return failure(request.RequestID, "export_failed", err, false, nil)
		}
		return success(request.RequestID, result)
	case "query.members":
		params, err := decodeParams[memberQueryParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		result, err := queryMembers(runtime, params)
		if err != nil {
			return failure(request.RequestID, "query_failed", err, false, nil)
		}
		return success(request.RequestID, result)
	case "projection.treemap":
		params, err := decodeParams[treemapParams](request.Params)
		if err != nil {
			return failure(request.RequestID, "invalid_params", err, false, nil)
		}
		runtime, err := service.library(params.LibraryID)
		if err != nil {
			return failure(request.RequestID, "library_not_open", err, false, nil)
		}
		result, err := buildTreemapProjection(runtime, params)
		if err != nil {
			return failure(request.RequestID, "projection_failed", err, false, nil)
		}
		return success(request.RequestID, result)
	default:
		return failure(request.RequestID, "unsupported_method", fmt.Errorf("unsupported Findz method: %s", request.Method), false, currentAPIInfo())
	}
}

func (service *findzService) library(libraryID string) (*libraryRuntime, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	runtime := service.libraries[libraryID]
	if runtime == nil {
		return nil, fmt.Errorf("Findz library is not open: %s", libraryID)
	}
	return runtime, nil
}

func (service *findzService) closeLibrary(libraryID string) error {
	service.mu.Lock()
	runtime := service.libraries[libraryID]
	if runtime != nil {
		delete(service.libraries, libraryID)
	}
	service.mu.Unlock()
	if runtime == nil {
		return fmt.Errorf("Findz library is not open: %s", libraryID)
	}
	if err := runtime.db.Close(); err != nil {
		return fmt.Errorf("close Findz library: %w", err)
	}
	return nil
}
