// 依次跑 test/*.test.mjs。每个文件自带断言，非零退出即失败。
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "test")).filter((file) => file.endsWith(".test.mjs")).sort();
for (const file of files) {
	const result = spawnSync(process.execPath, [join("test", file)], {
		cwd: root,
		stdio: "inherit",
		windowsHide: true,
		timeout: 120000,
	});
	if (result.error || result.status !== 0) {
		if (result.error) console.error(result.error.message);
		process.exit(result.status || 1);
	}
}
console.log(`\n${files.length} 个测试文件全部通过`);
