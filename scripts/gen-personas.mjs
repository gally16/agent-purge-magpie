// 手动重写 page/personas.js。一般不需要：钩子启动时和请求路径上都会同步一次。
import { dataHome, syncPageCatalog } from "../lib/catalog.mjs";

const result = syncPageCatalog({ force: true });
if (result.error) {
	console.error(`写不了清单：${result.error.message}`);
	console.error(`目标：page/personas.js；数据目录：${dataHome()}`);
	process.exit(1);
}
console.log(`personas.js ← ${result.count} 个（${result.source}）`);
