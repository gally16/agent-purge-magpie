# 发布与上架

三种安装方式对应三件一次性的事：npm 包、GitHub 仓库、magpie 推荐列表。全部做完之后，
用户装这个插件最多点一下。

## 1. 仓库（已完成）

仓库已在 <https://github.com/gally16/agent-purge-magpie>，`main` 与 `v0.1.0` 都已推上去。
换一台机器或重建仓库时，步骤是：

```bash
cd agent-purge-magpie
git init -b main
git add -A
git commit -m "agent-purge magpie plugin 0.1.0"
git remote add origin git@github.com:gally16/agent-purge-magpie.git
git push -u origin main && git push origin --tags
```

`package.json` 就在仓库根目录，这是 `magpie plugin add github:gally16/agent-purge-magpie`
能工作的前提——magpie 只读仓库根目录的 `package.json`，不看子目录。同理，`hooks.js`、
`page/`、`personas/` 都是提交进仓库的源码，没有构建步骤：GitHub 安装直接跑这些文件。

## 2. 发布到 npm

```bash
npm login
npm publish
```

`prepublishOnly` 会先跑一遍 `npm test`，测试不过就发不出去。包名 `agent-purge-magpie`
目前没有被占用；要改名字的话，`package.json` 的 `name`、`docs/registry-entry.json` 的
`package`、README 里的命令一起改。

发完之后用户就能：

```bash
magpie plugin add agent-purge-magpie
```

## 3. 打 GitHub topic（可选，但值得）

仓库主页 → About 旁的齿轮 → Topics 加 `magpie-plugin`。打了这个 topic 的仓库会出现在
magpie 的「插件 → 发现 → 非官方插件 · GitHub」，按 Star 排序，标明未经审阅。magpie 最多
每十分钟问一次 GitHub，几分钟内就能看到。

## 4. 提交到推荐列表

推荐列表是社区仓库里的 [`registry.json`](https://github.com/magpie-community/plugins/blob/main/registry.json)：

1. fork `magpie-community/plugins`；
2. 把 `docs/registry-entry.json` 的内容加到 `registry.json` 的 `plugins` 数组里
   （`kind: "middleware"` 的条目，不写 `providers`，也不要写 `community`——那是社区自己包的标记）；
3. 提 PR，说明插件做什么、装完默认不改请求（`mode` 为空时跟随 `state.json`，没有 CLI 时等于 `off`）。

收录后，magpie 最多每六小时拉一次列表，插件页「推荐」里就能一键安装。想本地先验：

```bash
MAGPIE_PLUGIN_MARKET=<改动后的 registry.json 的 raw 地址> magpie
```

## 5. 发版

```bash
npm version patch        # 或 minor / major
git push --follow-tags
npm publish
```

插件版本和 `agent-purge` CLI 各自独立：插件只依赖数据目录的格式（`state.json` +
`personas/*.md`），不依赖 CLI 的版本号。改了数据格式才需要同步升 minor。

## 6. 装完自检

```bash
magpie plugin add agent-purge-magpie
magpie plugin --json          # 加载错误会写在这里
magpie plugin options agent-purge-magpie '{"mode":"append"}'
```

然后打开 magpie → 插件 → agent-purge →「人设」，列表里应该有 `~/.agent-purge/personas`
下的人设；没有 CLI 时是随包附带的中性 / 极简两个内置人设。
