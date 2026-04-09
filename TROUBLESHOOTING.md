# Zed.AI 故障排除指南

## 常见问题解决方案

### 🚨 GraphQL 端点返回 404 错误

**问题描述**: 前端尝试访问 `/graphql` 端点时返回 404 Not Found

**解决方案**:
1. 确认 Worker 部署了最新的 `worker.js` 文件
2. 检查 `wrangler.toml` 中的 `main` 字段是否指向正确的文件
3. 重新部署 Worker: `wrangler deploy`

### 🚨 REST API 返回 500 内部服务器错误

**问题描述**: POST 请求到根路径返回 500 错误

**可能原因和解决方案**:

1. **OpenAI API Key 未配置**
   ```bash
   # 设置 API Key
   wrangler secret put OPENAI_API_KEY
   # 输入你的 OpenAI API Key
   ```

2. **检查 API Key 是否有效**
   ```bash
   # 列出当前设置的密钥
   wrangler secret list
   ```

3. **检查 Worker 日志**
   ```bash
   # 实时查看日志
   wrangler tail
   ```

### 🚨 前端显示 "API调用失败: [object Object]"

**问题描述**: 前端无法正确解析错误响应

**解决方案**: 前端已经在最新版本中修复了这个问题，如果还有问题，请检查：
1. 前端是否使用了最新的错误处理代码
2. Worker 是否返回了正确格式的错误响应

### 🚨 CORS 错误

**问题描述**: 浏览器控制台显示 CORS 相关错误

**解决方案**:
1. 确认 Worker 包含了正确的 CORS 头部设置
2. 检查前端请求的 URL 是否正确
3. 确认 Worker 正确处理了 OPTIONS 预检请求

## 部署检查清单

### ✅ 环境配置检查

1. **Cloudflare Workers 环境变量**
   ```bash
   # 检查已设置的密钥
   wrangler secret list
   
   # 如果 OPENAI_API_KEY 不在列表中，添加它
   wrangler secret put OPENAI_API_KEY
   ```

2. **前端环境变量**
   ```bash
   # 检查 .env 文件
   cat .env
   
   # 确保 VITE_WORKER_ENDPOINT 指向正确的 Worker URL
   VITE_WORKER_ENDPOINT=https://zed-ai-worker.to-be-herman.workers.dev
   ```

### ✅ 部署验证

1. **Worker 部署验证**
   ```bash
   # 部署 Worker
   wrangler deploy
   
   # 测试健康检查
   curl https://zed-ai-worker.to-be-herman.workers.dev/health
   ```

2. **端点功能测试**
   ```bash
   # 测试 GET 根路径（API 信息）
   curl https://zed-ai-worker.to-be-herman.workers.dev/
   
   # 测试 REST API
   curl -X POST https://zed-ai-worker.to-be-herman.workers.dev/ \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"test"}]}'
   
   # 测试 GraphQL API
   curl -X POST https://zed-ai-worker.to-be-herman.workers.dev/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"mutation CreateChatCompletion($input: ChatCompletionInput!) { createChatCompletion(input: $input) { id choices { message { content } } } }","variables":{"input":{"messages":[{"role":"user","content":"test"}]}}}'
   ```

### ✅ 前端验证

1. **构建和运行前端**
   ```bash
   # 安装依赖
   npm install
   
   # 开发模式运行
   npm run dev
   
   # 或构建生产版本
   npm run build
   npm run preview
   ```

## 监控和日志

### 实时日志查看
```bash
# 实时查看 Worker 日志
wrangler tail

# 过滤特定类型的日志
wrangler tail --format=pretty
```

### 性能监控
- 在 Cloudflare Dashboard 中查看 Worker 的性能指标
- 监控请求数量、错误率、延迟等指标

## 常用调试命令

### 检查 Worker 状态
```bash
# 列出所有 Workers
wrangler list

# 查看特定 Worker 信息
wrangler show zed-ai-worker
```

### 本地开发调试
```bash
# 本地运行 Worker
wrangler dev

# 指定端口
wrangler dev --port 8787
```

### 环境变量管理
```bash
# 列出所有密钥
wrangler secret list

# 删除密钥
wrangler secret delete OPENAI_API_KEY

# 重新设置密钥
wrangler secret put OPENAI_API_KEY
```

## 获取帮助

如果问题仍然存在：

1. **检查项目文档**: [GitHub Repository](https://github.com/Be-Human/zed.ai)
2. **查看 Cloudflare Workers 文档**: [Cloudflare Docs](https://developers.cloudflare.com/workers/)
3. **OpenAI API 文档**: [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

## 版本更新日志

- **v1.0.0**: 初始版本，支持基础 REST API
- **v1.1.0**: 添加 GraphQL 支持，改进错误处理
- **v1.2.0**: 统一 REST 和 GraphQL 端点，修复 404 错误