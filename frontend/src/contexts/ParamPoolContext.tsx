import React, { createContext, useContext, useState, useCallback } from 'react';

// 参数定义
export interface Param {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'datetime';
  source: string;
  description?: string;
}

// 参数池上下文类型
interface ParamPoolContextType {
  params: Param[];
  addParam: (param: Param) => void;
  removeParam: (paramId: string) => void;
  updateParam: (paramId: string, updates: Partial<Param>) => void;
  getParamsBySource: (source: string) => Param[];
  getParamById: (id: string) => Param | undefined;
}

// 创建上下文
const ParamPoolContext = createContext<ParamPoolContextType | undefined>(undefined);

// 默认参数（全局变量）
const defaultParams: Param[] = [
  { id: 'current_time', label: '当前时间', type: 'datetime', source: '全局变量' },
  { id: 'workflow_id', label: '工作流ID', type: 'string', source: '全局变量' },
  { id: 'run_id', label: '运行ID', type: 'string', source: '全局变量' },
  { id: 'chat_history', label: '对话历史', type: 'string', source: '全局变量', description: '包含所有对话内容的完整历史记录' },
];

// Provider 组件
export const ParamPoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [params, setParams] = useState<Param[]>(defaultParams);

  // 添加参数
  const addParam = useCallback((param: Param) => {
    setParams((prev) => {
      // 如果参数已存在，先移除旧的
      const filtered = prev.filter((p) => p.id !== param.id);
      return [...filtered, param];
    });
  }, []);

  // 移除参数
  const removeParam = useCallback((paramId: string) => {
    setParams((prev) => prev.filter((p) => p.id !== paramId));
  }, []);

  // 更新参数
  const updateParam = useCallback((paramId: string, updates: Partial<Param>) => {
    setParams((prev) =>
      prev.map((p) => (p.id === paramId ? { ...p, ...updates } : p))
    );
  }, []);

  // 根据来源获取参数
  const getParamsBySource = useCallback(
    (source: string) => {
      return params.filter((p) => p.source === source);
    },
    [params]
  );

  // 根据ID获取参数
  const getParamById = useCallback(
    (id: string) => {
      return params.find((p) => p.id === id);
    },
    [params]
  );

  return (
    <ParamPoolContext.Provider
      value={{
        params,
        addParam,
        removeParam,
        updateParam,
        getParamsBySource,
        getParamById,
      }}
    >
      {children}
    </ParamPoolContext.Provider>
  );
};

// Hook
export const useParamPool = () => {
  const context = useContext(ParamPoolContext);
  if (context === undefined) {
    throw new Error('useParamPool must be used within a ParamPoolProvider');
  }
  return context;
};
