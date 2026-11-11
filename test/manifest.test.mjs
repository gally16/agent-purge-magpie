// 清单文件本身：magpie 能不能从根目录认出这个包、npm 包里带没带齐文件。
//   node test/manifest.test.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// 1) 发布形态：能被 npm 装，能被 `magpie plugin add github:owner/repo` 从根目录认出来
assert.equal(pkg.private, undefined, "private 会让 npm publish 直接失败");
assert.equal(pkg.type, "module");
assert.ok(pkg.name && pkg.version, "name/version 必须存在");
assert.ok(pkg.repository?.url.includes("agent-purge-magpie"), "repository 指向这个仓库");
assert.equal(pkg.main, undefined, "纯网关插件不需要 main");
assert.equal(pkg.exports, undefined, "纯网关插件不需要 exports");
assert.equal(pkg.magpie?.hooks, "./hooks.js");
assert.ok(existsSync(join(root, "hooks.js")), "hooks.js 必须提交进仓库（git 安装直接读它）");
assert.ok(pkg.magpie.page?.file, "page.file 必须声明，否则没有界面");
assert.ok(existsSync(join(root, pkg.magpie.page.file)), "page.file 指向的文件必须存在");
assert.ok(Buffer.byteLength(pkg.magpie.name) <= 80, "magpie.name 最多 80 字节");
assert.ok(Buffer.byteLength(pkg.magpie.icon) <= 1024 * 1024, "图标最多 1 MB");
assert.match(pkg.magpie.icon, /^(?:data:image\/|https:\/\/)/, "图标必须是 data: 或 https:");

for (const [lang, line] of Object.entries(pkg.magpie.summary ?? {})) {
	assert.ok(Buffer.byteLength(line) <= 300, `summary.${lang} 超过 300 字节`);
}
assert.ok(pkg.magpie.summary?.zh && pkg.magpie.summary?.en, "中英摘要都要有（发现页按语言取）");

// 2) npm 包内容：运行时文件一个都不能漏
const patterns = pkg.files ?? [];
const covered = (file) =>
	patterns.some((p) => p === file || (p.endsWith("/") ? file.startsWith(p) : file === p || file.startsWith(`${p}/`)));
for (const file of [
	"hooks.js",
	"lib/catalog.mjs",
	"page/index.html",
	"page/app.js",
	"page/style.css",
	"personas/neutral.md",
	"personas/terse.md",
	"scripts/gen-personas.mjs",
	"icon.svg",
	"README.md",
	"LICENSE",
]) {
	assert.ok(existsSync(join(root, file)), `${file} 必须存在`);
	assert.ok(covered(file), `${file} 必须被 package.json 的 files 覆盖，否则 npm 包里没有它`);
}

// 3) 页面只能加载自己目录里的文件，引用必须都在包内
const html = readFileSync(join(root, "page", "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
assert.ok(refs.includes("_magpie/bridge.js"), "页面必须引入 bridge.js");
assert.ok(refs.includes("personas.js"), "页面必须加载人设清单");
assert.ok(refs.includes("app.js"), "页面必须加载 app.js");
for (const ref of refs) {
	if (/^(?:[a-z]+:|\/\/|#|_magpie\/)/i.test(ref)) continue; // 外部资源与 magpie 自己提供的不算
	// 清单是钩子启动时生成的（.gitignore 里），全新克隆里本来就不存在
	if (ref === "personas.js") continue;
	assert.ok(existsSync(join(root, "page", ref)), `页面引用的 ${ref} 必须在 page/ 里`);
}

// 4) 入口只导出 onRequest：magpie 把导出的每个函数都当插件调用
process.env.AGENT_PURGE_PLUGIN_SYNC = "off";
const hooks = await import("../hooks.js");
assert.deepEqual(Object.keys(hooks), ["onRequest"], "hooks.js 只导出 onRequest");
assert.equal(typeof hooks.onRequest, "function");

// 5) 注册表条目：字段与包本身一致，能直接提 PR
const entry = JSON.parse(readFileSync(join(root, "docs", "registry-entry.json"), "utf8"));
assert.equal(entry.package, pkg.name);
assert.equal(entry.kind, "middleware", "网关请求钩子在注册表里是 middleware");
assert.equal(entry.community, undefined, "第三方包不写 community 标记");
assert.equal(entry.providers, undefined, "中间件不声明 providers");
assert.deepEqual(entry.summary, pkg.magpie.summary, "注册表摘要与包里的摘要必须一致");
assert.ok(entry.icon.startsWith("https://"), "注册表图标用仓库里的 SVG 地址");

// 6) 生成物不进版本库，也不进 npm 包：里面是本机人设的名字和说明
assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /^page\/personas\.js$/m, "清单是生成物，必须忽略");
assert.equal(covered("page/personas.js"), false, "生成的清单不能被打进 npm 包");

console.log("ok — 清单文件与包内容");
