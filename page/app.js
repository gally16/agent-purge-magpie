// 人设页：只负责把人设 id 和模式写进这个插件的 options，真正改写请求的是 hooks.js。
// 沙箱页是 classic script（不是 module），所以整段包在 async IIFE 里。
// 页面里没有 fetch、读不到磁盘：清单来自 hooks.js 启动时生成的 personas.js，
// 正文不在页面里，只有 id / 名字 / 说明；导入的人设用原生 file input + File.text() 读，
// 正文存在 options.inlinePersonas 里。
(async () => {
	await magpie.ready;

	const MODES = [
		["", "跟随 agent-purge（state.json）"],
		["strict", "strict — 只发人设，宿主 system 全丢"],
		["replace", "replace — 人设 + 宿主去掉身份句"],
		["append", "append — 人设在前，宿主原样"],
		["off", "off — 不注入"],
	];
	// magpie.options.set 每秒只收一次；两次调用之间必须留够间隔
	const RATE_MS = 1000;

	const $ = (id) => document.getElementById(id);

	// 清单元信息由 personas.js 写进来：来源（磁盘 / 内置 / 没有）、有没有 state.json
	const meta = () => (window.PERSONAS_META && typeof window.PERSONAS_META === "object" ? window.PERSONAS_META : {});

	let base = {}; // 服务端已知的完整 options：页面不管的键（如 agents）原样带回去
	let picked = { persona: "", mode: "" }; // 页面上的选择，可能还没落地

	// 清单由 hooks.js 生成：磁盘上的优先，没有 CLI 时用随包内置的人设
	const fixed = () => (Array.isArray(window.PERSONAS) ? window.PERSONAS : []);
	const inline = () => (Array.isArray(base.inlinePersonas) ? base.inlinePersonas : []);
	const rows = () => [
		...inline().map((p) => ({ ...p, name: p.name || p.id, source: "inline", imported: true })),
		...fixed(),
	];
	const nameOf = (id) => rows().find((p) => p.id === id)?.name || id;
	// inlinePersonas、agents 与 disabledAgents 也进 key：改变后即使 persona 没变也要落地
	const pickKey = () => JSON.stringify([picked.persona, picked.mode, inline(), base.agents, base.disabledAgents]);
	// 跟随态写空串：hooks.js 只认 MODES 里的值，其余回退 state.json
	const modeText = (m) => m || "跟随 state.json";
	let sent = ""; // 最后一次成功落地的选择
	let sending = false;
	let lastAt = 0;
	let failed = "";

	const KNOWN_AGENTS = [
		{ id: "claude", name: "Claude Code" },
		{ id: "codex", name: "Codex" },
		{ id: "opencode", name: "OpenCode" },
		{ id: "pi", name: "Pi" },
		{ id: "dsh", name: "DeepSeek Harness" },
		{ id: "antigravity", name: "Antigravity (agy)" },
		{ id: "hermes", name: "Hermes" },
		{ id: "cursor", name: "Cursor" },
		{ id: "gemini", name: "Gemini CLI" },
	];
	let extraAgents = [];

	const allAgentIds = () => {
		const set = new Set(KNOWN_AGENTS.map((a) => a.id));
		const extras = [];
		for (const id of [...(base.agents ?? []), ...(base.disabledAgents ?? []), ...extraAgents]) {
			if (id && typeof id === "string" && !set.has(id)) {
				set.add(id);
				extras.push({ id, name: id });
			}
		}
		return [...KNOWN_AGENTS, ...extras];
	};

	let scopeMode = null;
	const currentScope = () => {
		if (scopeMode) return scopeMode;
		if (Array.isArray(base.agents) && base.agents.length > 0) return "include";
		if (Array.isArray(base.disabledAgents) && base.disabledAgents.length > 0) return "exclude";
		return "all";
	};

	// 清单没接上时把原因说清楚：装完插件什么都没看到，比看到一行解释糟糕得多
	function paintSource() {
		const box = $("source-hint");
		if (!box) return;
		const m = meta();
		let text = "";
		if (!Array.isArray(window.PERSONAS)) {
			text = "人设清单还没生成：重启一次 magpie 插件，或运行 npm run personas；也可以直接在下面导入 .md。";
		} else if (m.source !== "disk") {
			text = `没找到 ${m.home || "~/.agent-purge"} 里的人设：先跑一次 agent-purge 初始化，或直接导入 .md。下面是随插件附带的内置人设。`;
		}
		box.hidden = !text;
		box.textContent = text;
	}

	function paintStatus() {
		const st = $("status");
		const only = Array.isArray(base.agents) && base.agents.length
			? `（只对 ${base.agents.join(" / ")} 生效）`
			: Array.isArray(base.disabledAgents) && base.disabledAgents.length
				? `（已排除 ${base.disabledAgents.join(" / ")}）`
				: "";
		// 没有 state.json 时「跟随」等于什么都不做，得提醒一句
		const follow = meta().hasState === false && !picked.mode ? "（没检测到 state.json：选一个具体模式才会生效）" : "";
		st.hidden = false;
		st.dataset.state = failed ? "error" : sending ? "busy" : "ok";
		st.textContent = failed
			? failed
			: sending
				? "正在保存…"
				: `${picked.persona ? nameOf(picked.persona) : "跟随 state.json"} · ${modeText(picked.mode)}${only}${follow}`;
	}

	function paintAgents() {
		const scope = currentScope();
		const sAll = $("scope-all");
		const sInc = $("scope-include");
		const sExc = $("scope-exclude");
		const panel = $("agents-panel");
		const list = $("agents-list");
		if (sAll) sAll.checked = scope === "all";
		if (sInc) sInc.checked = scope === "include";
		if (sExc) sExc.checked = scope === "exclude";
		if (panel) panel.hidden = scope === "all";
		if (!list) return;

		list.textContent = "";
		const activeList = scope === "include" ? (base.agents ?? []) : scope === "exclude" ? (base.disabledAgents ?? []) : [];
		for (const agent of allAgentIds()) {
			const on = activeList.includes(agent.id);
			const label = document.createElement("label");
			label.className = on ? "agent-chip checked" : "agent-chip";
			label.dataset.agent = agent.id;

			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = on;
			cb.onchange = () => toggleAgent(agent.id, cb.checked);

			const name = document.createElement("span");
			name.textContent = agent.name;

			label.append(cb, name);
			if (agent.id !== agent.name) {
				const code = document.createElement("code");
				code.textContent = agent.id;
				label.append(code);
			}
			list.append(label);
		}
	}

	function toggleAgent(id, checked) {
		const scope = currentScope();
		if (scope === "include") {
			const set = new Set(base.agents ?? []);
			if (checked) set.add(id);
			else set.delete(id);
			base = { ...base, agents: [...set], disabledAgents: [] };
			save({});
		} else if (scope === "exclude") {
			const set = new Set(base.disabledAgents ?? []);
			if (checked) set.add(id);
			else set.delete(id);
			base = { ...base, disabledAgents: [...set], agents: [] };
			save({});
		}
	}

	function changeScope(newScope) {
		scopeMode = newScope;
		if (newScope === "all") {
			base = { ...base, agents: [], disabledAgents: [] };
		} else if (newScope === "include") {
			base = { ...base, disabledAgents: [] };
		} else if (newScope === "exclude") {
			base = { ...base, agents: [] };
		}
		save({});
	}

	function paint() {
		$("now-persona").textContent = picked.persona ? nameOf(picked.persona) : "跟随 state.json";
		$("now-mode").textContent = modeText(picked.mode);
		$("mode").value = picked.mode;

		const q = $("q").value.trim().toLowerCase();
		const hits = rows().filter(
			(p) => !q || [p.id, p.name, p.description].some((s) => (s ?? "").toLowerCase().includes(q)),
		);

		const list = $("list");
		// 重建会销毁按钮，键盘用户选完后焦点不能掉回 body
		const focused = document.activeElement?.dataset?.persona ?? "";
		let again = null;
		$("count").textContent = q ? `匹配 ${hits.length} / ${rows().length}` : `全部 ${rows().length}`;
		list.textContent = "";
		if (!hits.length) {
			const empty = document.createElement("p");
			empty.className = "empty";
			empty.textContent = rows().length
				? "没有匹配的人设"
				: "还没有人设：先跑一次 agent-purge，或在下面导入一个 .md。";
			list.append(empty);
		}
		for (const p of hits) {
			const on = p.id === picked.persona;
			const b = document.createElement("button");
			b.type = "button";
			b.className = on ? "persona on" : "persona";
			b.dataset.persona = p.id;
			if (p.id === focused) again = b;
			b.setAttribute("aria-pressed", on ? "true" : "false");
			b.title = p.description || p.id;
			const name = document.createElement("strong");
			name.textContent = (on ? "✓ " : "") + (p.name || p.id);
			b.append(name);
			if (p.description) {
				const desc = document.createElement("span");
				desc.textContent = p.description;
				b.append(desc);
			}
			if (p.id !== (p.name || p.id)) {
				const id = document.createElement("code");
				id.textContent = p.id;
				b.append(id);
			}
			if (p.source === "bundled") {
				const badge = document.createElement("span");
				badge.className = "badge";
				badge.textContent = "内置";
				b.append(badge);
			}
			b.onclick = () => save({ persona: p.id });
			list.append(b);
		}
		if (again) again.focus();
		paintSource();
		paintStatus();
		paintAgents();
	}

	function save(patch) {
		failed = "";
		picked = { ...picked, ...patch };
		paint();
		void flush();
	}

	// 串行化 + 合并：点击期间不丢，最终以最后一次选择为准
	async function flush() {
		if (sending) return; // 正在跑的那一轮收尾时会自己再检查一次
		sending = true;
		try {
			while (sent !== pickKey()) {
				const key = pickKey();
				const body = { ...base, persona: picked.persona, mode: picked.mode };
				const wait = Math.max(0, RATE_MS + 50 - (Date.now() - lastAt));
				if (wait) await new Promise((r) => setTimeout(r, wait));
				lastAt = Date.now();
				let saved = body;
				try {
					// set 返回保存后的完整 options，以它为准（magpie 可能补默认值）
					saved = (await magpie.options.set(body)) ?? body;
				} catch (e) {
					failed = `保存失败：${e?.message ?? e}`;
					picked = { persona: base.persona ?? "", mode: base.mode ?? "" };
					paint();
					return;
				}
				// 回包如果只是归一化后的部分键，也别把 body 里它没回的键丢掉
				base = typeof saved === "object" && saved ? { ...body, ...saved } : body;
				sent = key;
				paint();
			}
		} finally {
			sending = false;
			paintStatus();
		}
	}

	for (const [value, text] of MODES) $("mode").append(new Option(text, value));

	// 先拿到完整 options 再开放交互：否则这期间的点击会用空 base 组 body，把 agents 写没
	try {
		base = (await magpie.options.get()) ?? {};
	} catch (e) {
		$("status").hidden = false;
		$("status").dataset.state = "error";
		$("status").textContent = `读不到当前 options：${e?.message ?? e}`;
		return;
	}
	picked = { persona: base.persona ?? "", mode: base.mode ?? "" };
	sent = pickKey();
	paint();
	$("mode").onchange = (e) => save({ mode: e.target.value });
	$("q").oninput = () => paint();

	const sAll = $("scope-all");
	const sInc = $("scope-include");
	const sExc = $("scope-exclude");
	if (sAll) sAll.onchange = () => changeScope("all");
	if (sInc) sInc.onchange = () => changeScope("include");
	if (sExc) sExc.onchange = () => changeScope("exclude");

	const customInput = $("custom-agent");
	const addBtn = $("add-agent-btn");
	const handleAddAgent = () => {
		if (!customInput) return;
		const val = customInput.value.trim().toLowerCase();
		if (!val || !/^[a-zA-Z0-9._-]+$/.test(val)) return;
		if (!extraAgents.includes(val)) extraAgents.push(val);
		customInput.value = "";
		const scope = currentScope();
		if (scope === "all") {
			changeScope("include");
			toggleAgent(val, true);
		} else {
			toggleAgent(val, true);
		}
	};
	if (addBtn) addBtn.onclick = handleAddAgent;
	if (customInput) customInput.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); handleAddAgent(); } };

	// —— 导入人设 md ——
	// 沙箱页没有 fs、没有 fetch：原生 file input + File.text() 是读用户主动选的文件的唯一通道，
	// 正文落在本插件的 options（plugins.json）里，不写磁盘。
	const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
	const MAX_TEXT = 64 * 1024; // options 是整份读写的 JSON，单个人设限 64KB
	const MAX_COUNT = 30;
	// frontmatter 只拿来填名字：hook 拿正文前会自己再剥一次
	const metaOf = (raw) => {
		const out = { name: "", description: "" };
		const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
		if (!m) return out;
		for (const line of m[1].split(/\r?\n/)) {
			const kv = /^\s*(name|title|description)\s*:\s*(.+)$/i.exec(line);
			if (kv) out[kv[1].toLowerCase() === "description" ? "description" : "name"] = kv[2].trim().replace(/^["']|["']$/g, "");
		}
		return out;
	};
	const importError = (msg) => {
		const el = $("import-err");
		el.hidden = !msg;
		el.dataset.state = msg ? "error" : "";
		el.textContent = msg || "";
	};
	const resetForm = () => {
		importError("");
		$("body").value = "";
		$("pid").value = "";
		$("pname").value = "";
		$("file").value = "";
	};
	const paintImport = () => {
		const list = inline();
		$("import-count").textContent = list.length ? `已导入 ${list.length} 个` : "还没有导入";
		$("del-all").hidden = !list.length;
	};

	$("file").onchange = async (e) => {
		const f = e.target.files?.[0];
		if (!f) return;
		let raw = "";
		try {
			raw = await f.text();
		} catch (err) {
			importError(`读不了这个文件：${err?.message ?? err}`);
			return;
		}
		importError("");
		$("body").value = raw;
		const info = metaOf(raw);
		if (info.name) $("pname").value = info.name;
		if (!$("pid").value.trim()) {
			const guess = String(f.name ?? "").replace(/\.(md|markdown|txt)$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-");
			if (guess) $("pid").value = guess.replace(/^[^A-Za-z0-9]+/, "").slice(0, 64);
		}
	};

	$("import-save").onclick = () => {
		const text = $("body").value.trim();
		const id = $("pid").value.trim();
		if (!text) return importError("正文是空的：先选一个 .md 文件，或者把正文贴进来。");
		if (text.length > MAX_TEXT) return importError(`正文 ${text.length} 字，超过 ${MAX_TEXT / 1024}KB 上限，删掉一些再存。`);
		if (!ID_RE.test(id)) return importError("id 只能用字母、数字、点、下划线、连字符，并以字母或数字开头（例：my-persona）。");
		if (fixed().some((p) => p.id === id)) return importError(`id「${id}」和清单里的人设重名，换一个。`);
		if (inline().length >= MAX_COUNT && !inline().some((p) => p.id === id)) {
			return importError(`最多 ${MAX_COUNT} 个导入人设：先删掉一些再导入。`);
		}
		const name = $("pname").value.trim() || metaOf(text).name || id;
		base = { ...base, inlinePersonas: [...inline().filter((p) => p.id !== id), { id, name, text }] };
		resetForm();
		paintImport();
		save({ persona: id }); // 导入即选中，下一个请求就用它
	};

	$("import-reset").onclick = () => resetForm();

	// shortcut: 只能整组删，单个删除靠“同名 id 再导入覆盖”；要逐个删就在卡片上加按钮
	$("del-all").onclick = () => {
		const selected = inline().some((p) => p.id === picked.persona);
		base = { ...base, inlinePersonas: [] };
		if (selected) picked = { ...picked, persona: "" }; // 选中的人设没了，回到跟随
		paintImport();
		save({});
	};

	paintImport();
})();
