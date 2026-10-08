package main

import (
	"encoding/json"
	"fmt"
)

const (
	findzABIVersion       = 1
	findzRequestVersion   = 1
	defaultPageSize       = 200
	maximumPageSize       = 1_000
	defaultAnalysisPolicy = "image-header-v1"
)

type requestEnvelope struct {
	RequestVersion int             `json:"requestVersion"`
	RequestID      string          `json:"requestId"`
	Method         string          `json:"method"`
	Params         json.RawMessage `json:"params"`
}

type responseEnvelope struct {
	OK        bool        `json:"ok"`
	RequestID string      `json:"requestId,omitempty"`
	Result    interface{} `json:"result,omitempty"`
	Error     *findzError `json:"error,omitempty"`
}

type findzError struct {
	Code      string      `json:"code"`
	Message   string      `json:"message"`
	Retryable bool        `json:"retryable"`
	Details   interface{} `json:"details,omitempty"`
}

func success(requestID string, result interface{}) responseEnvelope {
	return responseEnvelope{OK: true, RequestID: requestID, Result: result}
}

func failure(requestID string, code string, err error, retryable bool, details interface{}) responseEnvelope {
	message := "Unknown Findz error."
	if err != nil {
		message = err.Error()
	}
	return responseEnvelope{
		OK:        false,
		RequestID: requestID,
		Error:     &findzError{Code: code, Message: message, Retryable: retryable, Details: details},
	}
}

func decodeParams[T any](raw json.RawMessage) (T, error) {
	var value T
	if len(raw) == 0 || string(raw) == "null" {
		return value, nil
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return value, fmt.Errorf("invalid request params: %w", err)
	}
	return value, nil
}

type apiInfo struct {
	ABIVersion       int      `json:"abiVersion"`
	CoreVersion      string   `json:"coreVersion"`
	RequestVersions  []int    `json:"requestVersions"`
	Capabilities     []string `json:"capabilities"`
	SupportedFormats []string `json:"supportedFormats"`
}

func currentAPIInfo() apiInfo {
	return apiInfo{
		ABIVersion:      findzABIVersion,
		CoreVersion:     "0.1.0",
		RequestVersions: []int{findzRequestVersion},
		Capabilities: []string{
			"library.open",
			"library.close",
			"scan.start",
			"scan.reconcile",
			"watcher.apply_changes",
			"watcher.set_health",
			"query.archives",
			"query.members",
			"export.rows",
			"projection.treemap",
			"analysis.start",
			"task.get",
			"task.pause",
			"task.resume",
			"task.cancel",
		},
		SupportedFormats: []string{"jpeg", "png", "gif", "webp", "avif", "heif"},
	}
}
