import { useState, useCallback, useRef, useEffect, type FC } from 'react';
import { Drawer, Button, Input, Card, Space, message, Progress, Badge, Typography, Divider } from 'antd';
import {
  PlayCircleOutlined,
  SendOutlined,
  UserOutlined,
  RobotOutlined,
  PauseOutlined,
  StepForwardOutlined,
  ReloadOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import type { Node, Edge } from 'reactflow';
import { workflowApi } from '../../api';

const { TextArea } = Input;
const { Text } = Typography;

// API 基础 URL
const API_BASE_URL = (import.meta as ImportMeta).env.VITE_BACKEND_URL || 'http://localhost:8001';

// 节点执行状态
export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'failed';

// 执行日志
interface ExecutionLog {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: NodeExecutionStatus;
  message: string;
  timestamp: number;
  duration?: number;
  error?: string;
}

// 节点执行数据
interface NodeExecutionData {
  input: Record<string, any>;
  output: Record<string, any>;
  duration: number;
  status: NodeExecutionStatus;
  error?: string;
}

interface WorkflowPreviewProps {
  visible: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  workflowName: string;
  // 运行模式相关
  isRunningMode: boolean;
  onRunningModeChange: (isRunning: boolean) => void;
  // 节点状态回调
  onNodeStatusChange?: (nodeId: string, status: NodeExecutionStatus) => void;
  onNodeClick?: (nodeId: string) => void;
  // 当前选中的节点（用于显示详情）
  selectedNodeId?: string | null;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  nodeName?: string;
  isLoading?: boolean;
}

const WorkflowPreview: FC<WorkflowPreviewProps> = ({
  visible,
  onClose,
  nodes,
  edges,
  workflowName,
  isRunningMode,
  onRunningModeChange,
  onNodeStatusChange,
  onNodeClick,
  selectedNodeId,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const contextRef = useRef<Record<string, any>>({});

  // 执行日志和进度
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [executionData, setExecutionData] = useState<Record<string, NodeExecutionData>>({});
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // 调试模式
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const breakpointsRef = useRef<Set<string>>(new Set());
  const pauseRef = useRef(false);
  const stepNextRef = useRef(false);

  // 用于强制刷新日志显示
  const [, forceUpdate] = useState({});

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
  }, [messages, buildChatHistory]);

  // 使用 ref 跟踪 isRunning 状态
  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  // 使用 ref 跟踪上一次的 visible 状态
  const prevVisibleRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // 同步暂停状态到 ref
  useEffect(() => { pauseRef.current = isPaused; }, [isPaused]);

  // 当 Drawer 打开时，重置状态
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setMessages([]);
      setInputValue('');
      setIsRunning(false);
      setCurrentNodeId(null);
      setExecutionLogs([]);
      setExecutionData({});
      setCompletedCount(0);
      setTotalCount(0);
      setIsPaused(false);
      setIsDebugMode(false);
      pauseRef.current = false;
      stepNextRef.current = false;
      contextRef.current = {};
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  // 计算可执行节点总数（排除 start 和 end）
  const getExecutableNodeCount = useCallback(() => {
    return nodes.filter(n => n.type !== 'start' && n.type !== 'end').length;
  }, [nodes]);

  const getStartNode = useCallback((): Node | undefined => {
    return nodes.find(n => n.type === 'start');
  }, [nodes]);

  const getNextNode = useCallback((currentId: string): Node | null => {
    const edge = edges.find(e => e.source === currentId);
    if (!edge) return null;
    return nodes.find(n => n.id === edge.target) || null;
  }, [edges, nodes]);

  const getConditionNextNode = useCallback((conditionNodeId: string, conditionIndex: number): Node | null => {
    let edge;
    if (conditionIndex === -1) {
      edge = edges.find(e => e.source === conditionNodeId && e.sourceHandle === 'default');
    } else {
      const handleId = `cond_${conditionIndex}`;
      edge = edges.find(e => e.source === conditionNodeId && e.sourceHandle === handleId);
    }
    if (!edge) {
      const allEdges = edges.filter(e => e.source === conditionNodeId);
      if (conditionIndex === -1 && allEdges.length > 0) {
        edge = allEdges[allEdges.length - 1];
      } else if (conditionIndex >= 0 && allEdges[conditionIndex]) {
        edge = allEdges[conditionIndex];
      }
    }
    if (!edge) return null;
    return nodes.find(n => n.id === edge?.target) || null;
  }, [edges, nodes]);

  const evaluateCondition = useCallback((condition: any, context: Record<string, any>): boolean => {
    const varValue = context[condition.variable];
    const targetValue = condition.value;
    switch (condition.operator) {
      case 'equals': return String(varValue) === String(targetValue);
      case 'notEquals': return String(varValue) !== String(targetValue);
      case 'contains': return String(varValue).includes(targetValue);
      case 'notContains': return !String(varValue).includes(targetValue);
      case 'startsWith': return String(varValue).startsWith(targetValue);
      case 'endsWith': return String(varValue).endsWith(targetValue);
      case 'greaterThan': return Number(varValue) > Number(targetValue);
      case 'lessThan': return Number(varValue) < Number(targetValue);
      case 'greaterThanOrEqual': return Number(varValue) >= Number(targetValue);
      case 'lessThanOrEqual': return Number(varValue) <= Number(targetValue);
      default: return false;
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

  // 添加执行日志
  const addExecutionLog = useCallback((nodeId: string, nodeName: string, nodeType: string, status: NodeExecutionStatus, message: string, duration?: number, error?: string) => {
    const log: ExecutionLog = {
      id: `log_${Date.now()}_${Math.random()}`,
      nodeId,
      nodeName,
      nodeType,
      status,
      message,
      timestamp: Date.now(),
      duration,
      error,
    };
    setExecutionLogs(prev => [...prev, log]);
    forceUpdate({});
  }, []);

  // 更新节点执行数据
  const updateNodeExecutionData = useCallback((nodeId: string, data: Partial<NodeExecutionData>) => {
    setExecutionData(prev => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], ...data } as NodeExecutionData,
    }));
  }, []);

  // 等待暂停恢复
  const waitForResume = useCallback(async (): Promise<void> => {
    if (!pauseRef.current && !stepNextRef.current) return;
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!pauseRef.current || stepNextRef.current) {
          clearInterval(check);
          stepNextRef.current = false;
          resolve();
        }
      }, 100);
    });
  }, []);

  // 执行单个节点
  const executeNode = useCallback(async (currentNode: Node): Promise<Node | null> => {
    const nodeStartTime = Date.now();

    // 检查断点
    if (breakpointsRef.current.has(currentNode.id) && isDebugMode) {
      setIsPaused(true);
      pauseRef.current = true;
      addExecutionLog(currentNode.id, currentNode.data?.label || currentNode.type || '未知', currentNode.type || 'unknown', 'running', '遇到断点，暂停执行');
      await waitForResume();
    }

    // 更新节点状态为运行中
    onNodeStatusChange?.(currentNode.id, 'running');
    setCurrentNodeId(currentNode.id);

    // 记录输入数据
    const nodeInput = { ...contextRef.current };
    updateNodeExecutionData(currentNode.id, { input: nodeInput, status: 'running' });

    switch (currentNode.type) {
      case 'input': {
        setIsRunning(false);
        onRunningModeChange(false);
        onNodeStatusChange?.(currentNode.id, 'success');
        updateNodeExecutionData(currentNode.id, {
          output: { user_input: contextRef.current.user_input },
          status: 'success',
          duration: Date.now() - nodeStartTime,
        });
        addExecutionLog(currentNode.id, currentNode.data?.label || '输入', 'input', 'success', '等待用户输入');
        return null;
      }

      case 'llm': {
        const showOutput = currentNode.data?.showOutput !== false;
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

          const chatMessages: Array<{role: string; content: string}> = [];
          if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });

          const formattedPrompt = promptTemplate.replace(/\{\{([\w_]+)\}\}/g, (match: string, key: string) => {
            const value = contextRef.current[key];
            return value !== undefined && value !== null ? String(value) : match;
          });

          const finalContent = formattedPrompt?.trim() ? formattedPrompt : userInput;
          chatMessages.push({ role: 'user', content: finalContent });

          const enableThinking = currentNode.data?.enableThinking !== false;

          let fullContent = '';
          let isStreamDone = false;

          contextRef.current._llm_streaming_content = '';
          contextRef.current._llm_streaming_done = false;
          contextRef.current._llm_streaming_loading = true;

          const stream = workflowApi.chatStream(
            chatMessages,
            (chunk) => {
              if (chunk.error) {
                isStreamDone = true;
                contextRef.current.llm_output = fullContent;
                contextRef.current._llm_streaming_content = fullContent;
                contextRef.current._llm_streaming_done = true;
                contextRef.current._llm_streaming_loading = false;
                if (showOutput && loadingMsgId) {
                  updateMessage(loadingMsgId, { content: chunk.content, isLoading: false });
                }
              } else if (chunk.done) {
                isStreamDone = true;
                contextRef.current.llm_output = fullContent;
                contextRef.current._llm_streaming_content = fullContent;
                contextRef.current._llm_streaming_done = true;
                contextRef.current._llm_streaming_loading = false;
                if (showOutput && loadingMsgId) {
                  updateMessage(loadingMsgId, { content: fullContent, isLoading: false });
                }
              } else {
                fullContent += chunk.content;
                contextRef.current._llm_streaming_content = fullContent;
                if (showOutput && loadingMsgId) {
                  updateMessage(loadingMsgId, { content: fullContent, isLoading: true });
                }
              }
            },
            model,
            temperature,
            enableThinking
          );

          await new Promise<void>((resolve) => {
            const checkDone = setInterval(() => {
              if (isStreamDone) { clearInterval(checkDone); resolve(); }
            }, 100);
            setTimeout(() => { clearInterval(checkDone); stream.abort(); resolve(); }, 60000);
          });

          const duration = Date.now() - nodeStartTime;
          onNodeStatusChange?.(currentNode.id, 'success');
          updateNodeExecutionData(currentNode.id, {
            output: { llm_output: fullContent },
            status: 'success',
            duration,
          });
          addExecutionLog(currentNode.id, currentNode.data?.label || '大模型', 'llm', 'success', `生成完成 (${fullContent.length} 字符)`, duration);
          setCompletedCount(prev => prev + 1);
        } catch (error: any) {
          contextRef.current._llm_streaming_done = true;
          contextRef.current._llm_streaming_loading = false;
          const duration = Date.now() - nodeStartTime;
          onNodeStatusChange?.(currentNode.id, 'failed');
          updateNodeExecutionData(currentNode.id, {
            status: 'failed',
            duration,
            error: error.message,
          });
          addExecutionLog(currentNode.id, currentNode.data?.label || '大模型', 'llm', 'failed', `调用失败: ${error.message}`, duration, error.message);
          if (showOutput && loadingMsgId) {
            updateMessage(loadingMsgId, {
              content: `调用模型失败：${error.message || '未知错误'}`,
              isLoading: false,
            });
          }
        }
        return getNextNode(currentNode.id);
      }

      case 'rag': {
        const showOutput = currentNode.data?.showOutput !== false;
        const kbId = currentNode.data?.kbId;
        const userQuestionVar = currentNode.data?.userQuestionVar || 'user_input';
        const outputVar = currentNode.data?.outputVar || 'retrieved_result';

        let loadingMsgId: string | null = null;
        if (showOutput) {
          loadingMsgId = addMessage('assistant', '', {
            nodeName: currentNode.data?.label || '知识库检索',
            isLoading: true,
          });
        }

        try {
          const userQuestion = contextRef.current[userQuestionVar] || contextRef.current.user_input || '';
          if (!kbId) throw new Error('未配置检索知识库');
          if (!userQuestion.trim()) throw new Error('用户问题为空，无法执行检索');

          const recallResult: any = await new Promise((resolve, reject) => {
            fetch(`${API_BASE_URL}/api/kb/${kbId}/recall`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: userQuestion,
                retrieval_mode: currentNode.data?.retrievalMode || 'hybrid',
                top_k: currentNode.data?.topK ?? 6,
                candidate_k: currentNode.data?.candidateK ?? 20,
                dense_weight: currentNode.data?.denseWeight ?? 0.5,
                sparse_weight: currentNode.data?.sparseWeight ?? 0.5,
                min_score: currentNode.data?.minScore ?? 0.6,
                enable_rerank: currentNode.data?.enableRerank ?? false,
                max_chars: currentNode.data?.maxChars ?? 15000,
              }),
            })
              .then(res => res.json())
              .then(data => { if (data.detail) reject(new Error(data.detail)); else resolve(data); })
              .catch(reject);
          });

          const items = recallResult.items || [];
          const retrievedText = items
            .map((item: any) => item.content?.trim())
            .filter(Boolean)
            .join('\n\n');

          contextRef.current[outputVar] = retrievedText;
          contextRef.current._rag_raw = {
            query: userQuestion,
            kb_id: kbId,
            items,
            total: recallResult.total || items.length,
            avg_similarity: recallResult.avg_similarity,
          };

          const duration = Date.now() - nodeStartTime;
          onNodeStatusChange?.(currentNode.id, 'success');
          updateNodeExecutionData(currentNode.id, {
            output: { [outputVar]: retrievedText, items_count: items.length },
            status: 'success',
            duration,
          });
          addExecutionLog(currentNode.id, currentNode.data?.label || '知识库检索', 'rag', 'success', `检索到 ${items.length} 条结果`, duration);
          setCompletedCount(prev => prev + 1);

          if (showOutput && loadingMsgId) {
            const sources = [...new Set(items.map((item: any) => item.source).filter(Boolean))];
            const outputContent = [
              `<strong>【知识库检索】</strong>从 ${sources.join(', ') || '知识库'} 找到 ${items.length} 条相关内容`,
              ``,
              retrievedText.slice(0, 2000) + (retrievedText.length > 2000 ? '\n\n...(内容已截断)' : '')
            ].join('\n');
            updateMessage(loadingMsgId, { content: outputContent, isLoading: false });
          }
        } catch (error: any) {
          const duration = Date.now() - nodeStartTime;
          contextRef.current[outputVar] = '';
          contextRef.current._rag_raw = { error: error.message };
          onNodeStatusChange?.(currentNode.id, 'failed');
          updateNodeExecutionData(currentNode.id, {
            status: 'failed',
            duration,
            error: error.message,
          });
          addExecutionLog(currentNode.id, currentNode.data?.label || '知识库检索', 'rag', 'failed', `检索失败: ${error.message}`, duration, error.message);
          if (showOutput && loadingMsgId) {
            updateMessage(loadingMsgId, { content: `【知识库检索】检索失败：${error.message}`, isLoading: false });
          }
        }
        return getNextNode(currentNode.id);
      }

      case 'code': {
        const showOutput = currentNode.data?.showOutput === true;
        const codeContent = currentNode.data?.code || '';
        const inputVars = currentNode.data?.inputVars || [];
        const outputVars = currentNode.data?.outputVars || [];
        const language = currentNode.data?.language || 'python';

        let loadingMsgId: string | null = null;
        if (showOutput) {
          loadingMsgId = addMessage('assistant', '执行代码中...', {
            nodeName: currentNode.data?.label || '代码',
            isLoading: true,
          });
        }

        try {
          const execParams: Record<string, any> = {};
          inputVars.forEach((varConfig: any) => {
            const varName = varConfig.customName || varConfig.name;
            const sourceType = varConfig.sourceType || '输入';
            if (!varName) return;
            if (sourceType === '引用') {
              const refParamId = varConfig.referencedParamId;
              execParams[varName] = refParamId ? contextRef.current[refParamId] : undefined;
            } else {
              execParams[varName] = contextRef.current[varName] ?? contextRef.current.user_input ?? '';
            }
          });

          let codeResult: any;
          const primaryOutputName = outputVars?.[0]?.name;
          const isPythonCode = language === 'python' || codeContent.includes('def main(');

          if (isPythonCode) {
            try {
              const executeResponse = await workflowApi.executeCode({
                code: codeContent,
                language: 'python',
                inputVars,
                outputVars,
                params: { ...execParams, user_input: contextRef.current.user_input || '' },
              });
              if (executeResponse.status === 'success') {
                codeResult = executeResponse.result;
              } else {
                codeResult = { error: executeResponse.error || '执行失败' };
              }
            } catch (apiError: any) {
              if (apiError.code === 'ECONNABORTED' || apiError.message?.includes('timeout')) {
                codeResult = { error: '代码执行超时', hint: '代码执行时间超过 30 秒' };
              } else if (apiError.message?.includes('Network Error')) {
                codeResult = { error: '无法连接到后端服务', hint: '请确保后端服务已启动' };
              } else {
                codeResult = { error: `后端执行失败: ${apiError.message}`, hint: apiError.response?.data?.error };
              }
            }
          } else {
            const isJSFunction = codeContent.includes('function') || codeContent.includes('=>');
            if (codeContent.includes('main') || isJSFunction) {
              try {
                const paramNames = inputVars.map((v: any) => v.customName || v.name);
                const wrappedCode = `(function(${paramNames.join(', ')}) { ${codeContent}; if (typeof main === 'function') { return main(${paramNames.join(', ')}); } return undefined; })`;
                const compiledFn = eval(wrappedCode);
                const paramValues = paramNames.map((name: string) => execParams[name]);
                codeResult = compiledFn(...paramValues);
              } catch (execError: any) {
                codeResult = { error: `代码执行错误: ${execError.message}` };
              }
            } else {
              try {
                const fn = new Function('context', `return (${codeContent})`);
                codeResult = fn(execParams);
              } catch (exprError: any) {
                codeResult = { error: `表达式执行错误: ${exprError.message}` };
              }
            }
          }

          if (outputVars.length > 0) {
            outputVars.forEach((outputVar: any) => {
              const varName = outputVar.name;
              if (!varName) return;
              if (codeResult && typeof codeResult === 'object' && Object.prototype.hasOwnProperty.call(codeResult, varName)) {
                contextRef.current[varName] = codeResult[varName];
              } else if (outputVars.length === 1) {
                contextRef.current[varName] = codeResult;
              }
            });
          }
          if (primaryOutputName) {
            contextRef.current.code_output = contextRef.current[primaryOutputName];
          }

          const duration = Date.now() - nodeStartTime;
          const hasError = codeResult && typeof codeResult === 'object' && codeResult.error;
          onNodeStatusChange?.(currentNode.id, hasError ? 'failed' : 'success');
          updateNodeExecutionData(currentNode.id, {
            output: typeof codeResult === 'object' ? codeResult : { result: codeResult },
            status: hasError ? 'failed' : 'success',
            duration,
            error: hasError ? codeResult.error : undefined,
          });
          addExecutionLog(currentNode.id, currentNode.data?.label || '代码', 'code', hasError ? 'failed' : 'success', hasError ? `执行失败: ${codeResult.error}` : '执行成功', duration, hasError ? codeResult.error : undefined);
          setCompletedCount(prev => prev + 1);

          if (showOutput && loadingMsgId) {
            const outputStr = typeof codeResult === 'object' ? JSON.stringify(codeResult, null, 2) : String(codeResult);
            updateMessage(loadingMsgId, { content: outputStr, isLoading: false });
          }
        } catch (error: any) {
          const duration = Date.now() - nodeStartTime;
          onNodeStatusChange?.(currentNode.id, 'failed');
          updateNodeExecutionData(currentNode.id, { status: 'failed', duration, error: error.message });
          addExecutionLog(currentNode.id, currentNode.data?.label || '代码', 'code', 'failed', `执行失败: ${error.message}`, duration, error.message);
          if (showOutput && loadingMsgId) {
            updateMessage(loadingMsgId, { content: `代码执行失败：${error.message}`, isLoading: false });
          }
        }
        return getNextNode(currentNode.id);
      }

      case 'condition': {
        const conditions = currentNode.data?.conditions || [];
        let matchedIndex = -1;
        for (let i = 0; i < conditions.length; i++) {
          if (evaluateCondition(conditions[i], contextRef.current)) {
            matchedIndex = i;
            break;
          }
        }
        const duration = Date.now() - nodeStartTime;
        onNodeStatusChange?.(currentNode.id, 'success');
        updateNodeExecutionData(currentNode.id, {
          output: { matched_condition: matchedIndex },
          status: 'success',
          duration,
        });
        addExecutionLog(currentNode.id, currentNode.data?.label || '条件分支', 'condition', 'success', `匹配条件 ${matchedIndex >= 0 ? matchedIndex + 1 : '默认分支'}`, duration);
        setCompletedCount(prev => prev + 1);
        return getConditionNextNode(currentNode.id, matchedIndex);
      }

      case 'output': {
        const template = currentNode.data?.template || '';
        const outputParam = currentNode.data?.outputParam;

        const stringifyValue = (value: any): string => {
          if (value === undefined || value === null) return '';
          return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        };

        let finalOutput = '';
        if (template) {
          finalOutput = template.replace(/\{\{([\w_]+)\}\}/g, (_match: string, key: string) => {
            const value = contextRef.current[key];
            return stringifyValue(value);
          });
        } else if (outputParam) {
          finalOutput = stringifyValue(contextRef.current[outputParam]);
        } else if (contextRef.current.code_output !== undefined && contextRef.current.code_output !== null) {
          finalOutput = stringifyValue(contextRef.current.code_output);
        }

        const duration = Date.now() - nodeStartTime;
        onNodeStatusChange?.(currentNode.id, 'success');
        updateNodeExecutionData(currentNode.id, {
          output: { final_output: finalOutput },
          status: 'success',
          duration,
        });
        addExecutionLog(currentNode.id, currentNode.data?.label || '输出', 'output', 'success', `输出 ${finalOutput.length} 字符`, duration);
        setCompletedCount(prev => prev + 1);

        if (!finalOutput.trim()) return getNextNode(currentNode.id);

        const msgId = addMessage('assistant', '', {
          nodeName: currentNode.data?.label || '输出',
          isLoading: true,
        });

        await new Promise<void>((resolve) => {
          let currentIndex = 0;
          const chunkSize = 2;
          const interval = 30;
          const streamInterval = setInterval(() => {
            if (currentIndex >= finalOutput.length) {
              clearInterval(streamInterval);
              updateMessage(msgId, { content: finalOutput, isLoading: false });
              resolve();
              return;
            }
            currentIndex += chunkSize;
            const currentContent = finalOutput.slice(0, currentIndex);
            updateMessage(msgId, { content: currentContent, isLoading: true });
          }, interval);
        });

        return getNextNode(currentNode.id);
      }

      case 'end': {
        addMessage('system', '对话结束');
        setCurrentNodeId(null);
        const duration = Date.now() - nodeStartTime;
        onNodeStatusChange?.(currentNode.id, 'success');
        updateNodeExecutionData(currentNode.id, { output: {}, status: 'success', duration });
        addExecutionLog(currentNode.id, '结束', 'end', 'success', '流程结束', duration);
        setCompletedCount(prev => prev + 1);
        return null;
      }

      default:
        return getNextNode(currentNode.id);
    }
  }, [addMessage, updateMessage, getNextNode, getConditionNextNode, evaluateCondition, onNodeStatusChange, updateNodeExecutionData, addExecutionLog, isDebugMode, waitForResume, nodes]);

  const startExecution = useCallback(async () => {
    setMessages([]);
    setIsRunning(true);
    onRunningModeChange(true);
    contextRef.current = {};
    setExecutionLogs([]);
    setExecutionData({});
    setCompletedCount(0);
    setTotalCount(getExecutableNodeCount());

    const startNode = getStartNode();
    if (!startNode) {
      if (isMountedRef.current) {
        addMessage('system', '错误：没有找到开始节点');
        setIsRunning(false);
        onRunningModeChange(false);
        setCurrentNodeId(null);
      }
      return;
    }

    const firstEdge = edges.find(e => e.source === startNode.id);
    if (!firstEdge) {
      if (isMountedRef.current) {
        addMessage('system', '错误：开始节点没有连接到其他节点');
        setIsRunning(false);
        onRunningModeChange(false);
        setCurrentNodeId(null);
      }
      return;
    }

    let currentNode: Node | null = getNextNode(startNode.id);
    if (!currentNode) {
      if (isMountedRef.current) {
        addMessage('system', '错误：工作流中没有可执行的节点');
        setIsRunning(false);
        onRunningModeChange(false);
        setCurrentNodeId(null);
      }
      return;
    }

    while (currentNode && isMountedRef.current) {
      // 检查是否暂停
      if (pauseRef.current) {
        await waitForResume();
      }

      setCurrentNodeId(currentNode.id);
      currentNode = await executeNode(currentNode);
    }

    if (isMountedRef.current && currentNodeId === null) {
      setIsRunning(false);
      onRunningModeChange(false);
      message.success(`执行完成，耗时 ${((Date.now() - (executionLogs[0]?.timestamp || Date.now())) / 1000).toFixed(1)}s`);
    }
  }, [getStartNode, getNextNode, addMessage, executeNode, edges, onRunningModeChange, getExecutableNodeCount, executionLogs, currentNodeId, waitForResume]);

  const handleUserInput = useCallback(async () => {
    if (!inputValue.trim()) { message.warning('请输入内容'); return; }

    addMessage('user', inputValue);
    contextRef.current.user_input = inputValue;

    if (currentNodeId) {
      const currentNode = nodes.find(n => n.id === currentNodeId);
      if (currentNode && currentNode.type === 'input') {
        const varName = currentNode.data?.varName || `user_input_${currentNodeId}`;
        contextRef.current[varName] = inputValue;
      }
    }

    setInputValue('');
    setIsRunning(true);
    onRunningModeChange(true);

    if (currentNodeId) {
      let nextNode = getNextNode(currentNodeId);
      while (nextNode && isMountedRef.current) {
        if (pauseRef.current) await waitForResume();
        setCurrentNodeId(nextNode.id);
        nextNode = await executeNode(nextNode);
      }
    }

    if (isMountedRef.current && currentNodeId === null) {
      setIsRunning(false);
      onRunningModeChange(false);
    }
  }, [inputValue, currentNodeId, getNextNode, addMessage, executeNode, nodes, onRunningModeChange, waitForResume]);

  // 调试控制
  const handlePauseResume = useCallback(() => {
    setIsPaused(prev => {
      const next = !prev;
      pauseRef.current = next;
      return next;
    });
  }, []);

  const handleStepNext = useCallback(() => {
    stepNextRef.current = true;
    setIsPaused(false);
    pauseRef.current = false;
  }, []);

  const handleReset = useCallback(() => {
    setMessages([]);
    setIsRunning(false);
    onRunningModeChange(false);
    setCurrentNodeId(null);
    setExecutionLogs([]);
    setExecutionData({});
    setCompletedCount(0);
    setIsPaused(false);
    pauseRef.current = false;
    stepNextRef.current = false;
    contextRef.current = {};
    // 重置所有节点状态
    nodes.forEach(n => onNodeStatusChange?.(n.id, 'idle'));
    message.info('流程已重置');
  }, [nodes, onNodeStatusChange, onRunningModeChange]);

  // 切换断点（通过 WorkflowEditor 管理）
  // const toggleBreakpoint = useCallback((nodeId: string) => {
  //   setBreakpoints(prev => {
  //     const next = new Set(prev);
  //     if (next.has(nodeId)) next.delete(nodeId);
  //     else next.add(nodeId);
  //     return next;
  //   });
  // }, []);

  const showInput = !isRunning && currentNodeId !== null;
  const showStartButton = !isRunning && currentNodeId === null && messages.length === 0;
  const showRestartButton = !isRunning && currentNodeId === null && messages.length > 0;

  // 获取当前选中节点的执行数据
  const selectedNodeData = selectedNodeId ? executionData[selectedNodeId] : null;
  const selectedNodeInfo = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  // 进度百分比
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>工作流运行 - {workflowName}</span>
          <Space size="small">
            {isRunning && (
              <Badge status="processing" text="执行中" />
            )}
            {isPaused && (
              <Badge status="warning" text="已暂停" />
            )}
          </Space>
        </div>
      }
      placement="right"
      width="33vw"
      onClose={onClose}
      open={visible}
      mask={false}
      style={{ position: 'absolute' }}
      getContainer={false}
      extra={
        <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
      }
    >
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* 进度条 */}
        {isRunningMode && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>执行进度</Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>{completedCount}/{totalCount} 节点</Text>
            </div>
            <Progress percent={progressPercent} size="small" status={isRunning ? 'active' : undefined} />
          </div>
        )}

        {/* 调试控制栏 */}
        {isRunningMode && (
          <div style={{ display: 'flex', gap: '8px', padding: '8px', background: '#f6ffed', borderRadius: '6px', alignItems: 'center' }}>
            <Button.Group size="small">
              {isRunning ? (
                <Button
                  icon={isPaused ? <PlayCircleOutlined /> : <PauseOutlined />}
                  onClick={handlePauseResume}
                >
                  {isPaused ? '继续' : '暂停'}
                </Button>
              ) : null}
              {isDebugMode && isPaused && (
                <Button icon={<StepForwardOutlined />} onClick={handleStepNext}>
                  单步
                </Button>
              )}
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Button.Group>
            <div style={{ marginLeft: 'auto' }}>
              <Button
                size="small"
                type={isDebugMode ? 'primary' : 'default'}
                onClick={() => setIsDebugMode(!isDebugMode)}
              >
                {isDebugMode ? '退出调试' : '调试模式'}
              </Button>
            </div>
          </div>
        )}

        {/* 执行日志 */}
        {isRunningMode && executionLogs.length > 0 && (
          <div style={{ maxHeight: '150px', overflowY: 'auto', background: '#fafafa', borderRadius: '6px', padding: '8px' }}>
            <Text type="secondary" style={{ fontSize: '12px', fontWeight: 600 }}>执行日志</Text>
            <div style={{ marginTop: '4px' }}>
              {executionLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 0',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  onClick={() => onNodeClick?.(log.nodeId)}
                >
                  {log.status === 'running' && <Badge status="processing" />}
                  {log.status === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '12px' }} />}
                  {log.status === 'failed' && <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />}
                  <Text style={{ fontSize: '12px' }}>{log.nodeName}</Text>
                  <Text type="secondary" style={{ fontSize: '11px', marginLeft: 'auto' }}>
                    {log.duration ? `${log.duration}ms` : ''}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        )}

        <Divider style={{ margin: '0' }} />

        {/* 节点数据面板（当点击节点时显示） */}
        {selectedNodeId && selectedNodeData && (
          <div style={{ background: '#f0f5ff', borderRadius: '6px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Text strong style={{ fontSize: '13px' }}>
                {selectedNodeInfo?.data?.label || '节点'} 数据
              </Text>
              {selectedNodeData.duration && (
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  <ClockCircleOutlined /> {selectedNodeData.duration}ms
                </Text>
              )}
            </div>

            {/* 输入数据 */}
            {selectedNodeData.input && Object.keys(selectedNodeData.input).length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>输入</Text>
                <div style={{ background: '#fff', borderRadius: '4px', padding: '6px', marginTop: '2px', fontSize: '11px', maxHeight: '80px', overflow: 'auto' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(selectedNodeData.input, null, 2).slice(0, 500)}
                  </pre>
                </div>
              </div>
            )}

            {/* 输出数据 */}
            {selectedNodeData.output && Object.keys(selectedNodeData.output).length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: '11px' }}>输出</Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    style={{ fontSize: '11px', padding: '0 4px', height: 'auto' }}
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedNodeData.output, null, 2));
                      message.success('已复制');
                    }}
                  >
                    复制
                  </Button>
                </div>
                <div style={{ background: '#fff', borderRadius: '4px', padding: '6px', marginTop: '2px', fontSize: '11px', maxHeight: '120px', overflow: 'auto' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(selectedNodeData.output, null, 2).slice(0, 800)}
                  </pre>
                </div>
              </div>
            )}

            {selectedNodeData.error && (
              <div style={{ marginTop: '8px', padding: '6px', background: '#fff2f0', borderRadius: '4px', border: '1px solid #ffccc7' }}>
                <Text type="danger" style={{ fontSize: '11px' }}>
                  <ExclamationCircleOutlined /> {selectedNodeData.error}
                </Text>
              </div>
            )}
          </div>
        )}

        {/* 对话消息区域 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          background: '#f5f5f5',
          borderRadius: '8px',
        }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
              <PlayCircleOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
              <p>点击"开始执行"启动工作流</p>
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
                    <div dangerouslySetInnerHTML={{ __html: msg.content }} />
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

        {/* 底部输入区域 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {showStartButton && (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={(e) => {
                e.stopPropagation();
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
                startExecution();
              }}
              block
            >
              重新执行
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default WorkflowPreview;
