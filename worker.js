// 统一的 Cloudflare Worker - 支持 REST API 和 GraphQL
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    try {
      // CORS 预检请求处理
      if (request.method === 'OPTIONS') {
        return handleCORS();
      }

      // GraphQL 端点
      if (url.pathname === '/graphql' && request.method === 'POST') {
        return await handleGraphQL(request, env);
      }

      // 健康检查端点
      if (url.pathname === '/health' && request.method === 'GET') {
        return createSuccessResponse({
          status: 'healthy',
          timestamp: Date.now(),
          version: '1.0.0',
          endpoints: ['/', '/graphql', '/health']
        });
      }

      // API 信息端点
      if (url.pathname === '/' && request.method === 'GET') {
        return createSuccessResponse({
          service: 'Zed.AI OpenAI Proxy',
          version: '1.0.0',
          endpoints: {
            rest: '/ (POST)',
            graphql: '/graphql (POST)',
            health: '/health (GET)',
            info: '/ (GET)'
          },
          documentation: 'https://github.com/Be-Human/zed.ai'
        });
      }

      // REST API 端点
      if (url.pathname === '/' && request.method === 'POST') {
        return await handleREST(request, env);
      }

      // 未找到的端点
      return createErrorResponse('Endpoint not found', 404, {
        availableEndpoints: ['/', '/graphql', '/health'],
        requestedPath: url.pathname,
        method: request.method
      });

    } catch (error) {
      console.error('Worker Error:', error);
      return createErrorResponse('Internal server error', 500, {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  },
};

// GraphQL 处理函数（简化版本）
async function handleGraphQL(request, env) {
  try {
    const body = await request.json();
    const { query, variables } = body;

    if (!query) {
      return createErrorResponse('GraphQL query is required', 400);
    }

    // 简单的 GraphQL 查询解析（用于兼容前端）
    if (query.includes('createChatCompletion') || query.includes('chatCompletion')) {
      // 从 variables 中提取参数
      let chatInput;
      if (variables && variables.input) {
        chatInput = variables.input;
      } else if (variables) {
        chatInput = {
          messages: variables.messages,
          model: variables.model,
          temperature: variables.temperature,
          maxTokens: variables.maxTokens
        };
      } else {
        return createErrorResponse('GraphQL variables are required', 400);
      }

      // 转换为标准格式并调用聊天完成
      const chatRequest = {
        messages: chatInput.messages,
        model: chatInput.model || 'gpt-3.5-turbo',
        temperature: chatInput.temperature || 0.7,
        max_tokens: chatInput.maxTokens || 1000
      };

      const result = await processChatCompletion(chatRequest, env);
      
      // 返回 GraphQL 格式的响应
      return createSuccessResponse({
        data: {
          createChatCompletion: {
            id: result.id,
            choices: result.choices,
            usage: result.usage
          }
        }
      });
    }

    return createErrorResponse('Unsupported GraphQL operation', 400);
    
  } catch (error) {
    console.error('GraphQL Error:', error);
    return createErrorResponse(`GraphQL Error: ${error.message}`, 400);
  }
}

// REST API 处理函数
async function handleREST(request, env) {
  try {
    const body = await request.json();
    const result = await processChatCompletion(body, env);
    return createSuccessResponse(result);
  } catch (error) {
    console.error('REST API Error:', error);
    return createErrorResponse(error.message, 400);
  }
}

// 统一的聊天完成处理
async function processChatCompletion(requestData, env) {
  // 环境检查
  if (!env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.');
  }

  // 验证请求
  const validation = validateChatRequest(requestData);
  if (!validation.valid) {
    throw new Error(`Invalid request: ${validation.errors.join(', ')}`);
  }

  // 构建 OpenAI 请求
  const openaiRequest = {
    model: requestData.model || 'gpt-3.5-turbo',
    messages: requestData.messages,
    temperature: Math.max(0, Math.min(2, requestData.temperature || 0.7)),
    max_tokens: Math.max(1, Math.min(4000, requestData.max_tokens || requestData.maxTokens || 1000)),
    stream: false
  };

  console.log('Calling OpenAI API with:', {
    model: openaiRequest.model,
    messageCount: openaiRequest.messages.length,
    temperature: openaiRequest.temperature,
    max_tokens: openaiRequest.max_tokens
  });

  // 调用 OpenAI API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'User-Agent': 'Zed.AI-Worker/1.0'
    },
    body: JSON.stringify(openaiRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI API Error ${response.status}:`, errorText);
    
    let errorMessage = 'OpenAI API request failed';
    if (response.status === 401) {
      errorMessage = 'Invalid OpenAI API key';
    } else if (response.status === 429) {
      errorMessage = 'OpenAI API rate limit exceeded';
    } else if (response.status === 400) {
      errorMessage = 'Invalid request to OpenAI API';
    }
    
    throw new Error(`${errorMessage} (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log('OpenAI API response received:', {
    id: result.id,
    model: result.model,
    choices: result.choices?.length
  });

  return result;
}

// 请求验证函数
function validateChatRequest(body) {
  const errors = [];

  if (!body.messages) {
    errors.push('Missing required field: messages');
  } else if (!Array.isArray(body.messages)) {
    errors.push('Field "messages" must be an array');
  } else if (body.messages.length === 0) {
    errors.push('Field "messages" cannot be empty');
  } else {
    body.messages.forEach((msg, index) => {
      if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
        errors.push(`Message ${index}: invalid or missing role`);
      }
      if (!msg.content || typeof msg.content !== 'string') {
        errors.push(`Message ${index}: invalid or missing content`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// CORS 处理
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    },
  });
}

// 成功响应
function createSuccessResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Cache-Control': 'no-cache'
    },
  });
}

// 错误响应
function createErrorResponse(message, status = 500, details = {}) {
  const errorResponse = {
    error: {
      message,
      status,
      timestamp: new Date().toISOString(),
      ...details
    }
  };

  return new Response(JSON.stringify(errorResponse, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Cache-Control': 'no-cache'
    },
  });
}