import axios from 'axios';
import type { WorkflowCreateRequest, WorkflowUpdateRequest } from '../types';

// 从环境变量读取后端地址，默认为 localhost:8001
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

// 创建 axios 实例
const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 驼峰命名转下划线命名
const toSnakeCase = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = toSnakeCase(value);
  }
  return result;
};

// 下划线命名转驼峰命名
const toCamelCase = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(value);
  }
  return result;
};

// 添加请求拦截器
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    // 转换请求数据为下划线命名
    if (config.data) {
      config.data = toSnakeCase(config.data);
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// 添加响应拦截器
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    // 转换响应数据为驼峰命名
    if (response.data) {
      response.data = toCamelCase(response.data);
    }
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.message, error.config?.url);
    return Promise.reject(error);
  }
);

export const kbApi = {
  list: async () => {
    const response = await api.get('/kb');
    return response.data;
  },

  get: async (kbId: string) => {
    const response = await api.get(`/kb/${kbId}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post('/kb', data);
    return response.data;
  },

  update: async (kbId: string, data: any) => {
    const response = await api.put(`/kb/${kbId}`, data);
    return response.data;
  },

  delete: async (kbId: string) => {
    const response = await api.delete(`/kb/${kbId}`);
    return response.data;
  },

  getDocuments: async (kbId: string) => {
    const response = await api.get(`/kb/${kbId}/documents`);
    return response.data;
  },

  uploadDocument: async (kbId: string, file: File) => {
    const formData = new FormData();
    formData.append('kb_id', kbId);
    formData.append('file', file);
    const response = await fetch(`${api.defaults.baseURL}/kb/${kbId}/documents/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('上传失败');
    return response.json();
  },

  deleteDocument: async (docId: string) => {
    const response = await api.delete(`/kb/documents/${docId}`);
    return response.data;
  },

  recall: async (kbId: string, params: {
    query: string;
    retrievalMode?: string;
    topK?: number;
    candidateK?: number;
    denseWeight?: number;
    sparseWeight?: number;
    minScore?: number;
    enableRerank?: boolean;
    maxChars?: number;
  }) => {
    const response = await api.post(`/kb/${kbId}/recall`, params);
    return response.data;
  },
};

export const workflowApi = {
  list: async () => {
    const response = await api.get('/workflow');
    return response.data;
  },

  get: async (workflowId: string) => {
    const response = await api.get(`/workflow/${workflowId}`);
    return response.data;
  },

  create: async (data: WorkflowCreateRequest) => {
    const response = await api.post('/workflow', data);
    return response.data;
  },

  update: async (workflowId: string, data: WorkflowUpdateRequest) => {
    const response = await api.put(`/workflow/${workflowId}`, data);
    return response.data;
  },

  delete: async (workflowId: string) => {
    const response = await api.delete(`/workflow/${workflowId}`);
    return response.data;
  },

  demo: async (workflowId: string, data: any) => {
    const response = await api.post(`/workflow/${workflowId}/demo`, data);
    return response.data;
  },

  run: async (workflowId: string, data: any) => {
    const response = await api.post(`/workflow/${workflowId}/run`, data);
    return response.data;
  },

  // 调用 LLM API（非流式）
  chat: async (
    messages: Array<{role: string; content: string}>,
    model: string = 'Qwen3-32B-FP8',
    temperature: number = 0.7,
    enableThinking: boolean = true,
    showOutput: boolean = true
  ) => {
    const response = await api.post('/workflow/chat', {
      messages,
      model,
      temperature,
      enable_thinking: enableThinking,
      show_output: showOutput,
    });
    return response.data;
  },

  // 执行代码节点（用于前端预览）
  executeCode: async (data: {
    code: string;
    language: string;
    inputVars: any[];
    outputVars: any[];
    params: Record<string, any>;
  }) => {
    const response = await api.post('/workflow/execute/code', {
      code: data.code,
      language: data.language,
      input_vars: data.inputVars,
      output_vars: data.outputVars,
      params: data.params,
    });
    return response.data;
  },

  // 调用 LLM API（流式 SSE）
  chatStream: (
    messages: Array<{role: string; content: string}>,
    onChunk: (chunk: { content: string; model: string; done: boolean; error?: boolean }) => void,
    model: string = 'Qwen3-32B-FP8',
    temperature: number = 0.7,
    enableThinking: boolean = true
  ) => {
    const abortController = new AbortController();
    
    // 构建请求体（使用下划线命名）
    const requestBody = toSnakeCase({
      messages,
      model,
      temperature,
      enableThinking,
    });

    // 发起 SSE 请求
    fetch(`${BACKEND_URL}/api/workflow/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          // 解码收到的数据
          buffer += decoder.decode(value, { stream: true });

          // 处理 SSE 数据行
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || ''; // 保留不完整的部分

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                // 转换为驼峰命名
                const camelData = toCamelCase(data);
                onChunk(camelData);

                // 如果收到完成标记，停止读取
                if (camelData.done) {
                  return;
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e, line);
              }
            }
          }
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          console.log('Stream aborted');
        } else {
          console.error('Stream error:', error);
          onChunk({ content: `Error: ${error.message}`, model, done: true, error: true });
        }
      });

    // 返回 abort 函数，允许取消请求
    return {
      abort: () => abortController.abort(),
    };
  },
};
