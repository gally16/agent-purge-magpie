# agent-purge × magpie

把 agent-purge 当前的人设与模式写进**每一次经过 magpie 网关的 agent 请求**的 system 段。
Claude Code、Codex、OpenCode、pi……只要走 magpie，就按同一份人设说话。

这是 [agent-purge](https://github.com/ZiChuanLan/agent-purge) 的 magpie 网关插件，单独发版，
不需要装 CLI 也能用。

## 安装

三种方式任选其一：

```bash
magpie plugin add agent-purge-magpie                      # 1. npm 包名
magpie plugin add github:ZiChuanLan/agent-purge-magpie    # 2. GitHub 仓库，不经过 npm
```

3. 在 magpie → 插件 → 发现 → 推荐列表里点一下「agent-purge」。

装完就能在 `magpie plugin` 里看到它。没有克隆仓库、没有 `gen-personas` 这类前置步骤，
也没有构建——`hooks.js` 和 `page/` 都是提交进仓库的源码，装完直接跑。

想钉版本：`magpie plugin add github:ZiChuanLan/agent-purge-magpie#v0.1.0`。

## 三分钟上手

1. （可选）装 [agent-purge CLI](https://github.com/ZiChuanLan/agent-purge) 并跑一次，
   让它生成 `~/.agent-purge/personas`：

   ```bash
   npm i -g agent-purge && agent-purge ls
   ```

   不装也行：插件自带两个内置人设，页面里也能直接导入 `.md`。

2. 打开 magpie → 插件 → agent-purge →「人设」，点一个人设，选一个模式。
3. 也可以纯命令行：

   ```bash
   magpie plugin options agent-purge-magpie '{"mode":"append"}'
   ```

换人设不用重启 magpie：下一个经过网关的请求就按新的来。

> 没有 CLI 数据（没有 `state.json`）时，「跟随 agent-purge」等于 `off`。这种安装要显式选
> `strict` / `replace` / `append` 才会生效，页面状态行会提醒。

## 选项

`magpie plugin options agent-purge-magpie '<json>'`，或在插件页里改。

| 字段 | 取值 | 作用 |
|---|---|---|
| `mode` | `off` / `strict` / `replace` / `append` | 覆盖模式；总暂停与分家停用始终优先 |
| `persona` | 人设 id | 用哪个人设，默认取 `state.json` 的当前人设 |
| `agents` | `["claude","codex"]` | 只对这些 Agent 生效；不给 = 全部 |
| `disabledAgents` | `["claude"]` | 排除这些 Agent，优先级高于 `agents` |
| `inlinePersonas` | `[{id,name,text}]` | 页面导入的人设；与磁盘同名时以它为准 |

`off` 一个字节都不改；`strict` 整段 system 换成人设；`replace` 人设在前、宿主里报名字的句子
删掉；`append` 人设在前、宿主原样保留。

## 人设从哪来

按优先级：

1. **页面导入**（`options.inlinePersonas`）——文件不出你的机器，正文存进 `plugins.json`。
2. **`~/.agent-purge/personas/*.md`**——`AGENT_PURGE_HOME` 可以改这个位置。
3. **随包内置**（`personas/neutral.md`、`personas/terse.md`）——只在没有 CLI 时出现，
   让刚装上的插件不是空的。

页面跑在 sandbox 里（`connect-src 'none'`，没有 `fetch`、读不到磁盘），所以清单只能以脚本
文件的形式存在：钩子启动时把上面 2、3 摊平成 `page/personas.js`，之后在请求路径上每几秒
复查一次目录。文件写不进去（只读安装）时页面会说明原因，导入功能照常。

这个清单只在本机存在：`.gitignore` 忽略它，`package.json` 的 `files` 也不包含它——否则你的
人设名字会跟着 npm 包一起发出去。

## 边界

- 只处理**经过 magpie 网关**的请求。客户端自己固定好的行为、直连上游的流量，它改不了。
- `strict` 会连宿主 system 里的工具说明一起丢掉，harness 可能变笨；要保留工具说明用
  `append` / `replace`。
- `replace` 是近似实现：网关手里只有文本，没有各家的启动参数，只能按「自称 + 点名厂商」删行。
- 页面读不到磁盘、不能联网；它看到的都应该当作公开信息。

## 开发

```bash
npm test                      # 钩子 / 页面 / 清单 / 包清单，无依赖，不需要 magpie
node scripts/gen-personas.mjs # 手动重写 page/personas.js（一般用不到）
```

真机验收还是得装一次：`magpie plugin add ./`（在仓库目录里跑），然后 `magpie plugin --json`
看有没有加载错误。

## 发布

见 [docs/publishing.md](docs/publishing.md)：建仓库、`npm publish`、打 `magpie-plugin`
topic、给推荐列表提 PR。

## 许可

MIT
