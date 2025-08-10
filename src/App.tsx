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
      object
      created
      model
      choices {
        index
        message {
          role
          content
        }
        finishReason
      }
      usage {
        promptTokens
        completionTokens
        totalTokens
      }
    }
  }
`

// GraphQL 变异定义（如果 API 支持）
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
      usage {
        totalTokens
      }
    }
  }
`

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    path?: string[]
  }>
}

interface ChatCompletionData {
  chatCompletion?: {
    choices: Array<{
      message: {
        role: string
        content: string
      }
    }>
  }
  createChatCompletion?: {
    choices: Array<{
      message: {
        role: string
        content: string
      }
    }>
  }
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 获取 API 配置
  const apiKey = import.meta.env?.VITE_OPENAI_API_KEY || ''
  const baseUrl = import.meta.env?.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // GraphQL 请求函数
  const makeGraphQLRequest = async (query: string, variables: any): Promise<ChatCompletionData> => {
    const graphqlEndpoint = `${baseUrl}/graphql`
    
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables
      })
    })

    if (!response.ok) {
      throw new Error(`GraphQL HTTP error! status: ${response.status}`)
    }

    const result: GraphQLResponse<ChatCompletionData> = await response.json()
    
    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL error: ${result.errors.map(e => e.message).join(', ')}`)
    }

    if (!result.data) {
      throw new Error('No data returned from GraphQL API')
    }

    return result.data
  }

  // 备用 REST API 调用
  const makeRESTRequest = async (messages: Message[]): Promise<any> => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: 0.7,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      throw new Error(`REST API error! status: ${response.status}`)
    }

    return await response.json()
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    if (!apiKey) {
      alert('请先配置 OpenAI API Key')
      return
    }

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

      try {
        // 首先尝试 GraphQL 查询
        console.log('🔍 尝试 GraphQL Query...')
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
        data = {
          choices: graphqlData.chatCompletion?.choices || []
        }
        console.log('✅ GraphQL Query 成功')

      } catch (queryError) {
        console.warn('⚠️ GraphQL Query 失败，尝试 GraphQL Mutation...', queryError)
        
        try {
          // 尝试 GraphQL 变异
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
          data = {
            choices: mutationData.createChatCompletion?.choices || []
          }
          console.log('✅ GraphQL Mutation 成功')

        } catch (mutationError) {
          console.warn('⚠️ GraphQL Mutation 也失败，回退到 REST API...', mutationError)
          
          // 如果 GraphQL 都失败，回退到 REST API
          data = await makeRESTRequest(allMessages)
          console.log('✅ REST API 成功')
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.choices[0]?.message?.content || '抱歉，我没有收到回复',
        timestamp: Date.now()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('❌ 所有API调用都失败:', error)
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
        <p>智能对话助手 (GraphQL优先)</p>
      </header>

      <main className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome">
              <h2>👋 欢迎使用 Zed.AI</h2>
              <p>现在优先使用 GraphQL API 进行对话！</p>
              <small>GraphQL → REST API 自动降级</small>
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