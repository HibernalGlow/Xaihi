//go:build cshared

package main

/*
#include <stdint.h>
#include <stdlib.h>
*/
import "C"

import (
	"encoding/json"
	"math"
	"unsafe"
)

//export findz_abi_version
func findz_abi_version() C.uint32_t {
	return C.uint32_t(findzABIVersion)
}

//export findz_api_info
func findz_api_info(responseLength *C.size_t) *C.uchar {
	return marshalNativeResponse(responseLength, success("", currentAPIInfo()))
}

//export findz_call
func findz_call(request *C.uchar, requestLength C.size_t, responseLength *C.size_t) *C.uchar {
	if request == nil || uint64(requestLength) > math.MaxInt32 {
		return marshalNativeResponse(responseLength, failure("", "invalid_request", nil, false, nil))
	}
	bytes := C.GoBytes(unsafe.Pointer(request), C.int(requestLength))
	return marshalNativeResponse(responseLength, sharedFindzService.handle(bytes))
}

//export findz_free
func findz_free(response *C.uchar) {
	if response != nil {
		C.free(unsafe.Pointer(response))
	}
}

func marshalNativeResponse(responseLength *C.size_t, response responseEnvelope) *C.uchar {
	bytes, err := json.Marshal(response)
	if err != nil {
		bytes = []byte(`{"ok":false,"error":{"code":"response_encode_failed","message":"Findz could not encode its response.","retryable":false}}`)
	}
	if responseLength != nil {
		*responseLength = C.size_t(len(bytes))
	}
	if len(bytes) == 0 {
		return nil
	}
	return (*C.uchar)(C.CBytes(bytes))
}

func main() {}
