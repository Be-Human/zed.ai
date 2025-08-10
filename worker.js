// Cloudflare Worker for OpenAI API Proxy
export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    // 只允许 POST 请求
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    try {
      // 解析请求体
      const body = await request.json()
      
      // 验证请求格式
      if (!body.messages || !Array.isArray(body.messages)) {
        return new Response(
          JSON.stringify({ error: 'Invalid request: messages array required' }),
          { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      // 构建 OpenAI API 请求
      const openaiRequest = {
        model: body.model || 'gpt-3.5-turbo',
        messages: body.messages,
        temperature: body.temperature || 0.7,
        max_tokens: body.max_tokens || 1000,
        stream: false
      }

      // 调用 OpenAI API
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(openaiRequest),
      })

      // 检查响应状态
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        console.error('OpenAI API Error:', errorText)
        
        return new Response(
          JSON.stringify({ 
            error: 'OpenAI API request failed',
            status: openaiResponse.status,
            details: errorText
          }),
          { 
            status: openaiResponse.status,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      }

      // 获取 OpenAI 响应
      const openaiData = await openaiResponse.json()

      // 返回响应，添加 CORS 头
      return new Response(JSON.stringify(openaiData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })

    } catch (error) {
      console.error('Worker Error:', error)
      
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          message: error.message 
        }),
        { 
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }
  },
}