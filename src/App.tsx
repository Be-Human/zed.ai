import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './App.css'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
}

type ModelType = 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4o'

const MODELS: { value: ModelType; label: string; shortLabel: string }[] = [
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', shortLabel: 'GPT-3.5' },
  { value: 'gpt-4', label: 'GPT-4', shortLabel: 'GPT-4' },
  { value: 'gpt-4o', label: 'GPT-4o', shortLabel: 'GPT-4o' }
]

const getModelShortLabel = (model: string): string => {
  const found = MODELS.find(m => m.value === model)
  return found ? found.shortLabel : model
}

const isValidModel = (model: string): model is ModelType => {
  return MODELS.some(m => m.value === model)
}

const STORAGE_KEY_MODEL = 'zedai-selected-model'
const STORAGE_KEY_SYSTEM_PROMPT = 'zedai-system-prompt'

const getSavedModel = (): ModelType => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_MODEL)
    if (saved && isValidModel(saved)) {
      return saved
    }
  } catch (e) {
    console.warn('Failed to read model from localStorage:', e)
  }
  return 'gpt-3.5-turbo'
}

const saveModelToStorage = (model: ModelType) => {
  try {
    localStorage.setItem(STORAGE_KEY_MODEL, model)
  } catch (e) {
    console.warn('Failed to save model to localStorage:', e)
  }
}

const getSavedSystemPrompt = (): string => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SYSTEM_PROMPT)
    if (saved) {
      return saved
    }
  } catch (e) {
    console.warn('Failed to read system prompt from localStorage:', e)
  }
  return ''
}

const saveSystemPromptToStorage = (prompt: string) => {
  try {
    localStorage.setItem(STORAGE_KEY_SYSTEM_PROMPT, prompt)
  } catch (e) {
    console.warn('Failed to save system prompt to localStorage:', e)
  }
}

interface CodeBlockProps {
  language: string
  children: string
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, children }) => {
  const [isCopied, setIsCopied] = useState(false)

  const languageDisplayNames: Record<string, string> = {
    js: 'JavaScript',
    javascript: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    py: 'Python',
    python: 'Python',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    md: 'Markdown',
    markdown: 'Markdown',
    sh: 'Shell',
    shell: 'Shell',
    bash: 'Bash',
    go: 'Go',
    golang: 'Go',
    rust: 'Rust',
    rs: 'Rust',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    cs: 'C#',
    php: 'PHP',
    ruby: 'Ruby',
    swift: 'Swift',
    kotlin: 'Kotlin',
    dart: 'Dart',
    yaml: 'YAML',
    yml: 'YAML',
    xml: 'XML',
    sql: 'SQL',
    graphql: 'GraphQL',
    gql: 'GraphQL',
  }

  const displayLanguage = languageDisplayNames[language.toLowerCase()] || language

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children)
      setIsCopied(true)
      setTimeout(() => {
        setIsCopied(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-language">{displayLanguage}</span>
        <button
          className={`code-copy-button ${isCopied ? 'copied' : ''}`}
          onClick={handleCopy}
          title="复制代码"
        >
          {isCopied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        className="code-block"
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFormat, setExportFormat] = useState<'md' | 'txt'>('md')
  const [exportPlainText, setExportPlainText] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ModelType>(getSavedModel)
  const [systemPrompt, setSystemPrompt] = useState<string>(getSavedSystemPrompt)
  const [isSystemPromptExpanded, setIsSystemPromptExpanded] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      setTimeout(() => {
        setCopiedMessageId(null)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleRegenerate = async (messageId: string) => {
    if (isLoading) return

    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') return

    const userMessageIndex = messageIndex - 1
    if (userMessageIndex < 0 || messages[userMessageIndex].role !== 'user') return

    const messagesToKeep = messages.slice(0, messageIndex)
    setMessages(messagesToKeep)

    setIsLoading(true)

    try {
      let allMessages: Message[] = messagesToKeep
      
      if (systemPrompt.trim()) {
        const systemMessage: Message = {
          id: `system-${Date.now()}`,
          role: 'system',
          content: systemPrompt.trim(),
          timestamp: Date.now()
        }
        allMessages = [systemMessage, ...allMessages]
      }
      
      let data: any

      if (useGraphQL) {
        try {
          console.log('🚀 尝试 GraphQL Mutation...')
          const mutationVariables = {
            input: {
              model: selectedModel,
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
            const queryVariables = {
              messages: allMessages.map(msg => ({
                role: msg.role,
                content: msg.content
              })),
              model: selectedModel,
              temperature: 0.7,
              maxTokens: 1000
            }

            const graphqlData = await makeGraphQLRequest(CHAT_COMPLETION_QUERY, queryVariables)
            data = graphqlData.chatCompletion
            console.log('✅ GraphQL Query 成功')

          } catch (queryError) {
            console.warn('⚠️ GraphQL 失败，回退到 REST API...', queryError)
            data = await makeRESTRequest(allMessages, selectedModel)
            console.log('✅ REST API 成功')
          }
        }
      } else {
        console.log('🔗 使用 REST API...')
        data = await makeRESTRequest(allMessages, selectedModel)
        console.log('✅ REST API 成功')
      }

      const responseContent = extractResponseContent(data)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now(),
        model: selectedModel
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
        timestamp: Date.now(),
        model: selectedModel
      }
      setMessages(prev => [...prev, errorMessageObj])
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartEdit = (messageId: string, content: string) => {
    if (isLoading) return
    setEditingMessageId(messageId)
    setEditingContent(content)
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditingContent('')
  }

  const handleConfirmEdit = async (messageId: string) => {
    if (isLoading || !editingContent.trim()) return

    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1 || messages[messageIndex].role !== 'user') return

    const messagesToKeep = messages.slice(0, messageIndex)
    const updatedUserMessage: Message = {
      ...messages[messageIndex],
      content: editingContent.trim()
    }

    setEditingMessageId(null)
    setEditingContent('')
    setMessages([...messagesToKeep, updatedUserMessage])
    setIsLoading(true)

    try {
      let allMessages: Message[] = [...messagesToKeep, updatedUserMessage]
      
      if (systemPrompt.trim()) {
        const systemMessage: Message = {
          id: `system-${Date.now()}`,
          role: 'system',
          content: systemPrompt.trim(),
          timestamp: Date.now()
        }
        allMessages = [systemMessage, ...allMessages]
      }
      
      let data: any

      if (useGraphQL) {
        try {
          console.log('🚀 尝试 GraphQL Mutation...')
          const mutationVariables = {
            input: {
              model: selectedModel,
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
            const queryVariables = {
              messages: allMessages.map(msg => ({
                role: msg.role,
                content: msg.content
              })),
              model: selectedModel,
              temperature: 0.7,
              maxTokens: 1000
            }

            const graphqlData = await makeGraphQLRequest(CHAT_COMPLETION_QUERY, queryVariables)
            data = graphqlData.chatCompletion
            console.log('✅ GraphQL Query 成功')

          } catch (queryError) {
            console.warn('⚠️ GraphQL 失败，回退到 REST API...', queryError)
            data = await makeRESTRequest(allMessages, selectedModel)
            console.log('✅ REST API 成功')
          }
        }
      } else {
        console.log('🔗 使用 REST API...')
        data = await makeRESTRequest(allMessages, selectedModel)
        console.log('✅ REST API 成功')
      }

      const responseContent = extractResponseContent(data)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now(),
        model: selectedModel
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
        timestamp: Date.now(),
        model: selectedModel
      }
      setMessages(prev => [...prev, errorMessageObj])
    } finally {
      setIsLoading(false)
    }
  }

  // Worker 端点配置
  const workerEndpoint = import.meta.env?.VITE_WORKER_ENDPOINT || 'https://zed-ai-worker.to-be-herman.workers.dev'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    autoResize()
  }, [input])

  useEffect(() => {
    saveModelToStorage(selectedModel)
  }, [selectedModel])

  useEffect(() => {
    saveSystemPromptToStorage(systemPrompt)
  }, [systemPrompt])

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
  const makeRESTRequest = async (allMessages: Message[], model: string) => {
    try {
      const response = await fetch(workerEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
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
      let allMessages: Message[] = [...messages, userMessage]
      
      if (systemPrompt.trim()) {
        const systemMessage: Message = {
          id: `system-${Date.now()}`,
          role: 'system',
          content: systemPrompt.trim(),
          timestamp: Date.now()
        }
        allMessages = [systemMessage, ...allMessages]
      }
      
      let data: any

      if (useGraphQL) {
        try {
          console.log('🚀 尝试 GraphQL Mutation...')
          // 优先尝试 GraphQL Mutation（更可靠）
          const mutationVariables = {
            input: {
              model: selectedModel,
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
              model: selectedModel,
              temperature: 0.7,
              maxTokens: 1000
            }

            const graphqlData = await makeGraphQLRequest(CHAT_COMPLETION_QUERY, queryVariables)
            data = graphqlData.chatCompletion
            console.log('✅ GraphQL Query 成功')

          } catch (queryError) {
            console.warn('⚠️ GraphQL 失败，回退到 REST API...', queryError)
            data = await makeRESTRequest(allMessages, selectedModel)
            console.log('✅ REST API 成功')
          }
        }
      } else {
        // 直接使用 REST API
        console.log('🔗 使用 REST API...')
        data = await makeRESTRequest(allMessages, selectedModel)
        console.log('✅ REST API 成功')
      }

      // 使用改进的内容提取函数
      const responseContent = extractResponseContent(data)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now(),
        model: selectedModel
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
        timestamp: Date.now(),
        model: selectedModel
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

  const clearChat = () => {
    if (messages.length === 0 && input.trim() === '') return
    
    if (window.confirm('确定要清空所有对话记录吗？此操作不可撤销。')) {
      setMessages([])
      setInput('')
    }
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  const formatMessageTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    
    if (diffSeconds < 60) {
      return '刚刚'
    }
    
    if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`
    }
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    if (messageDate.getTime() === today.getTime()) {
      return `${hours}:${minutes}`
    }
    
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (messageDate.getTime() === yesterday.getTime()) {
      return `昨天 ${hours}:${minutes}`
    }
    
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    if (date.getFullYear() === now.getFullYear()) {
      return `${month}-${day} ${hours}:${minutes}`
    }
    
    const year = date.getFullYear()
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  const removeMarkdownFormatting = (text: string): string => {
    let result = text
    
    result = result.replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    
    result = result.replace(/\*\*(.*?)\*\*/g, '$1')
    
    result = result.replace(/\*(.*?)\*/g, '$1')
    
    result = result.replace(/___(.*?)___/g, '$1')
    
    result = result.replace(/__(.*?)__/g, '$1')
    
    result = result.replace(/_(.*?)_/g, '$1')
    
    result = result.replace(/`([^`]+)`/g, '$1')
    
    result = result.replace(/```[\s\S]*?```/g, (match) => {
      const codeContent = match.replace(/```\w*\n?([\s\S]*?)\n?```/g, '$1')
      return codeContent.trim()
    })
    
    result = result.replace(/^#+\s+(.*)$/gm, '$1')
    
    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    
    result = result.replace(/^---+$/gm, '')
    
    result = result.replace(/^>\s+(.*)$/gm, '$1')
    
    result = result.replace(/^\s*[-*+]\s+/gm, '• ')
    
    result = result.replace(/^\s*(\d+)\.\s+/gm, '$1. ')
    
    result = result.replace(/\n{3,}/g, '\n\n')
    
    return result.trim()
  }

  const exportChat = () => {
    if (messages.length === 0) {
      alert('没有对话记录可导出')
      return
    }
    setShowExportModal(true)
  }

  const performExport = () => {
    let content = ''
    
    if (exportFormat === 'md') {
      content += '# Zed.AI 对话记录\n\n'
      content += `导出时间: ${formatDate(Date.now())}\n`
      content += `消息总数: ${messages.length}\n\n`
      content += '---\n\n'

      messages.forEach((message) => {
        const role = message.role === 'user' ? '用户' : 'AI助手'
        const messageContent = exportPlainText 
          ? removeMarkdownFormatting(message.content) 
          : message.content
        
        content += `**${role}** (${formatDate(message.timestamp)})\n\n`
        content += `${messageContent}\n\n`
        content += '---\n\n'
      })
    } else {
      content += 'Zed.AI 对话记录\n'
      content += '================\n\n'
      content += `导出时间: ${formatDate(Date.now())}\n`
      content += `消息总数: ${messages.length}\n\n`
      content += '----------------\n\n'

      messages.forEach((message) => {
        const role = message.role === 'user' ? '【用户】' : '【AI助手】'
        const messageContent = exportPlainText 
          ? removeMarkdownFormatting(message.content) 
          : message.content
        
        content += `${role} (${formatDate(message.timestamp)})\n\n`
        content += `${messageContent}\n\n`
        content += '----------------\n\n'
      })
    }

    const mimeType = exportFormat === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zedai-chat-${new Date().toISOString().slice(0, 10)}.${exportFormat}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    setShowExportModal(false)
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Zed.AI</h1>
        <p>智能对话助手 (Cloudflare Workers + GraphQL)</p>
        <div className="header-controls">
          <div className="model-selector">
            <label htmlFor="model-select" className="model-label">模型：</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as ModelType)}
              className="model-select"
              disabled={isLoading}
            >
              {MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>
          <label className="graphql-toggle">
            <input
              type="checkbox"
              checked={useGraphQL}
              onChange={(e) => setUseGraphQL(e.target.checked)}
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
            <div 
              key={message.id} 
              className={`message ${message.role}`}
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
            >
              <div className="message-avatar">
                {message.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-wrapper">
                {message.role === 'assistant' ? (
                  <div 
                    className="message-content"
                    style={{ 
                      position: 'relative',
                      paddingRight: '80px'
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '')
                          const isInline = !match
                          return !isInline ? (
                            <CodeBlock language={match[1]}>
                              {String(children).replace(/\n$/, '')}
                            </CodeBlock>
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
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      {copiedMessageId === message.id && (
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#4ade80',
                            fontWeight: '500',
                            animation: 'fadeIn 0.3s ease-in-out'
                          }}
                        >
                          已复制✓
                        </span>
                      )}
                      <button
                        onClick={() => copyToClipboard(message.content, message.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: (hoveredMessageId === message.id || copiedMessageId === message.id) ? 1 : 0,
                          transition: 'opacity 0.2s ease-in-out, background-color 0.2s ease-in-out',
                          color: '#9ca3af',
                          fontSize: '14px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="复制消息"
                      >
                        📋
                      </button>
                      <button
                        onClick={() => handleRegenerate(message.id)}
                        disabled={isLoading}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: (hoveredMessageId === message.id || copiedMessageId === message.id) ? 1 : 0,
                          transition: 'opacity 0.2s ease-in-out, background-color 0.2s ease-in-out',
                          color: '#9ca3af',
                          fontSize: '14px'
                        }}
                        onMouseEnter={(e) => {
                          if (!isLoading) {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="重新生成"
                      >
                        🔄
                      </button>
                    </div>
                  </div>
                ) : (
                  editingMessageId === message.id ? (
                    <div className="message-content" style={{ padding: '0.875rem' }}>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '80px',
                          padding: '0.75rem',
                          border: '2px solid #667eea',
                          borderRadius: '12px',
                          fontSize: '1rem',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          outline: 'none',
                          background: 'white',
                          color: '#333'
                        }}
                        autoFocus
                      />
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '8px',
                        justifyContent: 'flex-end'
                      }}>
                        <button
                          onClick={handleCancelEdit}
                          style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '8px',
                            background: '#e9ecef',
                            color: '#666',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#dee2e6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#e9ecef';
                          }}
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleConfirmEdit(message.id)}
                          disabled={!editingContent.trim()}
                          style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '8px',
                            background: editingContent.trim() ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#ccc',
                            color: 'white',
                            fontSize: '0.9rem',
                            cursor: editingContent.trim() ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (editingContent.trim()) {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          确认
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="message-content"
                      style={{ 
                        position: 'relative',
                        paddingRight: '80px'
                      }}
                    >
                      {message.content}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {copiedMessageId === message.id && (
                          <span
                            style={{
                              fontSize: '12px',
                              color: '#4ade80',
                              fontWeight: '500',
                              animation: 'fadeIn 0.3s ease-in-out'
                            }}
                          >
                            已复制✓
                          </span>
                        )}
                        <button
                          onClick={() => copyToClipboard(message.content, message.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: (hoveredMessageId === message.id || copiedMessageId === message.id) ? 1 : 0,
                            transition: 'opacity 0.2s ease-in-out, background-color 0.2s ease-in-out',
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontSize: '14px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          title="复制消息"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => handleStartEdit(message.id, message.content)}
                          disabled={isLoading}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: (hoveredMessageId === message.id || copiedMessageId === message.id) ? 1 : 0,
                            transition: 'opacity 0.2s ease-in-out, background-color 0.2s ease-in-out',
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontSize: '14px'
                          }}
                          onMouseEnter={(e) => {
                            if (!isLoading) {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          title="编辑消息"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                  )
                )}
                <div className="message-meta">
                  {message.role === 'assistant' && message.model && (
                    <span className="model-badge">
                      {getModelShortLabel(message.model)}
                    </span>
                  )}
                  <span className="message-time">
                    {formatMessageTime(message.timestamp)}
                  </span>
                </div>
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
          <div className="system-prompt-section">
            <button
              className="system-prompt-toggle"
              onClick={() => setIsSystemPromptExpanded(!isSystemPromptExpanded)}
              disabled={isLoading}
            >
              <span className="toggle-icon">{isSystemPromptExpanded ? '▼' : '▶'}</span>
              <span className="toggle-text">System Prompt {systemPrompt.trim() ? '(已设置)' : ''}</span>
            </button>
            {isSystemPromptExpanded && (
              <div className="system-prompt-content">
                <textarea
                  className="system-prompt-input"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="输入自定义系统提示词... 这将作为 system 角色的消息发送给 AI。"
                  disabled={isLoading}
                  rows={4}
                />
                <div className="system-prompt-hint">
                  <small>提示：系统提示词会影响 AI 的整体行为和回复风格。</small>
                </div>
              </div>
            )}
          </div>
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              className="input-field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入你的消息... (Enter 发送，Shift+Enter 换行)"
              disabled={isLoading}
              rows={1}
            />
            <button
              className="clear-button"
              onClick={clearChat}
              disabled={isLoading || (messages.length === 0 && input.trim() === '')}
              title="清空对话"
            >
              🗑️
            </button>
            <button
              className="export-button"
              onClick={exportChat}
              disabled={isLoading || messages.length === 0}
              title="导出对话记录"
            >
              📥
            </button>
            <button
              className="send-button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              ➤
            </button>
          </div>
        </div>

        {showExportModal && (
          <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>导出选项</h3>
              
              <div className="export-section">
                <label className="section-label">文件格式：</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="format"
                      value="md"
                      checked={exportFormat === 'md'}
                      onChange={() => setExportFormat('md')}
                    />
                    <span>Markdown (.md)</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="format"
                      value="txt"
                      checked={exportFormat === 'txt'}
                      onChange={() => setExportFormat('txt')}
                    />
                    <span>纯文本 (.txt)</span>
                  </label>
                </div>
              </div>

              <div className="export-section">
                <label className="section-label">内容格式：</label>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportPlainText}
                      onChange={(e) => setExportPlainText(e.target.checked)}
                    />
                    <span>去除 Markdown 格式符号（导出纯文字）</span>
                  </label>
                </div>
              </div>

              <div className="modal-buttons">
                <button
                  className="modal-button cancel"
                  onClick={() => setShowExportModal(false)}
                >
                  取消
                </button>
                <button
                  className="modal-button confirm"
                  onClick={performExport}
                >
                  导出
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App