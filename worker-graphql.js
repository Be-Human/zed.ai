// Enhanced Cloudflare Worker with GraphQL support
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    // GraphQL 端点
    if (url.pathname === '/graphql' && request.method === 'POST') {
      return handleGraphQL(request, env)
    }

    // REST API 端点（保持向后兼容）
    if (request.method === 'POST') {
      return handleREST(request, env)
    }

    // GET 请求返回 API 信息
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        service: 'Zed.AI OpenAI Proxy',
        endpoints: {
          rest: '/ (POST)',
          graphql: '/graphql (POST)'
        },
        version: '1.0.0'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    return new Response('Method not allowed', { status: 405 })
  },
}

// GraphQL 处理函数
async function handleGraphQL(request, env) {
  try {
    const body = await request.json()
    const { query, variables } = body

    // 解析 GraphQL 查询
    if (query.includes('chatCompletion')) {
      return await executeGraphQLQuery(variables, env)
    } else if (query.includes('createChatCompletion')) {
      return await executeGraphQLMutation(variables, env)
    } else {
      return new Response(JSON.stringify({
        errors: [{ message: 'Unsupported GraphQL operation' }]
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({
      errors: [{ message: `GraphQL Error: ${error.message}` }]
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

// GraphQL Query 执行
async function executeGraphQLQuery(variables, env) {
  const { messages, model, temperature, maxTokens } = variables
  
  const openaiRequest = {
    model: model || 'gpt-3.5-turbo',
    messages: messages,
    temperature: temperature || 0.7,
    max_tokens: maxTokens || 1000
  }

  const openaiResponse = await callOpenAI(openaiRequest, env)
  
  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text()
    return new Response(JSON.stringify({
      errors: [{ message: `OpenAI API Error: ${errorText}` }]
    }), {
      status: openaiResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  const data = await openaiResponse.json()
  
  // 返回 GraphQL 格式的响应
  return new Response(JSON.stringify({
    data: {
      chatCompletion: {
        id: data.id,
        object: data.object,
        created: data.created,
        model: data.model,
        choices: data.choices,
        usage: data.usage
      }
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

// GraphQL Mutation 执行
async function executeGraphQLMutation(variables, env) {
  const { input } = variables
  
  const openaiRequest = {
    model: input.model || 'gpt-3.5-turbo',
    messages: input.messages,
    temperature: input.temperature || 0.7,
    max_tokens: input.maxTokens || 1000
  }

  const openaiResponse = await callOpenAI(openaiRequest, env)
  
  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text()
    return new Response(JSON.stringify({
      errors: [{ message: `OpenAI API Error: ${errorText}` }]
    }), {
      status: openaiResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  const data = await openaiResponse.json()
  
  // 返回 GraphQL 格式的响应
  return new Response(JSON.stringify({
    data: {
      createChatCompletion: {
        id: data.id,
        choices: data.choices,
        usage: data.usage
      }
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

// REST API 处理函数（原有功能）
async function handleREST(request, env) {
  try {
    const body = await request.json()
    
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid request: messages array required' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const openaiRequest = {
      model: body.model || 'gpt-3.5-turbo',
      messages: body.messages,
      temperature: body.temperature || 0.7,
      max_tokens: body.max_tokens || 1000,
      stream: false
    }

    const openaiResponse = await callOpenAI(openaiRequest, env)

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      return new Response(JSON.stringify({ 
        error: 'OpenAI API request failed',
        status: openaiResponse.status,
        details: errorText
      }), {
        status: openaiResponse.status,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const openaiData = await openaiResponse.json()
    return new Response(JSON.stringify(openaiData), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

// 统一的 OpenAI API 调用函数
async function callOpenAI(requestData, env) {
  return await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestData),
  })
}