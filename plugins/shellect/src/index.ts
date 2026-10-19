import { createRequire } from "node:module";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { exportMenu } from "../lib/native/export.mjs";
import { installMenu } from "../lib/native/install.mjs";
import { uninstallMenu } from "../lib/native/uninstall.mjs";
import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
//#region ../../packages/node-sdk/lib/operations.js
/** 挂在 `ctx` 上的服务名；由 xaihi-core 提供。 */
const OPERATIONS_SERVICE = "xaihiOperations";
/** 空句柄：没有 journal 时动作也要能跑，因此进度上报必须是无操作而不是抛。 */
const NULL_RUN = {
	runId: "none",
	signal: new AbortController().signal,
	progress() {},
	preview() {},
	resultView() {},
	checkpoint() {}
};
//#endregion
//#region ../../packages/node-sdk/lib/desktop-windows-CpGO1zEk.js
/**
* 桥上的方法名 = `<组>.<成员>`，成员名逐字取自上游那九个接口。
* 只列**可序列化**的那些：`runner.run` 的 `onEvent` 回调不在桥上走（见模块注释），
* `localFiles.stageFiles(File[])` 收的是浏览器 File 对象，只能在文档侧就地处理，
* `localFiles.subscribeDrops` 交回的是取消函数——这两处的实现因此属于文档内部，不属于桥。
*/
const BRIDGE_METHODS = [
	"state.getData",
	"state.patchData",
	"state.replaceData",
	"workspace.listComponents",
	"workspace.updateComponent",
	"runner.run",
	"runner.getInfo",
	"runner.cancelCurrent",
	"clipboard.readText",
	"clipboard.writeText",
	"clipboard.readFiles",
	"clipboard.writeFiles",
	"clipboard.clearFiles",
	"clipboard.readImage",
	"clipboard.writeImage",
	"downloads.text",
	"localFiles.getUrl",
	"localFiles.openPath",
	"localFiles.revealPath",
	"localFiles.pickFiles",
	"localFiles.pickDirectory",
	"localFiles.pickDirectories",
	"localFiles.list",
	"config.get",
	"config.save",
	"config.getPresets",
	"config.createPreset",
	"config.updatePreset",
	"config.deletePreset",
	"config.getVersions",
	"config.inspectVersion",
	"config.restoreVersion",
	"config.exportConfig",
	"config.importConfig",
	"config.createBackup",
	"config.getHistoryRepository",
	"config.setHistoryRemote",
	"config.syncHistory",
	"config.getUi",
	"config.saveUi",
	"config.openFile"
];
/**
* 外壳**今天真能兑现**的那部分动词。这张表是"谁能实现这条"的唯一记录处，
* 因为不写下来时，剩下那 13 条 `config.*` 看起来就像"照着名字实现就行"——
* 而那条路通向的是伪造一份 DSH 没给的东西（AGENTS.md「不碰 DSH 的三样东西」）。
*
* 出处：DSH 0.2.0-rc.2 的 `@deepseek-ai/dsh-api-settings-controller` 只有
* `describe` / `update` / `replace` / `mutate` / `openSettingsDocument` 五个动词
* （实测自 `lib/types/index.d.ts:49-85`）。presets、版本历史、备份、远程同步、导出导入
* 在那一侧**没有任何对应物**，所以 `SHELL_UNSERVED` 里那批只能提 proposal（见 P1 的同一条纪律），
* 或者由界面明确显示"这一格没有提供者"。
*/
const SHELL_SERVED_METHODS = [
	"config.get",
	"config.save",
	"config.getUi",
	"config.saveUi",
	"config.openFile",
	"state.getData",
	"state.patchData",
	"state.replaceData"
];
BRIDGE_METHODS.filter((method) => !SHELL_SERVED_METHODS.includes(method));
//#endregion
//#region ../../packages/node-sdk/lib/index.js
/** Cordis 服务名是跨包共享的唯一入口；不使用各 bundle 自己的模块单例。 */
const SHELLECT_SERVICE = "xaihiShellect";
const SHELLECT_ACTIONS_PATH = "/xaihi/shellect/actions";
const SHELLECT_PLATFORMS = [
	"win32",
	"darwin",
	"linux"
];
/** 字段输入控件类型。 */
const NODE_FIELD_KINDS = [
	"text",
	"multiline",
	"path-list",
	"number",
	"select",
	"boolean"
];
/** 条件组合方式，对应 Rust `Condition` 枚举。 */
const CONDITION_KINDS = [
	"single",
	"all",
	"any",
	"anyAll"
];
/** 校验规则类型。 */
const RULE_KINDS = [
	"required",
	"nonBlank",
	"integerAtLeast",
	"integerInRange",
	"numberAtLeast",
	"numberInRange",
	"oneOfDeclaredOptions",
	"atLeastLines",
	"anyFilled",
	"custom"
];
/** 危险闸门类型。 */
const DANGER_KINDS = [
	"none",
	"actionIn",
	"fieldFlag",
	"all",
	"any",
	"pluginExport"
];
/** 输入绑定变换。 */
const TRANSFORMS = [
	"identity",
	"trim",
	"lines",
	"delimited",
	"trimOrOmit",
	"asInteger",
	"asBoolean"
];
/** help 面向的使用面。 */
const HELP_SURFACES = [
	"ui",
	"cli",
	"tips"
];
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isLocalized = (value) => isPlainObject(value) && Object.keys(value).sort().join(",") === "en,zh" && typeof value.zh === "string" && value.zh.trim() !== "" && typeof value.en === "string" && value.en.trim() !== "";
const inList = (value, list) => typeof value === "string" && list.includes(value);
/**
* 顶层结构校验一份节点定义。
* @param raw - 通常来自节点包的 `xaihi.node`。
* @returns 归一化定义，或全部结构问题。
*/
function validateNodeDefinition(raw) {
	const errors = [];
	if (!isPlainObject(raw)) return {
		ok: false,
		errors: ["node definition must be an object"]
	};
	if (raw.definitionVersion !== 1) return {
		ok: false,
		errors: [`unsupported definitionVersion: ${String(raw.definitionVersion)} (expected 1)`]
	};
	if (typeof raw.nodeId !== "string" || raw.nodeId === "") errors.push("nodeId is required");
	if (!isLocalized(raw.title)) errors.push("title must carry both zh and en, neither blank");
	if (!isLocalized(raw.description)) errors.push("description must carry both zh and en, neither blank");
	const fieldIds = /* @__PURE__ */ new Set();
	const actionIds = /* @__PURE__ */ new Set();
	for (const [index, action] of (Array.isArray(raw.actions) ? raw.actions : []).entries()) {
		const at = `actions[${index}]`;
		if (!isPlainObject(action) || typeof action.id !== "string" || action.id === "") {
			errors.push(`${at}.id is required`);
			continue;
		}
		if (actionIds.has(action.id)) errors.push(`${at}.id duplicates "${action.id}"`);
		actionIds.add(action.id);
		if (!isLocalized(action.label)) errors.push(`${at}.label must carry both zh and en`);
	}
	const fieldArray = Array.isArray(raw.fields) ? raw.fields : [];
	if (!Array.isArray(raw.fields)) errors.push("fields must be an array");
	for (const [index, field] of fieldArray.entries()) {
		const at = `fields[${index}]`;
		if (!isPlainObject(field) || typeof field.id !== "string" || field.id === "") {
			errors.push(`${at}.id is required`);
			continue;
		}
		if (fieldIds.has(field.id)) errors.push(`${at}.id duplicates "${field.id}"`);
		fieldIds.add(field.id);
		if (!inList(field.kind, NODE_FIELD_KINDS)) errors.push(`${at}.kind ${JSON.stringify(field.kind)} is not in ${NODE_FIELD_KINDS.join(", ")}`);
		if (!isLocalized(field.label)) errors.push(`${at}.label must carry both zh and en`);
		if (field.kind === "select" && !(Array.isArray(field.options) && field.options.length > 0)) errors.push(`${at}: a select field must offer options`);
		if (field.range !== void 0 && field.kind !== "number") errors.push(`${at}: range belongs to number fields only`);
		if (isPlainObject(field.range) && typeof field.range.min === "number" && typeof field.range.max === "number" && field.range.min > field.range.max) errors.push(`${at}: range.min ${String(field.range.min)} exceeds range.max ${String(field.range.max)}`);
		if (field.default !== void 0 && field.default !== null && typeof field.default === "object" && !Array.isArray(field.default)) {
			const onlyKey = Object.keys(field.default)[0];
			const expected = field.kind === "number" ? "number" : field.kind === "boolean" ? "boolean" : "text";
			if (onlyKey !== void 0 && onlyKey !== expected) errors.push(`${at}: default ${onlyKey} does not match kind ${String(field.kind)}`);
		}
		for (const [ruleIndex, rule] of (Array.isArray(field.rules) ? field.rules : []).entries()) {
			const where = `${at}.rules[${ruleIndex}]`;
			if (!isPlainObject(rule) || !("rule" in rule)) {
				errors.push(`${where} must be a guarded rule object: {rule, when?}`);
				continue;
			}
			const body = rule.rule;
			if (!isPlainObject(body) || !inList(body.type, RULE_KINDS)) errors.push(`${where}.rule.type is not in ${RULE_KINDS.join(", ")}`);
			const guard = rule.when;
			if (guard !== void 0 && (!isPlainObject(guard) || !inList(guard.type, CONDITION_KINDS))) errors.push(`${where}.when.type is not in ${CONDITION_KINDS.join(", ")}`);
		}
		if (field.visible !== void 0 && !isPlainObject(field.visible)) errors.push(`${at}.visible must be an object`);
		else if (field.visible !== void 0 && !inList(field.visible.type, CONDITION_KINDS)) errors.push(`${at}.visible.type is not in ${CONDITION_KINDS.join(", ")}`);
	}
	for (const [index, group] of (Array.isArray(raw.groups) ? raw.groups : []).entries()) {
		const at = `groups[${index}]`;
		if (!isPlainObject(group) || !Array.isArray(group.fieldIds)) {
			errors.push(`${at}.fieldIds must be an array`);
			continue;
		}
		for (const id of group.fieldIds) if (!fieldIds.has(String(id))) errors.push(`${at}.fieldIds references unknown field "${String(id)}"`);
	}
	for (const [index, binding] of (Array.isArray(raw.inputBindings) ? raw.inputBindings : []).entries()) {
		const at = `inputBindings[${index}]`;
		if (!isPlainObject(binding)) {
			errors.push(`${at} must be an object`);
			continue;
		}
		if (!fieldIds.has(String(binding.fieldId))) errors.push(`${at}.fieldId references unknown field "${String(binding.fieldId)}"`);
		if (typeof binding.slot !== "string" || binding.slot === "") errors.push(`${at}.slot is required`);
		if (binding.transform !== void 0 && !inList(binding.transform, TRANSFORMS)) errors.push(`${at}.transform is not in ${TRANSFORMS.join(", ")}`);
	}
	if (raw.danger !== void 0) {
		if (!isPlainObject(raw.danger) || !inList(raw.danger.type, DANGER_KINDS)) errors.push(`danger.type must be one of ${DANGER_KINDS.join(", ")} (use {type: "none"} when nothing is dangerous)`);
	}
	if (raw.runTimeoutMs !== void 0) {
		const declared = raw.runTimeoutMs;
		if (typeof declared !== "number" || !Number.isFinite(declared) || declared < 0) errors.push(`runTimeoutMs must be a finite number >= 0 (0 = 明确不限), got ${JSON.stringify(declared)}`);
	}
	if (raw.help !== void 0 && !isPlainObject(raw.help)) errors.push("help must be an object");
	if (raw.help !== void 0 && isPlainObject(raw.help)) {
		const workflows = raw.help.workflows;
		if (workflows !== void 0) {
			const line = (value, where) => {
				if (typeof value === "string") return;
				if (isPlainObject(value)) {
					const zh = value.zh;
					const en = value.en;
					if (typeof zh !== "string" || typeof en !== "string") errors.push(`help.workflows ${where}: 每个语言都得是非空字符串（{zh,en}），不是串也别是半边`);
					return;
				}
				errors.push(`help.workflows ${where}: 只收 string 或 {zh,en}`);
			};
			if (Array.isArray(workflows)) for (const [at, block] of workflows.entries()) {
				if (!isPlainObject(block)) {
					errors.push(`help.workflows[${at}]: 块必须是对象`);
					continue;
				}
				const entry = block;
				for (const field of ["title", "summary"]) if (entry[field] !== void 0) line(entry[field], `[${at}].${field}`);
				for (const surface of HELP_SURFACES) {
					const steps = entry[surface];
					if (steps === void 0) continue;
					const asObject = isPlainObject(steps) ? [steps.zh, steps.en] : [];
					const lists = Array.isArray(steps) ? [steps] : asObject;
					if (!Array.isArray(steps) && !isPlainObject(steps)) {
						errors.push(`help.workflows[${at}].${surface} 必须是数组，或 {zh:[],en:[]} 两份`);
						continue;
					}
					for (const list of lists) {
						if (!Array.isArray(list)) {
							errors.push(`help.workflows[${at}].${surface} 的 zh/en 两份都必须是数组`);
							continue;
						}
						for (const [index, step] of list.entries()) line(step, `[${at}].${surface}[${index}]`);
					}
				}
			}
			else if (isPlainObject(workflows)) for (const [surface, steps] of Object.entries(workflows)) {
				if (!HELP_SURFACES.includes(surface)) errors.push(`help.workflows 用了不认识的面 "${surface}"（可写的是 ${HELP_SURFACES.join(", ")}）`);
				if (!Array.isArray(steps) || steps.some((step) => typeof step !== "string")) errors.push(`help.workflows.${surface} 扁平那一形必须是 string[]`);
			}
			else errors.push("help.workflows 只能是块数组或按面分组的对象");
		}
	}
	if (errors.length > 0) return {
		ok: false,
		errors
	};
	return {
		ok: true,
		value: raw
	};
}
/** 解包 `{text|number|boolean}` 三取一的标量。 */
function scalarOf(value) {
	if (value === void 0 || typeof value !== "object") return void 0;
	if ("text" in value) return value.text;
	if ("number" in value) return value.number;
	if ("boolean" in value) return value.boolean;
}
function asText(value) {
	if (typeof value === "string") return value;
	if (value === void 0 || value === null) return "";
	return String(value);
}
function filled(value) {
	if (value === void 0 || value === null) return false;
	if (typeof value === "string") return value.trim() !== "";
	if (Array.isArray(value)) return value.length > 0;
	return true;
}
/**
* 求值一个测试。
* @param test - 条件叶子。
* @param args - 调用参数。
* @param actionId - 当前动作（`actionIs` 未给 actionField 时用它）。
*/
function matchTest(test, args, actionId) {
	if (test === void 0) return false;
	switch (test.type) {
		case "always": return true;
		case "never": return false;
		case "actionIs": {
			const actual = test.actionField === void 0 ? actionId : asText(args[test.actionField]);
			return (test.allowed ?? []).map((entry) => asText(entry)).includes(actual ?? "");
		}
		case "fieldEquals": return args[test.fieldId ?? ""] === scalarOf(test.value);
		case "fieldFilled": return filled(args[test.fieldId ?? ""]);
		case "fieldTrue": return args[test.fieldId ?? ""] === true;
		case "numberAtLeast": {
			const value = args[test.fieldId ?? ""];
			const numeric = typeof value === "number" ? value : Number(asText(value));
			return Number.isFinite(numeric) && numeric >= (test.minimum ?? Number.NEGATIVE_INFINITY);
		}
	}
	return false;
}
/** 求值一个 `{test, negated}` 谓词。 */
function matchPredicate(predicate, args, actionId) {
	if (predicate === void 0) return false;
	const result = matchTest(predicate.test, args, actionId);
	return predicate.negated === true ? !result : result;
}
/**
* 求值一个条件；未声明条件视为可见。
* @param condition - 字段的 `visible` 或闸门的谓词组合。
* @param args - 调用参数。
* @param actionId - 当前动作。
*/
function matchCondition(condition, args, actionId) {
	if (condition === void 0) return true;
	switch (condition.type) {
		case "single": return matchPredicate(condition.predicate, args, actionId);
		case "all": return (condition.predicates ?? []).every((predicate) => matchPredicate(predicate, args, actionId));
		case "any": return (condition.predicates ?? []).some((predicate) => matchPredicate(predicate, args, actionId));
		case "anyAll": return (condition.clauses ?? []).some((clause) => clause.every((predicate) => matchPredicate(predicate, args, actionId)));
	}
	return false;
}
/** 规范化节点名称：剥离 `@hibernalglow/` 和 `xaihi-` 前缀以便多口径命中。 */
function normalizeNodeId(id) {
	return id.replace(/^@hibernalglow\//, "").replace(/^xaihi-/, "");
}
var NodeRegistry = class {
	nodes = /* @__PURE__ */ new Map();
	/**
	* 注册一个节点。如果已有同名节点，则覆盖；返回取消注册函数。
	*
	* 注销器**按身份判**：只有当表里那一格仍然是本次注册的条目时才摘除它。热更的落地顺序是
	* "先装新的、再卸旧的"，无条件按 key 删会把新实例一起摘掉（ABA）—— 症状是新插件刚装上
	* 就被上一条的注销器摘空。按身份判之后，同名重叠注册是幂等的：谁的注销器只摘谁那一条。
	*/
	register(entry) {
		const key = entry.nodeId;
		const norm = normalizeNodeId(key);
		this.nodes.set(key, entry);
		if (norm !== key) this.nodes.set(norm, entry);
		return () => {
			if (this.nodes.get(key) === entry) this.nodes.delete(key);
			if (norm !== key && this.nodes.get(norm) === entry) this.nodes.delete(norm);
		};
	}
	/**
	* 按 nodeId 显式注销（长短名字一起摘）。这是"立刻清掉"的入口；fiber 回收走 `register`
	* 返回的那个按身份判的注销器，两者刻意不同：显式注销是"我就要删这个名字"，注销器是
	* "只删我自己那一条"。
	*/
	unregister(nodeId) {
		const deleted1 = this.nodes.delete(nodeId);
		const deleted2 = this.nodes.delete(normalizeNodeId(nodeId));
		return deleted1 || deleted2;
	}
	get(nodeId) {
		return this.nodes.get(nodeId) ?? this.nodes.get(normalizeNodeId(nodeId));
	}
	has(nodeId) {
		return this.nodes.has(nodeId) || this.nodes.has(normalizeNodeId(nodeId));
	}
	list() {
		const seen = /* @__PURE__ */ new Set();
		for (const node of this.nodes.values()) seen.add(node);
		return [...seen];
	}
	/**
	* 运行一个节点的动作。
	* @param nodeId - 节点 ID（如 "findz", "linedup", "sleept" 或带包名前缀）。
	* @param input - 输入载荷（通常包含 action 字段及参数）。
	* @param onEvent - 可选的过程事件回调（progress, preview 等）。
	*/
	async run(nodeId, input, onEvent) {
		const entry = this.get(nodeId);
		if (!entry) return {
			success: false,
			message: `Node "${nodeId}" is not registered in local NodeRegistry`
		};
		if (entry.execute) try {
			return await entry.execute(input, onEvent);
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : String(error)
			};
		}
		const raw = typeof input === "object" && input !== null ? input : {};
		let actionId;
		if (typeof raw.actionId === "string" && raw.actionId !== "") actionId = raw.actionId;
		else if (typeof raw.action === "string" && raw.action !== "") actionId = raw.action;
		else {
			const selector = entry.definition.fields.find((f) => f.isActionSelector === true);
			if (selector && typeof raw[selector.id] === "string") actionId = String(raw[selector.id]);
			else if (entry.definition.actions.length === 1) actionId = entry.definition.actions[0]?.id;
			else if (entry.definition.actions.length > 0) actionId = entry.definition.actions[0]?.id;
		}
		if (!actionId) return {
			success: false,
			message: `Node "${nodeId}" requires an action, but none was provided or deduced`
		};
		return await entry.run(actionId, raw, onEvent);
	}
	/**
	* 中止一次在飞运行。
	*
	* 为什么遍历而不是按 runId 直接查表：runId 是账本在 `defineNode` 里面生成的，注册表
	* 在调用之前无从预知，所以它今天没有"runId → 节点"的索引可查（要加就得让 run 的发起方
	* 回填，而 `execute` 那条覆盖路径不经过这里，回填会漏）。条目自己答"这条是不是我的"
	* 才是两侧都成立的形状；表只有几十个节点，线性扫不是代价。
	* @param runId - 要中止哪一次运行。
	* @returns 有没有真按下中止键；未知 runId 回 false（不是回 true 假装取消了）。
	*/
	async cancel(runId) {
		for (const entry of this.list()) if (entry.cancelRun?.(runId) === true) return true;
		return false;
	}
	/**
	* 取消"此刻在跑的那些"。面板上那条取消按钮走的是这一条（桥上只有 `runner.cancelCurrent`，
	* 它不带 runId —— 见 `host-bridge.ts` 的 `BRIDGE_METHODS`）。
	* @returns 至少按下一个中止键才回 true；一条都没在飞时回 false，而不是回 true 假装取消过。
	*/
	async cancelCurrent() {
		let cancelled = false;
		for (const entry of this.list()) for (const runId of entry.inFlightRuns?.() ?? []) if (entry.cancelRun?.(runId) === true) cancelled = true;
		return cancelled;
	}
	/**
	* 这个节点声明的一次运行硬上限（毫秒）；没声明回 null = 不设上限。
	* 与文档侧读的是同一份 `NodeDefinition.runTimeoutMs`，两侧不许各算各的。
	*/
	runTimeoutFor(nodeId) {
		return this.get(nodeId)?.definition.runTimeoutMs ?? null;
	}
};
/**
* 注册表挂在 `ctx` 上的服务名；由 xaihi-core 提供，节点侧经 `ctx.inject()` 取用。
*
* 为什么必须有这一格：`@hibernalglow/xaihi-sdk` 是被**内联**进每个包的（profile 解析不了
* `@hibernalglow/*`，见 `packages/core/tsdown.config.ts` 的 `noExternal` 与 ADR-0002），
* 所以下面那个模块级实例在装机产物里**每个包各一份**——实测三份 `const nodeRegistry = n()`
* 分别在 `xaihi-core/lib/`、`xaihi-linedup/lib/`、`xaihi-sleept/lib/`。节点写自己那份、
* core 的 Runner 读自己那份，症状是界面上 `Node "linedup" is not registered`。
* 跨包共享只能走 cordis 的服务表（`OPERATIONS_SERVICE` 早就是这么做的）。
*/
const NODE_REGISTRY_SERVICE = "xaihiNodeRegistry";
/**
* 把一份注册表接到宿主的服务表上：可用时注册，缺席时不注册（也不假装注册成功）。
*
* 节点脱离 xaihi-core 单独装时，回调永不触发 ⇒ 工具面照常，本地 Runner 查不到这一条。
* 那是**读得回的**缺席（`Node "x" is not registered`），不是静默假通过。
* @param ctx - 调用方的 cordis 上下文。
* @param register - 拿到共享注册表之后登记条目，返回 cordis 的注销器。
* @param service - 服务名，缺省 `NODE_REGISTRY_SERVICE`。
*/
function registerWithHost(ctx, register, service = NODE_REGISTRY_SERVICE) {
	ctx.inject([service], (scoped) => {
		const registry = scoped.get(service);
		if (registry === void 0) return;
		return register(registry);
	});
}
new NodeRegistry();
/**
* `defineNode` —— 把一份 `xaihi.node/v1` 定义接到 DSH 的工具与危险闸门上。
*
* 边界：本模块只产出 `ask` / `deny` 判定；审批渠道、审计与提示 UI 全部是 DSH 的
* （`tools/pre-execute` 返回 `ask` 后由 `ctx.get('approval')` 那条缝解析，没有
* ApprovalService 时按 DSH 规则降级为拒绝）。Xaihi 不重造审批系统。
*
* 参数表按动作生成：可见性条件与危险闸门共用 `conditions.ts` 那一个求值器，否则
* 模型看到的参数和界面看到的字段会分叉。
*
* 每次调用都开一条运行（`started` / `finished` / `failed` 自动补），动作实现经
* `call.run` 上报 `progress` / `preview` / `result_view`。没有 xaihi-core 时
* `journal` 缺省，进度上报是无操作而不是失败——节点必须能脱离工作台单独装。
*
* @module xaihi-sdk/define-node
*/
/**
* 取消之后回给面板的那句话。
*
* 后半句不许省：被取消的那次调用是**不再等**处理器，不是**停得下**处理器。
* 一个从不查 `signal.aborted` 的循环会照原样跑完，界面上说"已经停了"就是伪造
* （ADR-0011 决定 4：可以退化，不许静默、不许假）。
*/
const CANCELLED_MESSAGE = "已取消：这次调用不再等待结果。该节点若没在实现里查 signal.aborted，它的工作可能仍在继续。";
function fieldProperty(field) {
	const description = `${field.label.en} / ${field.label.zh}`;
	const required = (field.rules ?? []).some((entry) => entry.when === void 0 && (entry.rule.type === "required" || entry.rule.type === "nonBlank"));
	switch (field.kind) {
		case "text":
		case "multiline": return required ? {
			type: "string",
			description,
			required: true
		} : {
			type: "string",
			description
		};
		case "path-list": return required ? {
			type: "array",
			items: { type: "string" },
			description,
			required: true
		} : {
			type: "array",
			items: { type: "string" },
			description
		};
		case "number": return required ? {
			type: "number",
			description,
			required: true
		} : {
			type: "number",
			description
		};
		case "boolean": return required ? {
			type: "boolean",
			description,
			required: true
		} : {
			type: "boolean",
			description
		};
		case "select": {
			const values = (field.options ?? []).map((option) => option.value);
			return required ? {
				type: "string",
				description,
				enum: values,
				required: true
			} : {
				type: "string",
				description,
				enum: values
			};
		}
	}
}
/**
* 生成某个动作的参数表。
* @param definition - 已校验的节点定义。
* @param actionId - 当前动作；动作选择器本身不进参数表。
* @returns 该动作可见的字段参数表。
*/
function parametersFor(definition, actionId) {
	const selector = definition.fields.find((field) => field.isActionSelector === true);
	const args = selector === void 0 ? {} : { [selector.id]: actionId };
	const spec = {};
	for (const field of definition.fields) {
		if (field.isActionSelector === true) continue;
		if (!matchCondition(field.visible, args, actionId)) continue;
		spec[field.id] = fieldProperty(field);
	}
	return spec;
}
/** 应用一种绑定变换。 */
function transformValue(value, transform) {
	const absent = value === void 0 || value === null;
	const asText = (input) => typeof input === "string" ? input : input === void 0 || input === null ? "" : String(input);
	switch (transform) {
		case "identity": return value;
		case "trim": return absent ? void 0 : asText(value).trim();
		case "trimOrOmit": {
			const trimmed = asText(value).trim();
			return trimmed === "" ? void 0 : trimmed;
		}
		case "lines": return asText(value).split("\n").map((line) => line.trim()).filter((line) => line !== "");
		case "delimited": return asText(value).split(",").map((part) => part.trim()).filter((part) => part !== "");
		case "asInteger": {
			const parsed = Number.parseInt(asText(value), 10);
			return Number.isNaN(parsed) ? void 0 : parsed;
		}
		case "asBoolean": return absent ? void 0 : value === true || asText(value).toLowerCase() === "true" || asText(value) === "1";
	}
	return value;
}
/**
* 按 `inputBindings` 把字段值绑成执行输入。
*
* **两种调用者说的是两种名字**，这条缝必须都认：
* - 模型/工具面给的是**字段 id**（`parametersFor` 就是按 `field.id` 生成参数表的）；
* - 界面/命令面给的是**槽位名**（搬来的 `Component.tsx` 直接组内核形状：cleanf 发
*   `{ paths: [...], preview: true }`，而清单里那两条绑定是 `pathsText→paths`）。
*
* 字段 id 优先；字段缺席而已给的槽位名是另一个名字时**原样采纳**那个值，不再做第二次变换。
* 不这么写的症状是"界面上填的一切被悄悄清空"：`bindInputs` 从缺席的字段 id 绑出一个空值，
* 调用方那句 `{ ...raw, ...bindInputs(...) }` 再用它覆盖掉界面真发过来的槽位——实测 cleanf
* 界面发 `paths: ['/Users/glow/Downloads']` 时内核回 `No valid paths provided.`，同一份输入
* 换成 `pathsText` 就扫出 9 项。
*
* @param definition - 已校验的节点定义。
* @param args - 调用方给的参数（字段 id 形状或槽位名形状）。
*/
function bindInputs(definition, args) {
	const inputs = {};
	const bindings = definition.inputBindings ?? [];
	for (const binding of bindings) {
		const fromField = args[binding.fieldId];
		inputs[binding.slot] = fromField === void 0 && args[binding.slot] !== void 0 ? args[binding.slot] : transformValue(fromField, binding.transform ?? "identity");
	}
	return inputs;
}
/**
* 这次调用是否危险。
* @param definition - 节点定义。
* @param dangerCheck - `pluginExport` 型闸门的判定函数。
* @param actionId - 本次动作。
* @param args - 本次参数。
* @returns 危险时给出双语原因文案。
*/
function dangerFor(definition, dangerCheck, actionId, args) {
	const danger = definition.danger;
	if (danger === void 0 || danger.type === "none") return void 0;
	const reason = {
		en: `Node "${definition.nodeId}" · action "${actionId}" is gated as dangerous (${danger.type}).`,
		zh: `节点「${definition.nodeId}」的动作「${actionId}」被 ${danger.type} 判为危险操作。`
	};
	const selector = definition.fields.find((field) => field.isActionSelector === true);
	switch (danger.type) {
		case "actionIn": {
			const current = String(danger.actionField === void 0 ? actionId : args[danger.actionField] ?? args[selector?.id ?? ""] ?? actionId);
			return (danger.dangerous ?? []).includes(current) ? reason : void 0;
		}
		case "fieldFlag": return args[danger.fieldId ?? ""] === true ? reason : void 0;
		case "all": return matchCondition({
			type: "all",
			predicates: danger.predicates
		}, args, actionId) ? reason : void 0;
		case "any": return matchCondition({
			type: "any",
			predicates: danger.predicates
		}, args, actionId) ? reason : void 0;
		case "pluginExport":
			if (dangerCheck === void 0) throw new Error(`xaihi.node/v1: danger.type "pluginExport" needs defineNode({ dangerCheck }) for export "${danger.exportName ?? "?"}"`);
			return dangerCheck(args) ? reason : void 0;
	}
}
/** 工具名：`<nodeId>_<actionId>`。 */
function toolName(definition, actionId) {
	return `${definition.nodeId}_${actionId}`;
}
/**
* 注册一个节点：每个动作一个工具，外加一条把危险动作转成 `ask` 的 pre-execute 监听。
* @param ctx - 宿主上下文（需要 `tools`）。
* @param options - 定义、实现与可选的危险判定。
* @returns 动作的调用入口（供命令 / UI 复用同一条路径）。
* @throws 定义不合法时抛出全部校验问题；缺动作实现或 `pluginExport` 缺判定函数时抛配置错误。
*/
function defineNode(ctx, options) {
	const validation = validateNodeDefinition(options.definition);
	if (!validation.ok) throw new Error(`xaihi.node/v1 invalid: ${validation.errors.join("; ")}`);
	const definition = validation.value;
	const source = options.journal;
	const resolve = () => typeof source === "function" ? source() : source;
	let warnedNoJournal = false;
	const warnNoJournal = () => {
		if (warnedNoJournal || definition.reportsProgress !== true) return;
		warnedNoJournal = true;
		console.warn(`xaihi.node/v1: node "${definition.nodeId}" sets reportsProgress but no journal resolved; progress will be dropped`);
	};
	if (definition.danger !== void 0 && definition.danger.type === "pluginExport" && options.dangerCheck === void 0) throw new Error(`xaihi.node/v1: node "${definition.nodeId}" declares danger.type "pluginExport" but defineNode got no dangerCheck`);
	/** 一次动作调用：开运行、绑输入、跑实现、结算。工具与命令共用这一份记账。 */
	const invoke = async (actionId, raw = {}) => {
		const handler = options.handlers[actionId];
		if (handler === void 0) throw new Error(`xaihi.node/v1: no handler for action "${actionId}"`);
		const journal = resolve();
		if (journal === void 0) warnNoJournal();
		const run = journal?.open({
			nodeId: definition.nodeId,
			actionId
		}) ?? NULL_RUN;
		try {
			const result = await handler({
				args: raw,
				inputs: {
					...raw,
					...bindInputs(definition, raw)
				},
				run
			});
			journal?.finish(run.runId);
			return result;
		} catch (error) {
			journal?.fail(run.runId, error instanceof Error ? error.message : String(error));
			throw error;
		}
	};
	/** 一次动作调用并返回结构化结果：开运行、绑输入、跑实现、捕获 resultView 并结算。 */
	const runAction = async (actionId, raw = {}, onEvent) => {
		const handler = options.handlers[actionId];
		if (handler === void 0) return {
			success: false,
			message: `xaihi.node/v1: no handler for action "${actionId}"`
		};
		const journal = resolve();
		if (journal === void 0) warnNoJournal();
		const baseRun = journal?.open({
			nodeId: definition.nodeId,
			actionId
		}) ?? NULL_RUN;
		let capturedResultView = void 0;
		const run = {
			runId: baseRun.runId,
			signal: baseRun.signal,
			progress: (p) => {
				baseRun.progress(p);
				try {
					const percent = typeof p.total === "number" && p.total > 0 ? Math.round(p.done / p.total * 100) : p.done;
					onEvent?.({
						type: "progress",
						progress: percent,
						...p
					});
				} catch {}
			},
			preview: (payload) => {
				baseRun.preview(payload);
				try {
					const record = typeof payload === "object" && payload !== null ? payload : {};
					const message = record.message;
					onEvent?.({
						type: "log",
						message: typeof message === "string" ? message : String(message ?? ""),
						...record
					});
				} catch {}
			},
			resultView: (payload) => {
				capturedResultView = payload;
				baseRun.resultView(payload);
			},
			checkpoint: (p) => {
				baseRun.checkpoint(p);
			}
		};
		const pending = handler({
			args: raw,
			inputs: {
				...raw,
				...bindInputs(definition, raw)
			},
			run
		});
		pending.catch(() => void 0);
		const cancelled = new Promise((resolve) => {
			if (baseRun.signal.aborted) resolve("cancelled");
			else baseRun.signal.addEventListener("abort", () => {
				resolve("cancelled");
			}, { once: true });
		});
		try {
			const raced = await Promise.race([pending, cancelled]);
			if (raced === "cancelled") return {
				success: false,
				message: CANCELLED_MESSAGE,
				data: capturedResultView,
				runId: baseRun.runId
			};
			journal?.finish(baseRun.runId);
			return {
				success: true,
				message: raced,
				data: capturedResultView,
				runId: baseRun.runId
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			journal?.fail(baseRun.runId, errorMessage);
			return {
				success: false,
				message: errorMessage,
				data: capturedResultView,
				runId: baseRun.runId
			};
		}
	};
	for (const action of definition.actions) {
		if (options.handlers[action.id] === void 0) throw new Error(`xaihi.node/v1: no handler for action "${action.id}"`);
		ctx.tools.register(defineTool({
			name: toolName(definition, action.id),
			description: `${definition.title.en} · ${action.label.en} — ${action.description?.en ?? definition.description.en}`,
			parameters: parametersFor(definition, action.id),
			output: {
				schema: { type: "string" },
				render: (_args, value) => [{
					type: "text",
					text: value
				}]
			},
			execute: (args) => invoke(action.id, args ?? {})
		}));
	}
	if (definition.danger !== void 0 && definition.danger.type !== "none") {
		const names = new Set(definition.actions.map((action) => toolName(definition, action.id)));
		ctx.on("tools/pre-execute", async (exec, next) => {
			if (!names.has(exec.name)) return next();
			const actionId = exec.name.slice(exec.name.lastIndexOf("_") + 1);
			const reason = dangerFor(definition, options.dangerCheck, actionId, exec.arguments ?? {});
			if (reason === void 0) return next();
			return {
				kind: "ask",
				reason: reason.en,
				displayReason: {
					en: reason.en,
					zh: reason.zh
				}
			};
		});
	}
	const handle = {
		invoke,
		run: runAction
	};
	registerWithHost(ctx, (registry) => registry.register({
		nodeId: definition.nodeId,
		definition,
		handlers: options.handlers,
		invoke,
		run: runAction,
		cancelRun: (runId) => resolve()?.cancel(runId, `已取消：${definition.nodeId}/${runId}`) ?? false,
		inFlightRuns: () => (resolve()?.runs() ?? []).filter((run) => run.nodeId === definition.nodeId && run.outcome === "running").map((run) => run.runId),
		...options.execute === void 0 ? {} : { execute: options.execute }
	}));
	return handle;
}
//#endregion
//#region src/native-sync.ts
/** Config is DSH-owned; this class retains only live synchronization status. */
var NativeMenuSync = class {
	binding;
	actions;
	adapter;
	title;
	state = {
		status: "unconfigured",
		message: "Native menus are not installed through this DSH profile.",
		actions: []
	};
	queue = Promise.resolve();
	last = "";
	configured = false;
	previousDirectory = "";
	disposed = false;
	constructor(binding, actions, adapter, title = () => "Xaihi") {
		this.binding = binding;
		this.actions = actions;
		this.adapter = adapter;
		this.title = title;
	}
	sync = () => {
		this.queue = this.queue.then(async () => {
			if (this.disposed) return;
			const binding = this.binding();
			const actions = this.actions();
			const title = this.title();
			const signature = JSON.stringify([
				binding,
				actions,
				title
			]);
			if (signature === this.last && this.state.status !== "error") return;
			if (!binding.directory) {
				if (this.configured) try {
					await this.adapter.uninstallMenu({ source: this.previousDirectory });
				} catch (error) {
					this.state = {
						...this.state,
						status: "error",
						message: String(error)
					};
					return;
				}
				this.configured = false;
				this.last = signature;
				this.state = {
					status: "unconfigured",
					message: "Native menus are not installed through this DSH profile.",
					actions: []
				};
				return;
			}
			this.state = {
				...this.state,
				status: "pending",
				message: "Updating provider actions in the native menu…"
			};
			try {
				await this.adapter.exportMenu({
					output: binding.directory,
					endpoint: binding.endpoint,
					node: binding.node,
					actions,
					title
				});
				await this.adapter.uninstallMenu({ source: binding.directory });
				await this.adapter.installMenu({ source: binding.directory });
				this.configured = true;
				this.previousDirectory = binding.directory;
				this.last = signature;
				this.state = {
					status: "installed",
					message: "Provider actions registered in the native menu.",
					actions: actions.map(({ id, title }) => ({
						id,
						title
					}))
				};
			} catch (error) {
				this.state = {
					...this.state,
					status: "error",
					message: String(error)
				};
			}
		});
		return this.queue;
	};
	dispose() {
		this.disposed = true;
	}
};
//#endregion
//#region src/policies.ts
function platformOf(value = process.platform) {
	if (!SHELLECT_PLATFORMS.includes(value)) throw new Error(`Shellect: unsupported platform: ${String(value)}`);
	return value;
}
/** 值来自 DSH 的已声明配置；纯投影也供 registry 与 CLI 输出共用。 */
function platformPolicy$1(policies, platform) {
	const policy = policies[platform];
	return {
		enabled: policy?.enabled !== false,
		title: policy?.title?.trim() || "Xaihi · Shellect",
		actions: policy?.actions ?? {}
	};
}
//#endregion
//#region src/registry.ts
const describe = ({ id, title, selection, mutates, fields }) => ({
	id,
	title,
	selection,
	mutates,
	...fields ? { fields } : {}
});
/** 只登记动作并调用提供者；文件操作、运行账本仍由已有节点处理。 */
var ShellectRegistry = class {
	now;
	policies;
	actions = /* @__PURE__ */ new Map();
	tickets = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Set();
	onChange(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	changed() {
		for (const listener of this.listeners) listener();
	}
	queue = Promise.resolve();
	constructor(now = () => Date.now(), policies = () => ({})) {
		this.now = now;
		this.policies = policies;
	}
	register(action) {
		if (action.id.length > 128 || !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(action.id) || !action.title.trim()) throw new Error("Xaihi: invalid shell action id or title");
		if (![
			"directories",
			"files",
			"any"
		].includes(action.selection) || typeof action.mutates !== "boolean" || typeof action.preview !== "function" || typeof action.execute !== "function") throw new Error("Xaihi: invalid shell action contract");
		if (action.platforms && (!Array.isArray(action.platforms) || !action.platforms.length || action.platforms.some((platform) => !SHELLECT_PLATFORMS.includes(platform)))) throw new Error("Shellect: invalid supported platforms");
		const entry = Object.freeze({ ...action });
		this.actions.set(entry.id, entry);
		this.changed();
		return () => {
			if (this.actions.get(entry.id) === entry) {
				this.actions.delete(entry.id);
				this.changed();
			}
		};
	}
	catalog(platform = platformOf()) {
		platform = platformOf(platform);
		const policy = platformPolicy$1(this.policies(), platform);
		const actions = [.../* @__PURE__ */ new Set([...this.actions.keys(), ...Object.keys(policy.actions)])].map((id) => {
			const action = this.actions.get(id);
			const override = policy.actions[id];
			const supported = !!action && (!action.platforms || action.platforms.includes(platform));
			return {
				...action ? describe({
					id: action.id,
					title: action.title,
					selection: action.selection,
					mutates: action.mutates,
					...action.fields ? { fields: action.fields() } : {}
				}) : {
					id,
					title: id,
					selection: "any",
					mutates: false
				},
				title: override?.title?.trim() || action?.title || id,
				nodeId: action?.nodeId ?? id.split(".")[0],
				registered: !!action,
				supported,
				enabled: policy.enabled && supported && override?.enabled !== false,
				sourceTitle: action?.title ?? id,
				order: override?.order ?? 0
			};
		}).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
		return {
			platform,
			hostPlatform: process.platform,
			title: policy.title,
			enabled: policy.enabled,
			actions
		};
	}
	list(platform) {
		return this.catalog(platform).actions.filter((action) => action.enabled).map(describe);
	}
	async prepare(id, paths, platform = platformOf(), supplied = {}) {
		this.prune();
		const action = this.actions.get(id);
		if (!action) throw new Error(`Xaihi: shell action unavailable: ${id}; enable its provider plugin`);
		const descriptor = this.allowed(id, platform);
		const policy = this.fingerprint(id, platform);
		const values = this.values(descriptor, supplied);
		const selection = await this.validate(action, paths);
		const preview = await this.serial(() => action.preview(selection, structuredClone(values)));
		if (!preview.success) throw new Error(preview.message);
		if (this.actions.get(id) !== action) throw new Error("Xaihi: action changed during preview; prepare again");
		if (this.tickets.size >= 256) throw new Error("Xaihi: too many pending menu confirmations");
		const ticket = randomUUID();
		if (this.fingerprint(id, platform) !== policy) throw new Error("Shellect: settings changed during preview; prepare again");
		this.tickets.set(ticket, {
			action,
			paths: selection,
			expires: this.now() + 3e5,
			platform,
			policy,
			values
		});
		return {
			ticket,
			action: descriptor,
			paths: selection,
			preview,
			values
		};
	}
	execute(ticket) {
		this.prune();
		const prepared = this.tickets.get(ticket);
		if (!prepared) throw new Error("Xaihi: confirmation expired or already used; prepare again");
		this.tickets.delete(ticket);
		return this.serial(async () => {
			if (this.actions.get(prepared.action.id) !== prepared.action) throw new Error("Xaihi: provider unloaded or changed; prepare again");
			this.allowed(prepared.action.id, prepared.platform);
			if (this.fingerprint(prepared.action.id, prepared.platform) !== prepared.policy) throw new Error("Shellect: settings changed since confirmation; prepare again");
			await this.validate(prepared.action, prepared.paths);
			return prepared.action.execute(prepared.paths, structuredClone(prepared.values));
		});
	}
	values(action, supplied) {
		if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) throw new Error("Shellect: invalid run options");
		const fields = action.fields ?? [];
		const values = {};
		for (const key of Object.keys(supplied)) if (!fields.some((field) => field.key === key)) throw new Error(`Shellect: unknown option ${key}`);
		for (const field of fields) {
			const value = supplied[field.key] ?? field.value;
			if (!(field.type === "boolean" ? typeof value === "boolean" : field.type === "number" ? typeof value === "number" && Number.isFinite(value) && value >= (field.min ?? -Infinity) && value <= (field.max ?? Infinity) : typeof value === "string" && value.length <= 4096 && (field.type !== "select" || field.choices?.some((choice) => choice.value === value)))) throw new Error(`Shellect: invalid option ${field.label}`);
			values[field.key] = value;
		}
		return values;
	}
	fingerprint(id, platform) {
		const policy = platformPolicy$1(this.policies(), platform);
		return JSON.stringify([
			policy.enabled,
			policy.title,
			policy.actions[id] ?? {}
		]);
	}
	allowed(id, platform) {
		const action = this.catalog(platform).actions.find((action) => action.id === id);
		if (!action?.enabled) throw new Error(`Shellect: action is disabled or unsupported on ${platform}: ${id}`);
		return describe(action);
	}
	serial(run) {
		const pending = this.queue.then(run);
		this.queue = pending.catch(() => void 0);
		return pending;
	}
	prune() {
		for (const [ticket, prepared] of this.tickets) if (prepared.expires <= this.now() || this.actions.get(prepared.action.id) !== prepared.action) this.tickets.delete(ticket);
	}
	async validate(action, paths) {
		if (!Array.isArray(paths) || paths.length < 1 || paths.length > 100) throw new Error("Xaihi: select 1 to 100 paths");
		const canonical = [];
		for (const path of paths) {
			if (typeof path !== "string" || !isAbsolute(path) || path.includes("\0")) throw new Error("Xaihi: menu paths must be absolute");
			const info = await lstat(path);
			if (info.isSymbolicLink()) throw new Error(`Xaihi: select the actual file or folder, not a symbolic link: ${path}`);
			if (action.selection === "directories" && !info.isDirectory()) throw new Error(`Xaihi: select folders: ${path}`);
			if (action.selection === "files" && !info.isFile()) throw new Error(`Xaihi: select files: ${path}`);
			const value = await realpath(path);
			if (!canonical.includes(value)) canonical.push(value);
		}
		for (const parent of canonical) for (const child of canonical) {
			const rel = relative(parent, child);
			if (parent !== child && rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) throw new Error("Xaihi: select separate paths; a parent and its child cannot run together");
		}
		return canonical;
	}
};
//#endregion
//#region src/http.ts
/** 使用 DSH 的具名路由；原生适配器请求面，不向浏览器开放跨域写。 */
function shellectActionsHandler(service) {
	return async (req, res) => {
		const send = (status, body) => {
			res.writeHead(status, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			});
			res.end(JSON.stringify(body));
		};
		const peer = req.socket?.remoteAddress;
		const host = req.headers.host ?? "";
		if (![
			"127.0.0.1",
			"::1",
			"::ffff:127.0.0.1"
		].includes(peer ?? "") || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) || req.headers.origin !== void 0 || req.headers["sec-fetch-site"] !== void 0) {
			send(403, {
				success: false,
				message: "Xaihi: native menu requests must come directly from loopback"
			});
			return;
		}
		if (req.method !== "POST" && req.method !== "GET") {
			send(405, {
				success: false,
				message: "Xaihi: use GET or POST"
			});
			return;
		}
		if (req.method === "POST" && (req.headers["content-type"] !== "application/json" || req.headers["x-xaihi-menu"] !== "1")) {
			send(415, {
				success: false,
				message: "Xaihi: expected native menu JSON request"
			});
			return;
		}
		try {
			const platform = platformOf(req.headers["x-xaihi-platform"] ?? process.platform);
			if (req.method === "GET") {
				send(200, {
					success: true,
					actions: service.list(platform),
					title: service.catalog(platform).title,
					platform,
					transport: "dsh-webserver",
					nativeMenus: "shellect menu install"
				});
				return;
			}
			let bytes = 0;
			const chunks = [];
			for await (const chunk of req) {
				const buffer = Buffer.from(chunk);
				bytes += buffer.length;
				if (bytes > 65536) {
					send(413, {
						success: false,
						message: "Xaihi: menu request too large"
					});
					return;
				}
				chunks.push(buffer);
			}
			const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			if (!body || typeof body !== "object") throw new Error("Xaihi: expected a menu request object");
			if (body.op === "prepare" && typeof body.id === "string" && Array.isArray(body.paths)) send(200, {
				success: true,
				preparation: await service.prepare(body.id, body.paths, platform, body.values)
			});
			else if (body.op === "execute" && typeof body.ticket === "string") send(200, await service.execute(body.ticket));
			else throw new Error(`Xaihi: invalid menu operation at ${SHELLECT_ACTIONS_PATH}`);
		} catch (error) {
			send(400, {
				success: false,
				message: error instanceof Error ? error.message : String(error)
			});
		}
	};
}
//#endregion
//#region src/manager.ts
/** Catalog, node and CLI all read/write the same DSH settings document. */
var ShellectManager = class {
	service;
	settings;
	namespace;
	nativeState;
	synchronize;
	constructor(service, settings, namespace, nativeState, synchronize) {
		this.service = service;
		this.settings = settings;
		this.namespace = namespace;
		this.nativeState = nativeState;
		this.synchronize = synchronize;
	}
	read(platform) {
		const ns = this.namespace();
		const row = ns === void 0 ? void 0 : this.settings()?.describe({ redactSecrets: true }).find((row) => row.ns === ns);
		return {
			nativeMenu: (row?.value)?.nativeMenu ?? null,
			nativeMenuState: this.nativeState?.() ?? {
				status: "unconfigured",
				message: "Native menu installation is unavailable.",
				actions: []
			},
			...this.service.catalog(platformOf(platform)),
			namespace: ns ?? null,
			revision: row?.revision ?? null,
			writable: !!row,
			policies: (row?.value)?.platforms ?? {},
			settingsReason: row ? "" : "DSH settings or the plugin entry namespace is unavailable; configuration is read-only."
		};
	}
	async edit(input) {
		const platform = platformOf(input.platform);
		const current = this.read(platform);
		const expected = input.expectedRevision;
		if (!Number.isSafeInteger(expected) || expected < 0) throw new Error("Shellect: expectedRevision is required");
		if (!current.writable || !current.namespace) throw new Error(current.settingsReason);
		const settings = this.settings();
		if (input.action === "install_menu" || input.action === "uninstall_menu") return this.bindNativeMenu(input, current, expected);
		const path = ["platforms", platform];
		if (input.id !== void 0) {
			if (typeof input.id !== "string" || !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(input.id)) throw new Error("Shellect: invalid action id");
			path.push("actions", input.id);
		}
		const ops = [];
		if (input.action === "reset") ops.push({
			op: "unset",
			path
		});
		else {
			if (input.enabled !== void 0) {
				if (typeof input.enabled !== "boolean") throw new Error("Shellect: enabled must be boolean");
				ops.push({
					op: "set",
					path: [...path, "enabled"],
					value: input.enabled
				});
			}
			if (input.title !== void 0) {
				if (typeof input.title !== "string" || input.title.length > 160 || /[\r\n\0]/.test(input.title)) throw new Error("Shellect: invalid menu title");
				ops.push({
					op: "set",
					path: [...path, "title"],
					value: input.title
				});
			}
			if (input.order !== void 0) {
				if (input.id === void 0 || !Number.isSafeInteger(input.order)) throw new Error("Shellect: order must be an integer for an action");
				ops.push({
					op: "set",
					path: [...path, "order"],
					value: input.order
				});
			}
			if (!ops.length) throw new Error("Shellect: no settings edits supplied");
		}
		try {
			await settings.mutate(current.namespace, ops, expected);
			await this.synchronize?.();
			return {
				status: "saved",
				catalog: this.read(platform)
			};
		} catch (error) {
			const conflict = error;
			if (conflict.code !== "SETTINGS_CONFLICT" && conflict.name !== "SettingsConflictError") throw error;
			const latest = this.read(platform);
			return {
				status: "conflict",
				expectedRevision: expected,
				actualRevision: latest.revision,
				catalog: latest,
				message: `SETTINGS_CONFLICT: configuration changed from revision ${expected} to ${latest.revision}; review the latest values and save again.`
			};
		}
	}
	async bindNativeMenu(input, current, expected) {
		let value = {
			directory: "",
			endpoint: "",
			node: ""
		};
		if (input.action === "install_menu") {
			if (typeof input.directory !== "string" || !isAbsolute(input.directory) || input.directory.includes("\0") || typeof input.node !== "string" || !isAbsolute(input.node)) throw new Error("Shellect: menu directory and Node executable must be absolute");
			const url = new URL(String(input.endpoint));
			if (url.protocol !== "http:" || ![
				"127.0.0.1",
				"localhost",
				"[::1]"
			].includes(url.hostname) || url.username || url.password || url.search || url.hash || !["/", "/xaihi/shellect/actions"].includes(url.pathname)) throw new Error("Shellect: native endpoint must be a loopback DSH origin");
			value = {
				directory: input.directory,
				endpoint: url.href,
				node: input.node
			};
		}
		try {
			await this.settings().mutate(current.namespace, [{
				op: "set",
				path: ["nativeMenu"],
				value
			}], expected);
			await this.synchronize?.();
			return {
				status: "saved",
				catalog: this.read(current.platform)
			};
		} catch (error) {
			const conflict = error;
			if (conflict.code !== "SETTINGS_CONFLICT" && conflict.name !== "SettingsConflictError") throw error;
			const latest = this.read(current.platform);
			return {
				status: "conflict",
				expectedRevision: expected,
				actualRevision: latest.revision,
				catalog: latest,
				message: `SETTINGS_CONFLICT: configuration changed from revision ${expected} to ${latest.revision}; review the latest values and save again.`
			};
		}
	}
};
//#endregion
//#region src/index.ts
const name = "@hibernalglow/xaihi-shellect";
const actionPolicy = Schema.object({
	enabled: Schema.boolean().default(true),
	title: Schema.string().default(""),
	order: Schema.number().default(0)
});
const platformPolicy = Schema.object({
	enabled: Schema.boolean().default(true),
	title: Schema.string().default(""),
	actions: Schema.dict(actionPolicy).default({})
});
const Config = Schema.object({
	nativeMenu: Schema.object({
		directory: Schema.string().default(""),
		endpoint: Schema.string().default(""),
		node: Schema.string().default("")
	}).default({}).volatile(),
	platforms: Schema.object({
		win32: platformPolicy,
		darwin: platformPolicy,
		linux: platformPolicy
	}).default({}).volatile()
});
function apply(ctx, config) {
	const service = new ShellectRegistry(Date.now, () => config.platforms.get());
	ctx.effect(() => ctx.provide(SHELLECT_SERVICE, service), "xaihi-shellect: registry");
	const native = new NativeMenuSync(() => config.nativeMenu.get(), () => service.list(), {
		exportMenu,
		installMenu,
		uninstallMenu
	}, () => service.catalog().title);
	ctx.effect(() => service.onChange(() => {
		native.sync();
	}), "xaihi-shellect: native registrations");
	ctx.effect(() => () => native.dispose(), "xaihi-shellect: native sync lifetime");
	const manager = new ShellectManager(service, () => ctx.get("settings"), () => ctx.fiber.entry?.options.id, () => native.state, native.sync);
	ctx.on("settings/document-updated", ((ns) => {
		if (ns === ctx.fiber.entry?.options.id) native.sync();
	}));
	native.sync();
	ctx.inject(["webServer"], (scoped) => {
		const webServer = scoped.get("webServer");
		if (webServer) return webServer.register({
			kind: "exact",
			path: SHELLECT_ACTIONS_PATH,
			handler: shellectActionsHandler(service)
		});
	});
	ctx.inject(["tools"], (scoped) => {
		defineNode(scoped, {
			journal: () => scoped.get(OPERATIONS_SERVICE),
			definition: createRequire(import.meta.url)("../package.json").xaihi.node,
			handlers: {
				async sync_menu({ inputs, run }) {
					await native.sync();
					run.resultView(manager.read(inputs.platform));
					return native.state.message;
				},
				async install_menu({ inputs, run }) {
					const result = await manager.edit({
						...inputs,
						action: "install_menu"
					});
					run.resultView(result);
					return result.status === "conflict" ? result.message : native.state.message;
				},
				async uninstall_menu({ inputs, run }) {
					const result = await manager.edit({
						...inputs,
						action: "uninstall_menu"
					});
					run.resultView(result);
					return result.status === "conflict" ? result.message : native.state.message;
				},
				async catalog({ inputs, run }) {
					const catalog = manager.read(inputs.platform);
					run.resultView(catalog);
					return "Shellect registrations loaded";
				},
				async configure({ inputs, run }) {
					const result = await manager.edit({
						...inputs,
						action: "configure"
					});
					run.resultView(result);
					return result.status === "conflict" ? result.message : "Shellect settings saved";
				},
				async reset({ inputs, run }) {
					const result = await manager.edit({
						...inputs,
						action: "reset"
					});
					run.resultView(result);
					return result.status === "conflict" ? result.message : "Shellect overrides reset";
				}
			}
		});
	});
}
//#endregion
export { Config, apply, name };
// Restored from the last verified distributable. Keep the bundled implementation
// type-checked by the package boundary while the source is split back into modules.
// @ts-nocheck
