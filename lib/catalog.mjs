// 人设清单 → page/personas.js
//
// 插件页跑在 sandbox 里：读不到磁盘，`connect-src 'none'` 也没有 fetch。清单只能以同一目录
// 下的脚本文件的形式存在。所以钩子在启动时（以及请求路径上低频复查）把 agent-purge 的
// personas 目录和随包内置的人设摊平成 page/personas.js，页面打开就有东西可点。
//
// 写不进去（只读安装、权限不足、文件被占用）不算错误：返回 { written: false, error }，
// 页面会退回「清单没生成」的提示，导入 md 的功能照常。
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve as abs } from "node:path";
import { fileURLToPath } from "node:url";

const PAGE_FILE = fileURLToPath(new URL("../page/personas.js", import.meta.url));
const BUNDLED_DIR = fileURLToPath(new URL("../personas/", import.meta.url));

/** agent-purge 的数据目录：AGENT_PURGE_HOME 优先，否则 ~/.agent-purge（和 CLI 同一套规则） */
export function dataHome() {
	const env = process.env.AGENT_PURGE_HOME?.trim();
	if (!env) return join(homedir(), ".agent-purge");
	return isAbsolute(env) ? env : abs(env);
}

export const stripFront = (raw) =>
	String(raw)
		.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
		.trim();

/** 和 CLI 的 validId 一致：不能含路径分隔符或 ..，最长 64 字符 */
export const validId = (id) =>
	typeof id === "string" &&
	id.length <= 64 &&
	/^[a-zA-Z0-9_][a-zA-Z0-9._-]*$/.test(id) &&
	!id.includes("..");

const field = (fm, k) =>
	fm
		.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]
		?.trim()
		.replace(/^["']|["']$/g, "") ?? "";

/**
 * 扫一个人设目录。只用 frontmatter 做选择，正文不在这里读。
 * @returns {{id:string,name:string,description:string,order:number,source:"disk"|"bundled"}[]}
 */
export function scanPersonas(dir, source) {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const file of readdirSync(dir)) {
		// active.md 是 CLI 同步的副本，不是可选人设；.build 之类的隐藏项也跳过
		if (!file.endsWith(".md") || file === "active.md" || file.startsWith(".")) continue;
		let raw = "";
		try {
			raw = readFileSync(join(dir, file), "utf8");
		} catch {
			continue;
		}
		const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
		const id = field(fm, "id") || file.slice(0, -3);
		if (!validId(id)) continue;
		out.push({
			id,
			name: field(fm, "name") || id,
			description: field(fm, "description"),
			order: Number(field(fm, "order")) || 99,
			source,
		});
	}
	return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const homeLabel = () => (process.env.AGENT_PURGE_HOME?.trim() ? "$AGENT_PURGE_HOME" : "~/.agent-purge");

/**
 * 页面要显示的清单。有 state.json 时只列磁盘人设——内置人设在没有 CLI 的安装里是
 * 起步选项，混进已经跑起来的安装里只会变成「点了没反应」的条目。
 */
export function listPersonas({ home = dataHome() } = {}) {
	const hasState = existsSync(join(home, "state.json"));
	const disk = scanPersonas(join(home, "personas"), "disk");
	const seen = new Set(disk.map((p) => p.id));
	const bundled = hasState ? [] : scanPersonas(BUNDLED_DIR, "bundled").filter((p) => !seen.has(p.id));
	const personas = [...disk, ...bundled];
	const source = disk.length ? "disk" : personas.length ? "bundled" : "none";
	return { personas, source, hasState, home: homeLabel() };
}

export function renderCatalog({ personas, source, hasState, home }) {
	const meta = { v: 1, source, hasState, home };
	return [
		"// 由 lib/catalog.mjs 生成：插件页的人设清单。别手改，下次启动会被覆盖。",
		`window.PERSONAS = ${JSON.stringify(personas, null, "\t")};`,
		`window.PERSONAS_META = ${JSON.stringify(meta, null, "\t")};`,
		"",
	].join("\n");
}

let lastCheck = 0;

/**
 * 把清单写进页面目录。内容没变就不动文件（免得每次请求都写盘）。
 * @returns {{written:boolean,count?:number,source?:string,error?:Error,skipped?:boolean}}
 */
export function syncPageCatalog({ target = PAGE_FILE, home = dataHome(), throttleMs = 0, force = false } = {}) {
	const now = Date.now();
	if (!force && throttleMs && now - lastCheck < throttleMs) return { written: false, skipped: true };
	lastCheck = now;

	const state = listPersonas({ home });
	const text = renderCatalog({ ...state, home: state.home });
	try {
		if (!force && existsSync(target) && readFileSync(target, "utf8") === text) {
			return { written: false, count: state.personas.length, source: state.source };
		}
		mkdirSync(dirname(target), { recursive: true });
		// 先写同目录临时文件再 rename：不破坏 bun 的硬链接缓存，也不会让页面读到半个文件
		const tmp = `${target}.${process.pid}.tmp`;
		writeFileSync(tmp, text);
		try {
			renameSync(tmp, target);
		} catch (error) {
			try {
				unlinkSync(tmp);
			} catch {
				/* 临时文件清不掉就算了，别盖住真正的错误 */
			}
			throw error;
		}
		return { written: true, count: state.personas.length, source: state.source };
	} catch (error) {
		return { written: false, count: state.personas.length, source: state.source, error };
	}
}

const bundled = new Map();

/** 随包内置人设的正文：没有 CLI 时也能真的注入点什么，而不是点了没反应 */
export function readBundledPersona(id) {
	if (!validId(id)) return "";
	if (bundled.has(id)) return bundled.get(id);
	let text = "";
	try {
		text = stripFront(readFileSync(join(BUNDLED_DIR, `${id}.md`), "utf8"));
	} catch {
		text = "";
	}
	bundled.set(id, text);
	return text;
}

/** 目录 mtime：给调用方判断「人设变过没有」用；读不到就当 0 */
export function personasStamp(home = dataHome()) {
	try {
		return statSync(join(home, "personas")).mtimeMs;
	} catch {
		return 0;
	}
}
