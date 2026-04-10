import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Modal, Button, Input, Card, Space, message } from 'antd';
import { PlayCircleOutlined, SendOutlined, UserOutlined, RobotOutlined } from '@ant-design/icons';
import type { Node, Edge } from 'reactflow';
import { workflowApi } from '../../api';

const { TextArea } = Input;

interface WorkflowPreviewProps {
  visible: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  workflowName: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  nodeName?: string;
  isLoading?: boolean;
}

const WorkflowPreview: React.FC<WorkflowPreviewProps> = ({
  visible,
  onClose,
  nodes,
  edges,
  workflowName,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const contextRef = useRef<Record<string, any>>({});

  // 构建对话历史字符串
  const buildChatHistory = useCallback((msgs: ChatMessage[]): string => {
    return msgs
      .filter(msg => msg.type === 'user' || msg.type === 'assistant')
      .map(msg => {
        const role = msg.type === 'user' ? '用户' : '助手';
        return `${role}: ${msg.content}`;
      })
      .join('\n');
  }, []);

  // 当消息变化时，更新对话历史到 contextRef
  useEffect(() => {
    const chatHistory = buildChatHistory(messages);
    contextRef.current.chat_history = chatHistory;
    console.log('[WorkflowPreview] chat_history updated:', chatHistory);
  }, [messages, buildChatHistory]);

  // 使用 ref 跟踪 isRunning 状态，以便在异步操作中获取最新值
  const isRunningRef = useRef(isRunning);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  // 使用 ref 跟踪上一次的 visible 状态
  const prevVisibleRef = useRef(false);

  // 使用 ref 跟踪组件是否挂载
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 当弹窗打开时，重置状态
  useEffect(() => {
    // 只在从关闭到打开时重置状态，避免 nodes/edges 变化时重置
    if (visible && !prevVisibleRef.current) {
      setMessages([]);
      setInputValue('');
      setIsRunning(false);
      setCurrentNodeId(null);
      contextRef.current = {};
      console.log('[WorkflowPreview] Opened with', nodes.length, 'nodes and', edges.length, 'edges');
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  const getStartNode = useCallback(() => {
    const startNode = nodes.find(n => n.type === 'start');
    console.log('[WorkflowPreview] Nodes:', nodes.length, 'Start node:', startNode?.id);
    return startNode;
  }, [nodes]);

  // 获取普通节点的下一个节点（单出口）
  const getNextNode = useCallback((currentId: string) => {
    const edge = edges.find(e => e.source === currentId);
    if (!edge) return null;
    return nodes.find(n => n.id === edge.target);
  }, [edges, nodes]);

  // 获取条件分支的下一个节点（根据条件索引或默认分支）
  const getConditionNextNode = useCallback((conditionNodeId: string, conditionIndex: number) => {
    // conditionIndex: 0-n 表示第几个条件，-1 表示默认分支
    let edge;
    if (conditionIndex === -1) {
      // 查找默认分支（sourceHandle 为 'default'）
      edge = edges.find(e => e.source === conditionNodeId && e.sourceHandle === 'default');
    } else {
      // 查找对应条件的分支
      const handleId = `cond_${conditionIndex}`;
      edge = edges.find(e => e.source === conditionNodeId && e.sourceHandle === handleId);
    }
    
    // 如果没找到特定 handle 的边，尝试查找没有 sourceHandle 的边（兼容旧数据）
    if (!edge) {
      const allEdges = edges.filter(e => e.source === conditionNodeId);
      if (conditionIndex === -1 && allEdges.length > 0) {
        // 默认分支使用最后一条边
        edge = allEdges[allEdges.length - 1];
      } else if (conditionIndex >= 0 && allEdges[conditionIndex]) {
        edge = allEdges[conditionIndex];
      }
    }
    
    if (!edge) return null;
    return nodes.find(n => n.id === edge?.target);
  }, [edges, nodes]);

  // 评估条件表达式
  const evaluateCondition = useCallback((condition: any, context: Record<string, any>): boolean => {
    const varValue = context[condition.variable];
    const targetValue = condition.value;

    switch (condition.operator) {
      case 'equals': 
        return String(varValue) === String(targetValue);
      case 'notEquals': 
        return String(varValue) !== String(targetValue);
      case 'contains': 
        return String(varValue).includes(targetValue);
      case 'notContains': 
        return !String(varValue).includes(targetValue);
      case 'startsWith': 
        return String(varValue).startsWith(targetValue);
      case 'endsWith': 
        return String(varValue).endsWith(targetValue);
      case 'greaterThan': 
        return Number(varValue) > Number(targetValue);
      case 'lessThan': 
        return Number(varValue) < Number(targetValue);
      case 'greaterThanOrEqual': 
        return Number(varValue) >= Number(targetValue);
      case 'lessThanOrEqual': 
        return Number(varValue) <= Number(targetValue);
      default:
        return false;
    }
  }, []);

  const addMessage = useCallback((type: 'user' | 'assistant' | 'system', content: string, extra?: Partial<ChatMessage>) => {
    const newMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      type,
      content,
      ...extra,
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  const updateMessage = useCallback((msgId: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, ...updates } : m));
  }, []);

  // 执行单个节点，返回下一个节点
  const executeNode = useCallback(async (currentNode: Node): Promise<Node | null> => {
    switch (currentNode.type) {
      case 'input': {
        // 输入节点暂停执行，等待用户输入
        setCurrentNodeId(currentNode.id);
        setIsRunning(false);
        return null;
      }

      case 'llm': {
        // 获取LLM节点配置
        const showOutput = currentNode.data?.showOutput !== false;
        
        // 只有当 showOutput 为 true 时才添加消息到对话界面
        let loadingMsgId: string | null = null;
        if (showOutput) {
          loadingMsgId = addMessage('assistant', '', {
            nodeName: currentNode.data?.label || '大模型',
            isLoading: true,
          });
        }

        try {
          const promptTemplate = currentNode.data?.promptTemplate || '';
          const systemPrompt = currentNode.data?.systemPrompt || '';
          const userInput = contextRef.current.user_input || '';
          const model = currentNode.data?.model || 'Qwen3-32B-FP8';
          const temperature = currentNode.data?.temperature || 0.7;
          
          console.log('[LLM Node] promptTemplate:', promptTemplate);
          console.log('[LLM Node] systemPrompt:', systemPrompt);
          console.log('[LLM Node] userInput:', userInput);
          console.log('[LLM Node] showOutput:', showOutput);
          console.log('[LLM Node] contextRef:', contextRef.current);
          
          // 构建消息列表
          const chatMessages: Array<{role: string; content: string}> = [];
          if (systemPrompt) {
            chatMessages.push({ role: 'system', content: systemPrompt });
          }
          
          // 替换模板中的变量
          const formattedPrompt = promptTemplate.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => {
            const value = contextRef.current[key] || match;
            console.log(`[LLM Node] Replacing {{${key}}} with:`, value);
            return value;
          });
          
          console.log('[LLM Node] formattedPrompt:', formattedPrompt);
          
          // 如果 formattedPrompt 为空或只包含空白字符，使用 userInput
          const finalContent = formattedPrompt?.trim() ? formattedPrompt : userInput;
          console.log('[LLM Node] final user content:', finalContent);
          
          chatMessages.push({ role: 'user', content: finalContent });
          
          console.log('[LLM Node] chatMessages:', chatMessages);
          
          const enableThinking = currentNode.data?.enableThinking !== false;
          
          // 使用流式API实时显示输出
          let fullContent = '';
          let isStreamDone = false;
          
          // 初始化流式内容引用，供输出节点使用
          contextRef.current._llm_streaming_content = '';
          contextRef.current._llm_streaming_done = false;
          contextRef.current._llm_streaming_loading = true;
          
          const stream = workflowApi.chatStream(
            chatMessages,
            (chunk) => {
              console.log('[LLM Node] Received chunk:', chunk);
              if (chunk.error) {
                isStreamDone = true;
                contextRef.current.llm_output = fullContent;
                // 更新流式内容引用
                contextRef.current._llm_streaming_content = fullContent;
                contextRef.current._llm_streaming_done = true;
                contextRef.current._llm_streaming_loading = false;
                // 只有在 showOutput 为 true 时才更新消息
                if (showOutput && loadingMsgId) {
                  updateMessage(loadingMsgId, {
                    content: chunk.content,
                    isLoading: false,
                  });
                }
              } else if (chunk.done) {
                isStreamDone = true;
                contextRef.current.llm_output = fullContent;
                // 更新流式内容引用
                contextRef.current._llm_streaming_content = fullContent;
                contextRef.current._llm_streaming_done = true;
                contextRef.current._llm_streaming_loading = false;
                // 只有在 showOutput 为 true 时才更新消息
                if (showOutput && loadingMsgId) {
                  updateMessage(loadingMsgId, {
                    content: fullContent,
                    isLoading: false,
                  });
                }
              } else {
                fullContent += chunk.content;
                // 实时更新流式内容引用
                contextRef.current._llm_streaming_content = fullContent;
                // 只有在 showOutput 为 true 时才更新消息
                if (showOutput && loadingMsgId) {
                  updateMessage(loadingMsgId, {
                    content: fullContent,
                    isLoading: true,
                  });
                }
              }
            },
            model,
            temperature,
            enableThinking
          );

          // 等待流式响应完成
          await new Promise<void>((resolve) => {
            const checkDone = setInterval(() => {
              if (isStreamDone) {
                clearInterval(checkDone);
                resolve();
              }
            }, 100);
            
            // 超时处理（60秒）
            setTimeout(() => {
              clearInterval(checkDone);
              stream.abort();
              resolve();
            }, 60000);
          });
        } catch (error: any) {
          // 更新流式内容引用为错误状态
          contextRef.current._llm_streaming_done = true;
          contextRef.current._llm_streaming_loading = false;
          // 只有在 showOutput 为 true 时才更新消息
          if (showOutput && loadingMsgId) {
            updateMessage(loadingMsgId, {
              content: `调用模型失败：${error.message || '未知错误'}`,
              isLoading: false,
            });
          }
        }
        return getNextNode(currentNode.id);
      }

      case 'code': {
        const loadingMsgId = addMessage('assistant', '执行代码中...', {
          nodeName: currentNode.data?.label || '代码',
          isLoading: true,
        });

        await new Promise(resolve => setTimeout(resolve, 800));

        const output = '代码执行完成';
        contextRef.current.code_result = output;

        updateMessage(loadingMsgId, {
          content: output,
          isLoading: false,
        });
        return getNextNode(currentNode.id);
      }

      case 'condition': {
        const conditions = currentNode.data?.conditions || [];
        let matchedIndex = -1; // -1 表示默认分支

        // 按顺序评估每个条件
        for (let i = 0; i < conditions.length; i++) {
          const condition = conditions[i];
          if (evaluateCondition(condition, contextRef.current)) {
            matchedIndex = i;
            break;
          }
        }
        
        // 条件分支不显示消息，直接跳转到对应分支
        return getConditionNextNode(currentNode.id, matchedIndex);
      }

      case 'output': {
        const template = currentNode.data?.template || '';
        const outputParam = currentNode.data?.outputParam;
        
        // 获取最终输出内容
        let finalOutput = '';
        if (template) {
          finalOutput = template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => {
            return contextRef.current[key] || match;
          });
        } else if (outputParam) {
          const paramValue = contextRef.current[outputParam];
          finalOutput = typeof paramValue === 'object' 
            ? JSON.stringify(paramValue, null, 2) 
            : String(paramValue || '');
        }
        
        if (!finalOutput) {
          return getNextNode(currentNode.id);
        }
        
        // 创建消息并流式显示
        const msgId = addMessage('assistant', '', {
          nodeName: currentNode.data?.label || '输出',
          isLoading: true,
        });
        
        // 模拟流式输出效果
        await new Promise<void>((resolve) => {
          let currentIndex = 0;
          const chunkSize = 2; // 每次显示2个字符
          const interval = 30; // 每30ms更新一次
          
          const streamInterval = setInterval(() => {
            if (currentIndex >= finalOutput.length) {
              clearInterval(streamInterval);
              updateMessage(msgId, {
                content: finalOutput,
                isLoading: false,
              });
              resolve();
              return;
            }
            
            currentIndex += chunkSize;
            const currentContent = finalOutput.slice(0, currentIndex);
            
            updateMessage(msgId, {
              content: currentContent,
              isLoading: true,
            });
          }, interval);
        });
        
        return getNextNode(currentNode.id);
      }

      case 'end': {
        addMessage('system', '对话结束');
        // 设置 currentNodeId 为 null，表示正常结束
        // 这样 startExecution 中的逻辑可以区分是 input 暂停还是正常结束
        setCurrentNodeId(null);
        return null;
      }

      default:
        return getNextNode(currentNode.id);
    }
  }, [addMessage, updateMessage, getNextNode, getConditionNextNode, evaluateCondition]);

  const startExecution = useCallback(async () => {
    console.log('[WorkflowPreview] startExecution called');
    setMessages([]);
    setIsRunning(true);
    contextRef.current = {};

    const startNode = getStartNode();
    console.log('[WorkflowPreview] Start node:', startNode);
    if (!startNode) {
      if (isMountedRef.current) {
        addMessage('system', '错误：没有找到开始节点，请确保工作流中包含开始节点');
        setIsRunning(false);
        setCurrentNodeId(null);
      }
      return;
    }

    // 检查开始节点是否有连接的边
    const firstEdge = edges.find(e => e.source === startNode.id);
    if (!firstEdge) {
      if (isMountedRef.current) {
        addMessage('system', '错误：开始节点没有连接到其他节点，请添加节点并连接');
        setIsRunning(false);
        setCurrentNodeId(null);
      }
      return;
    }

    let currentNode: Node | null = getNextNode(startNode.id);

    // 如果没有后续节点
    if (!currentNode) {
      if (isMountedRef.current) {
        addMessage('system', '错误：工作流中没有可执行的节点，请添加更多节点');
        setIsRunning(false);
        setCurrentNodeId(null);
      }
      return;
    }

    while (currentNode && isMountedRef.current) {
      setCurrentNodeId(currentNode.id);
      currentNode = await executeNode(currentNode);
    }

    // 注意：如果执行被 input 节点暂停，currentNode 会是 null，但 currentNodeId 不为 null
    // 这时候不应该重置 currentNodeId，因为需要等待用户输入
    if (isMountedRef.current && currentNodeId === null) {
      setIsRunning(false);
    }
  }, [getStartNode, getNextNode, addMessage, executeNode, edges]);

  const handleUserInput = useCallback(async () => {
    if (!inputValue.trim()) {
      message.warning('请输入内容');
      return;
    }

    // 1. 先显示用户输入
    addMessage('user', inputValue);
    contextRef.current.user_input = inputValue;
    console.log('[handleUserInput] user_input set to:', inputValue);
    console.log('[handleUserInput] contextRef:', contextRef.current);
    setInputValue('');
    setIsRunning(true);

    // 2. 继续执行后续节点
    if (currentNodeId) {
      let nextNode = getNextNode(currentNodeId);

      while (nextNode && isMountedRef.current) {
        setCurrentNodeId(nextNode.id);
        nextNode = await executeNode(nextNode);
      }
    }

    // 注意：如果执行被 input 节点暂停，currentNodeId 不为 null
    // 这时候不应该重置 currentNodeId，因为需要等待用户输入
    if (isMountedRef.current && currentNodeId === null) {
      setIsRunning(false);
    }
  }, [inputValue, currentNodeId, getNextNode, addMessage, executeNode]);

  const showInput = !isRunning && currentNodeId !== null;
  const showStartButton = !isRunning && currentNodeId === null && messages.length === 0;
  const showRestartButton = !isRunning && currentNodeId === null && messages.length > 0;

  console.log('[WorkflowPreview] Render - isRunning:', isRunning, 'currentNodeId:', currentNodeId, 'messages.length:', messages.length, 'showStartButton:', showStartButton, 'showRestartButton:', showRestartButton);

  return (
    <Modal
      title={`工作流预览 - ${workflowName}`}
      open={visible}
      onCancel={onClose}
      width={800}
      footer={null}
    >
      <div style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
              <PlayCircleOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
              <p>点击"开始执行"启动工作流预览</p>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  {msg.type !== 'user' && (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: msg.type === 'system' ? '#999' : '#52c41a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '14px',
                    }}>
                      {msg.isLoading ? '...' : (msg.type === 'system' ? 'S' : <RobotOutlined />)}
                    </div>
                  )}

                  <Card
                    size="small"
                    style={{
                      maxWidth: '70%',
                      background: msg.type === 'user' ? '#1890ff' : 'white',
                      color: msg.type === 'user' ? 'white' : 'inherit',
                    }}
                  >
                    {msg.nodeName && msg.type === 'assistant' && (
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        {msg.nodeName}
                      </div>
                    )}
                    <div>{msg.content}</div>
                  </Card>

                  {msg.type === 'user' && (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#1890ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                    }}>
                      <UserOutlined />
                    </div>
                  )}
                </div>
              ))}
            </Space>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {showStartButton && (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                console.log('[WorkflowPreview] 开始执行按钮被点击');
                startExecution();
              }}
              block
            >
              开始执行
            </Button>
          )}

          {showInput && (
            <>
              <TextArea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="请输入..."
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{ flex: 1 }}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    handleUserInput();
                  }
                }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleUserInput}
              >
                发送
              </Button>
            </>
          )}

          {showRestartButton && (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                console.log('[WorkflowPreview] 重新执行按钮被点击');
                startExecution();
              }}
              block
            >
              重新执行
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default WorkflowPreview;
