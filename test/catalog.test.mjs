// 清单生成：磁盘人设 + 内置人设、内容没变不写盘、写不进去不抛。
//   node test/catalog.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { listPersonas, readBundledPersona, renderCatalog, syncPageCatalog, validId } from "../lib/catalog.mjs";

const root = mkdtempSync(join(tmpdir(), "agent-purge-catalog-"));
process.once("exit", () => rmSync(root, { recursive: true, force: true }));

const home = join(root, "home");
mkdirSync(join(home, "personas"), { recursive: true });
writeFileSync(
	join(home, "personas", "canary.md"),
	["---", "id: canary", "name: Canary", "description: 自测用", "order: 5", "---", "BODY"].join("\n"),
);
writeFileSync(join(home, "personas", "zeta.md"), "no frontmatter");
writeFileSync(join(home, "personas", "active.md"), "派生物，不是人设");
writeFileSync(join(home, "personas", "bad name.md"), "文件名不是合法 id");
writeFileSync(join(home, "personas", ".hidden.md"), "隐藏项");
writeFileSync(join(home, "state.json"), JSON.stringify({ persona: "canary" }));

const withState = listPersonas({ home });
assert.deepEqual(withState.personas.map((p) => p.id), ["canary", "zeta"], "有 state.json 时只列磁盘人设，按 order 排序");
assert.equal(withState.personas[0].name, "Canary");
assert.equal(withState.personas[1].name, "zeta", "没有 frontmatter 时名字退回 id");
assert.equal(withState.source, "disk");
assert.equal(withState.hasState, true);

rmSync(join(home, "state.json"));
const noState = listPersonas({ home });
assert.deepEqual(
	noState.personas.map((p) => p.id),
	["canary", "zeta", "neutral", "terse"],
	"没有 CLI 时把随包人设接在后面",
);
assert.equal(noState.personas.at(-1).source, "bundled");
assert.equal(noState.hasState, false);

const bare = mkdtempSync(join(root, "bare-"));
assert.equal(listPersonas({ home: bare }).source, "bundled", "连人设目录都没有时用内置的");

// 写进页面目录：内容和 metacatalog 对得上
const target = join(root, "page", "personas.js");
const first = syncPageCatalog({ target, home, force: true });
assert.equal(first.written, true);
assert.equal(first.count, 4);
const text = readFileSync(target, "utf8");
assert.match(text, /window\.PERSONAS = \[/);
const sandbox = { window: {} };
runInNewContext(text, sandbox);
assert.equal(sandbox.window.PERSONAS.length, 4);
assert.equal(sandbox.window.PERSONAS_META.source, "disk", "磁盘人设存在时 source 是 disk");
assert.equal(sandbox.window.PERSONAS_META.hasState, false);

// 内容没变就不写盘
const second = syncPageCatalog({ target, home });
assert.equal(second.written, false, "内容一致时不重写文件");
const forced = syncPageCatalog({ target, home, force: true });
assert.equal(forced.written, true, "force 时重写");

// 目标目录不存在也能建
const nested = join(root, "a", "b", "personas.js");
assert.equal(syncPageCatalog({ target: nested, home, force: true }).written, true);

// 写不进去时返回 error，不抛
const blocked = join(root, "blocked");
mkdirSync(blocked);
const failed = syncPageCatalog({ target: blocked, home, force: true });
assert.ok(failed.error instanceof Error, "目标是目录时返回 error");
assert.equal(failed.written, false);

// 页面脚本的形状：两个全局变量，没有别的副作用
assert.match(renderCatalog({ personas: [], source: "none", hasState: false, home: "~/.agent-purge" }), /PERSONAS_META/);

// 内置人设正文：剥掉 frontmatter，非法 id 读不到
const neutral = readBundledPersona("neutral");
assert.ok(neutral.startsWith("你是一个务实的工程助手。"), "内置人设正文已剥掉 frontmatter");
assert.ok(!neutral.includes("description:"), "frontmatter 不能漏进 prompt");
assert.equal(readBundledPersona("../etc/passwd"), "");
assert.equal(readBundledPersona("nope"), "");

for (const id of ["neutral", "a", "a.b-c_d", "A1"]) assert.equal(validId(id), true, id);
for (const id of ["", "../x", ".hidden", "a/b", "a".repeat(65), 42, null]) assert.equal(validId(id), false, String(id));

console.log("ok — 清单生成与内置人设");
