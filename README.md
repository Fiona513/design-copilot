# Design Copilot V2.1 — Real AI Integration

V2.1 在 V2 Functional MVP 的三栏工作区和原有任务状态机上接入真实 LLM。没有新增页面，也没有改变 Brief → Approval → Generate → Review → Apply Fix → Re-review → Complete 的 Golden Path。

## 运行

需要 Node.js 20 或更高版本。

1. 将 `.env.example` 复制为 `.env`。
2. 在 `.env` 中填写服务端环境变量 `OPENAI_API_KEY`。
3. 在本目录运行 `npm start`。
4. 打开 `http://127.0.0.1:3000`（或你设置的 `PORT`）。

不要直接双击 `index.html` 期待真实 AI：真实模型请求只能通过本地 API proxy 发出。没有启动 proxy 或没有配置 Key 时，前端会明确显示 fallback 状态并使用 `LocalDemoProvider`。

## 模型配置

`.env` 支持：

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
PORT=3000
HOST=0.0.0.0
AI_PROVIDER=llm
OPENAI_TIMEOUT_MS=60000
OPENAI_MAX_OUTPUT_TOKENS=5000
AI_RATE_LIMIT_PER_MINUTE=30
```

- `OPENAI_API_KEY` 只由 `server.mjs` 读取，不会进入浏览器 bundle、localStorage 或导出 JSON。
- `OPENAI_MODEL` 默认是支持 Responses API 与 Structured Outputs 的 `gpt-5-mini`。可替换为同样支持严格 JSON Schema 输出的模型。
- `AI_PROVIDER=local` 会有意跳过真实模型，运行 Local Demo 模式。
- 服务绑定 `0.0.0.0`，优先使用 Render 注入的 `PORT`，本地默认 `3000`；API 路由为 `POST /api/agent`，健康检查为 `GET /health` 或 `GET /api/health`。
- 公开 API 默认按 IP 每分钟限制 30 次、单次请求体最多 1 MB、模型超时 60 秒、最多输出 5,000 tokens；可通过环境变量收紧限制。

## Provider architecture

```text
AgentRuntime
└── ProviderGateway
    ├── LLMProvider → /api/agent → OpenAI Responses API
    └── LocalDemoProvider (fallback / demo mode)
```

真实模型节点包括：Requirement Understanding、Missing Context、User Insight、Experience Principles、User Flow、Screen Structure、Prototype 内容、AI Review、Ask Agent、Regenerate、Apply Fix 和 Re-review。

每个节点都有独立的严格 JSON Schema。Proxy 会解析并校验模型结果；无效 JSON、Schema 不匹配或缺少 Review 六类检查时自动重试一次。仍失败则返回安全错误，前端不会把失败响应写入 Task State，并提供 Retry AI / Use Local Demo。

## 状态与人工决策

V2 的 `project / brief / context / missingContext / plan / currentStep / outputs / reviews / iterations / history / status` 结构保持不变。模型结果只在校验成功后提交。Approval、Replan、Apply Fix、Stop/Resume、History、localStorage 与 JSON Export 仍由原状态机控制。

- Ask Agent 使用当前 Project Context、当前完整 Artifact 和用户指令，返回完整替换 Artifact。
- Regenerate 每次重新调用 Provider，不复用固定返回。
- Apply Fix 把 Review Issue 作为修改指令生成完整 Prototype V2，然后 Re-review。
- Stop 使用 `AbortController` 取消请求和 runtime token 防止迟到响应写入。
- 不请求或显示 Chain of Thought。

## 测试

```bash
npm test
```

测试覆盖 ADHD 儿童阅读与跨境电商运营后台两个明显不同的输入、完整 Golden Path、结构化请求、Missing Context、Ask Agent、Regenerate、Apply Fix、Re-review、History、Stop、安全错误、无效 JSON 重试和 Local fallback。
