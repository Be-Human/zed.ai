# Zed.AI API 文档

## 概述

Zed.AI 提供基于 Cloudflare Workers 的 OpenAI API 代理服务，支持 GraphQL 和 REST API 两种接口形式。

## 基础信息

- **基础URL**: `https://zed-ai-worker.to-be-herman.workers.dev`
- **支持的HTTP方法**: `GET`, `POST`, `OPTIONS`
- **内容类型**: `application/json`

## 认证

API密钥在 Cloudflare Worker 环境中配置，前端无需提供 OpenAI API Key。

## 端点

### 1. 健康检查

```
GET /health
```

**响应示例**:
```json
{
  "status": "healthy",
  "timestamp": 1703875200000,
  "version": "1.0.0",
  "endpoints": ["/", "/graphql", "/health"]
}
```

### 2. API 信息

```
GET /
```

**响应示例**:
```json
{
  "service": "Zed.AI OpenAI Proxy",
  "version": "1.0.0",
  "endpoints": {
    "rest": "/ (POST)",
    "graphql": "/graphql (POST)",
    "health": "/health (GET)",
    "info": "/ (GET)"
  },
  "documentation": "https://github.com/Be-Human/zed.ai"
}
```

### 3. GraphQL 端点

```
POST /graphql
```

#### 请求示例

```json
{
  "query": "mutation CreateChatCompletion($input: ChatCompletionInput!) { createChatCompletion(input: $input) { id choices { message { role content } } usage { total_tokens } } }",
  "variables": {
    "input": {
      "model": "gpt-3.5-turbo",
      "messages": [
        {
          "role": "user",
          "content": "Hello, how are you?"
        }
      ],
      "temperature": 0.7,
      "maxTokens": 1000
    }
  }
}
```

#### 响应示例

```json
{
  "data": {
    "createChatCompletion": {
      "id": "chatcmpl-8X1Y2Z3A4B5C6D7E8F9G0H",
      "choices": [
        {
          "message": {
            "role": "assistant",
            "content": "Hello! I'm doing well, thank you for asking. How can I help you today?"
          }
        }
      ],
      "usage": {
        "total_tokens": 25
      }
    }
  }
}
```

### 4. REST API 端点

```
POST /
```

#### 请求示例

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

#### 响应示例

```json
{
  "id": "chatcmpl-8X1Y2Z3A4B5C6D7E8F9G0H",
  "object": "chat.completion",
  "created": 1703875200,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking. How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 13,
    "total_tokens": 25
  }
}
```

## 错误处理

所有错误响应都遵循以下格式：

```json
{
  "error": {
    "message": "错误描述",
    "timestamp": "2023-12-29T10:00:00.000Z",
    "status": 400
  }
}
```

### 常见错误码

- `400 Bad Request`: 请求格式错误或参数无效
- `404 Not Found`: 端点不存在
- `500 Internal Server Error`: 服务器内部错误

## 使用限制

- 温度参数范围：0.0 - 2.0
- 最大令牌数：1 - 4000
- 支持的角色：`user`, `assistant`, `system`

## CORS

API 支持跨域请求，设置了适当的 CORS 头部。

## 测试命令

```bash
# 替换为你的实际 Worker URL
WORKER_URL="https://zed-ai-worker.to-be-herman.workers.dev"

# 1. 测试健康检查
curl -X GET "$WORKER_URL/health"

# 2. 测试 API 信息
curl -X GET "$WORKER_URL/"

# 3. 测试 REST API
curl -X POST "$WORKER_URL/" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "max_tokens": 100
  }'

# 4. 测试 GraphQL API
curl -X POST "$WORKER_URL/graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation CreateChatCompletion($input: ChatCompletionInput!) { createChatCompletion(input: $input) { id choices { message { content } } } }",
    "variables": {
      "input": {
        "messages": [{"role": "user", "content": "Hello!"}],
        "model": "gpt-3.5-turbo",
        "temperature": 0.7,
        "maxTokens": 100
      }
    }
  }'
```

## 部署说明

1. 确保在 Cloudflare Workers 中设置了 `OPENAI_API_KEY` 环境变量
2. 使用 `wrangler deploy` 部署 Worker
3. 更新前端的 `VITE_WORKER_ENDPOINT` 环境变量指向 Worker URL