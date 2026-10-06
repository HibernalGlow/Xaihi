/**
 * 防抖回调 hook。
 *
 * 把一个回调函数包装为防抖版本：在最后一次调用后等待 `delay` 毫秒才真正执行，
 * 期间再次调用会重置计时器。用于筛选条件输入、搜索框等高频触发场景。
 *
 * 内部用 useCallbackRef 持有最新 callback，避免 callback 变化导致防抖计时器失效；
 * 卸载时通过 useEffect 清理未触发的计时器，防止内存泄漏与卸载后调用 setState。
 *
 * @param callback 实际要执行的回调
 * @param delay 防抖延迟（毫秒）
 * @returns 防抖后的回调函数（签名与原回调一致）
 */
import * as React from "react";

import { useCallbackRef } from "@/hooks/use-callback-ref";

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
) {
  const handleCallback = useCallbackRef(callback);
  const debounceTimerRef = React.useRef(0);
  React.useEffect(
    () => () => window.clearTimeout(debounceTimerRef.current),
    [],
  );

  const setValue = React.useCallback(
    (...args: Parameters<T>) => {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(
        () => handleCallback(...args),
        delay,
      );
    },
    [handleCallback, delay],
  );

  return setValue;
}
