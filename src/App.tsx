import React, { useState, useRef, useEffect } from 'react'
import './App.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// GraphQL 查询定义
const CHAT_COMPLETION_QUERY = `
  query ChatCompletion($messages: [MessageInput!]!, $model: String!, $temperature: Float, $maxTokens: Int) {
    chatCompletion(
      messages: $messages
      model: $model
      temperature: $temperature
      maxTokens: $maxTokens
    ) {
      id
      choices {
        message {
          role
          content
        }
      }
    }
  }
`

const CHAT_COMPLETION_MUTATION = `
  mutation CreateChatCompletion($input: ChatCompletionInput!) {
    createChatCompletion(input: $input) {
      id
      choices {
        message {
          role
          content
        }
      }
    }
  }
`

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [useGraphQL, setUseGraphQL] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Worker 端点配置
  const workerEndpoint = import.meta.env?.VITE_WORKER_ENDPOINT || 'https://zed-ai-worker.to-be-herman.workers.dev'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // GraphQL 请求函数
  const makeGraphQLRequest = async (query: string, variables: any) => {
    const response = await fetch(`${workerEndpoint}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables
      })
    })

    if (!response.ok) {
      throw new Error(`GraphQL HTTP error! status: ${response.status}`)
    }

    const result: GraphQLResponse<any> = await response.json()
    
    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL error: ${result.errors.map(e => e.message).join(', ')}`)
    }

    return result.data
  }

  // REST API 请求函数
  const makeRESTRequest = async (allMessages: Message[]) => {
    const response = await fetch(workerEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: allMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: 0.7,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    return await response.json()
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const allMessages = [...messages, userMessage]
      let data: any

      if (useGraphQL) {
        try {
          console.log('🚀 尝试 GraphQL Query...')
          // 首先尝试 GraphQL Query
          const queryVariables = {
            messages: allMessages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            maxTokens: 1000
          }

          const graphqlData = await makeGraphQLRequest(CHAT_COMPLETION_QUERY, queryVariables)
          data = graphqlData.chatCompletion
          console.log('✅ GraphQL Query 成功')

        } catch (queryError) {
          console.warn('⚠️ GraphQL Query 失败，尝试 GraphQL Mutation...', queryError)
          
          try {
            // 尝试 GraphQL Mutation
            const mutationVariables = {
              input: {
                model: 'gpt-3.5-turbo',
                messages: allMessages.map(msg => ({
                  role: msg.role,
                  content: msg.content
                })),
                temperature: 0.7,
                maxTokens: 1000
              }
            }

            const mutationData = await makeGraphQLRequest(CHAT_COMPLETION_MUTATION, mutationVariables)
            data = mutationData.createChatCompletion
            console.log('✅ GraphQL Mutation 成功')

          } catch (mutationError) {
            console.warn('⚠️ GraphQL 失败，回退到 REST API...', mutationError)
            data = await makeRESTRequest(allMessages)
            console.log('✅ REST API 成功')
          }
        }
      } else {
        // 直接使用 REST API
        console.log('🔗 使用 REST API...')
        data = await makeRESTRequest(allMessages)
        console.log('✅ REST API 成功')
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.choices[0]?.message?.content || '抱歉，我没有收到回复',
        timestamp: Date.now()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('❌ API调用失败:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，发生了错误：${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Zed.AI</h1>
        <p>智能对话助手 (Cloudflare Workers + GraphQL)</p>
        <div style={{ marginTop: '10px' }}>
          <label style={{ color: 'white', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={useGraphQL}
              onChange={(e) => setUseGraphQL(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            优先使用 GraphQL
          </label>
        </div>
      </header>

      <main className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome">
              <h2>👋 欢迎使用 Zed.AI</h2>
              <p>支持 GraphQL 和 REST API 的智能对话</p>
              <small>
                🔒 API密钥安全 • ⚡ 全球加速 • 🚀 GraphQL + REST • 💰 几乎免费
              </small>
            </div>
          )}
          
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-avatar">
                {message.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                {message.content}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message assistant">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className="input-wrapper">
            <textarea
              className="input-field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入你的消息... (Enter 发送，Shift+Enter 换行)"
              disabled={isLoading}
              rows={1}
            />
            <button
              className="send-button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              ➤
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App