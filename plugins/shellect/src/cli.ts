#!/usr/bin/env node
import { exportMenu } from "../lib/native/export.mjs";
import { uninstallMenu } from "../lib/native/uninstall.mjs";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { menuEndpoint } from "../lib/native/bridge.mjs";
//#region src/cli.ts
async function main(args = process.argv.slice(2)) {
	if (!args.length || args.includes("--help")) return `Shellect — Xaihi selection actions\n
shellect catalog [--platform darwin|win32|linux] --endpoint http://127.0.0.1:PORT
shellect configure --platform PLATFORM [--id PROVIDER.ACTION] [--enabled true|false] [--title TITLE] [--order N] --expected-revision N --endpoint URL
shellect reset --platform PLATFORM [--id PROVIDER.ACTION] --expected-revision N --endpoint URL
shellect menu export --output ABSOLUTE_DIR --endpoint URL [--platform PLATFORM]
shellect menu install --output ABSOLUTE_DIR --endpoint URL
shellect menu uninstall --endpoint URL [--source ABSOLUTE_DIR]

No Electron desktop installation is needed. Action providers run in your npm DSH host.`;
	const command = args[0];
	const start = command === "menu" ? 2 : 1;
	const options = /* @__PURE__ */ new Map();
	for (let i = start; i < args.length; i += 2) {
		const key = args[i], value = args[i + 1];
		if (!key.startsWith("--") || value === void 0 || value.startsWith("--") || options.has(key)) throw new Error(`Shellect: expected a unique --option value: ${key}`);
		if (![
			"--platform",
			"--endpoint",
			"--output",
			"--source",
			"--id",
			"--enabled",
			"--title",
			"--order",
			"--expected-revision"
		].includes(key)) throw new Error(`Shellect: unknown option: ${key}`);
		options.set(key, value);
	}
	const endpoint = options.get("--endpoint");
	if (command === "menu") {
		if (args[1] === "uninstall") {
			if (endpoint) return nativeEdit("uninstall_menu", endpoint, options);
			return uninstallMenu(options.has("--source") ? { source: options.get("--source") } : {});
		}
		if (!["export", "install"].includes(args[1]) || !endpoint) throw new Error("Shellect: menu export/install needs --output and --endpoint");
		const output = options.get("--output");
		if (!output || !isAbsolute(output)) throw new Error("Shellect: --output must be an absolute persistent directory");
		if (args[1] === "install" && options.has("--platform") && options.get("--platform") !== process.platform) throw new Error("Shellect: install on the target operating system");
		if (args[1] === "install") return nativeEdit("install_menu", endpoint, options);
		return await exportMenu({
			output,
			endpoint,
			...options.has("--platform") ? { platform: options.get("--platform") } : {}
		});
	}
	if (![
		"catalog",
		"configure",
		"reset"
	].includes(command) || !endpoint) throw new Error("Shellect: catalog/configure/reset requires --endpoint; see --help");
	const url = new URL("/xaihi/runner", menuEndpoint(endpoint));
	const input = { action: command };
	for (const key of [
		"platform",
		"id",
		"title"
	]) if (options.has(`--${key}`)) input[key] = options.get(`--${key}`);
	for (const [key, flag] of [["order", "--order"], ["expectedRevision", "--expected-revision"]]) if (options.has(flag)) {
		const value = options.get(flag);
		if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Shellect: ${flag} must be an integer`);
		input[key] = Number(value);
	}
	if (options.has("--enabled")) {
		const enabled = options.get("--enabled");
		if (enabled !== "true" && enabled !== "false") throw new Error("Shellect: --enabled must be true or false");
		input.enabled = enabled === "true";
	}
	if (command !== "catalog" && !Number.isSafeInteger(input.expectedRevision)) throw new Error("Shellect: --expected-revision is required; read catalog first");
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			nodeId: "shellect",
			input
		}),
		signal: AbortSignal.timeout(3e4)
	});
	const result = await response.json();
	if (!response.ok || !result.success) throw new Error(result.message ?? `Shellect: HTTP ${response.status}`);
	return result.data;
}
async function nativeEdit(action, endpoint, options) {
	const url = new URL("/xaihi/runner", menuEndpoint(endpoint));
	const call = async (input) => {
		const response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				nodeId: "shellect",
				input
			}),
			signal: AbortSignal.timeout(6e4)
		});
		const result = await response.json();
		if (!response.ok || !result.success) throw new Error(result.message ?? `Shellect: HTTP ${response.status}`);
		return result.data;
	};
	const catalog = await call({ action: "catalog" });
	const expectedRevision = options.has("--expected-revision") ? Number(options.get("--expected-revision")) : catalog.revision;
	if (!Number.isSafeInteger(expectedRevision)) throw new Error("Shellect: native install needs writable DSH settings; read catalog first");
	const result = await call({
		action,
		directory: options.get("--output"),
		node: process.execPath,
		endpoint,
		expectedRevision
	});
	if (result.status !== "conflict" && result.catalog?.nativeMenuState?.status === "error") throw new Error(result.catalog.nativeMenuState.message);
	return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) try {
	const result = await main();
	console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
	if (typeof result === "object" && result !== null && "status" in result && result.status === "conflict") process.exitCode = 2;
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
//#endregion
export { main };
// Restored from the last verified distributable.
// @ts-nocheck
