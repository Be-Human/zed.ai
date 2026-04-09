import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
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

interface APIErrorResponse {
  error?: {
    message: string
    status: number
  }
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

  // GraphQL 请求函数（改进版）
  const makeGraphQLRequest = async (query: string, variables: any) => {
    try {
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
        let errorMessage = `GraphQL HTTP error! status: ${response.status}`
        try {
          const errorData: APIErrorResponse = await response.json()
          if (errorData.error?.message) {
            errorMessage = errorData.error.message
          }
        } catch (parseError) {
          // 如果无法解析错误响应，使用默认错误信息
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result: GraphQLResponse<any> = await response.json()
      
      if (result.errors && result.errors.length > 0) {
        throw new Error(`GraphQL error: ${result.errors.map(e => e.message).join(', ')}`)
      }

      return result.data
    } catch (error) {
      console.error('GraphQL request failed:', error)
      throw error
    }
  }

  // REST API 请求函数（改进版）
  const makeRESTRequest = async (allMessages: Message[]) => {
    try {
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
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData: APIErrorResponse = await response.json()
          if (errorData.error?.message) {
            errorMessage = errorData.error.message
          }
        } catch (parseError) {
          // 如果无法解析错误响应，使用默认错误信息
          const errorText = await response.text()
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      return await response.json()
    } catch (error) {
      console.error('REST API request failed:', error)
      throw error
    }
  }

  // 提取响应内容的辅助函数
  const extractResponseContent = (data: any): string => {
    try {
      // 检查响应数据是否存在
      if (!data) {
        return '抱歉，没有收到有效的响应数据'
      }

      // 检查 choices 数组
      if (!data.choices || !Array.isArray(data.choices)) {
        console.error('Invalid response structure:', data)
        return '抱歉，响应格式不正确'
      }

      if (data.choices.length === 0) {
        return '抱歉，没有收到回复选项'
      }

      // 检查第一个选择的消息
      const firstChoice = data.choices[0]
      if (!firstChoice || !firstChoice.message) {
        console.error('Invalid choice structure:', firstChoice)
        return '抱歉，回复消息格式不正确'
      }

      const content = firstChoice.message.content
      if (!content || typeof content !== 'string') {
        console.error('Invalid message content:', firstChoice.message)
        return '抱歉，没有收到有效的回复内容'
      }

      return content.trim()
    } catch (error) {
      console.error('Error extracting response content:', error)
      return '抱歉，处理回复时发生错误'
    }
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
          console.log('🚀 尝试 GraphQL Mutation...')
          // 优先尝试 GraphQL Mutation（更可靠）
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
          console.warn('⚠️ GraphQL Mutation 失败，尝试 GraphQL Query...', mutationError)
          
          try {
            // 尝试 GraphQL Query
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
            console.warn('⚠️ GraphQL 失败，回退到 REST API...', queryError)
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

      // 使用改进的内容提取函数
      const responseContent = extractResponseContent(data)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('❌ API调用失败:', error)
      
      let errorMessage = '抱歉，发生了错误'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else {
        errorMessage = '未知错误，请稍后重试'
      }
      
      const errorMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${errorMessage}`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMessageObj])
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
                {message.role === 'assistant' ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '')
                        const isInline = !match
                        return !isInline ? (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            className="code-block"
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        )
                      }
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  message.content
                )}
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