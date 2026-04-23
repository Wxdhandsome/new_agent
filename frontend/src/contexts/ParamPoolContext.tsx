import { createContext, useContext, useState, useCallback, useEffect, useRef, type FC, type ReactNode } from 'react';

// 参数定义
export interface Param {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'datetime';
  source: string;
  description?: string;
  value?: any; // 参数的当前值
  lastUpdated?: number; // 最后更新时间戳
}

// 参数引用关系定义
export interface ParamReference {
  id: string; // 引用关系的唯一ID
  sourceNodeId: string; // 引用源节点ID
  sourceParamId: string; // 被引用的参数ID
  targetNodeId: string; // 目标节点ID（使用该参数的节点）
  targetParamName: string; // 目标参数名称（在目标节点中的变量名）
  sourceType: 'input' | 'reference' | 'value'; // 引用类型
  createdAt: number;
  updatedAt: number;
  isActive: boolean; // 是否激活状态
}

// 参数变化事件
export interface ParamChangeEvent {
  paramId: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
  source?: string; // 变化来源（节点ID或'external'）
}

// 参数池上下文类型
interface ParamPoolContextType {
  params: Param[];
  references: ParamReference[];
  changeEvents: ParamChangeEvent[];
  
  // 参数管理方法
  addParam: (param: Param) => void;
  removeParam: (paramId: string) => void;
  updateParam: (paramId: string, updates: Partial<Param>) => void;
  getParamsBySource: (source: string) => Param[];
  getParamById: (id: string) => Param | undefined;
  
  // 引用关系管理方法
  addReference: (reference: Omit<ParamReference, 'id' | 'createdAt' | 'updatedAt'>) => string;
  removeReference: (referenceId: string) => void;
  removeReferencesByNode: (nodeId: string) => void;
  getReferencesByNode: (nodeId: string) => ParamReference[];
  getReferencesForParam: (paramId: string) => ParamReference[];
  updateReference: (referenceId: string, updates: Partial<ParamReference>) => void;
  validateReference: (reference: ParamReference) => boolean;
  
  // 值更新和同步方法
  updateParamValue: (paramId: string, value: any, source?: string) => void;
  syncReferences: (sourceNodeId: string) => void;
  
  // 监听器管理
  addChangeListener: (listener: (event: ParamChangeEvent) => void) => void;
  removeChangeListener: (listener: (event: ParamChangeEvent) => void) => void;
  
  // 导入/导出功能
  exportReferences: () => string;
  importReferences: (jsonString: string) => boolean;
  
  // 批量操作
  clearAllReferences: () => void;
  getActiveReferencesCount: () => number;
}

// 创建上下文
const ParamPoolContext = createContext<ParamPoolContextType | undefined>(undefined);

// 默认参数（全局变量）
const defaultParams: Param[] = [
  // 全局变量
  { 
    id: 'current_time', 
    label: '当前时间', 
    type: 'datetime', 
    source: '全局变量',
    value: new Date().toISOString(),
    lastUpdated: Date.now()
  },
  { 
    id: 'workflow_id', 
    label: '工作流ID', 
    type: 'string', 
    source: '全局变量',
    description: '当前工作流的唯一标识符'
  },
  { 
    id: 'run_id', 
    label: '运行ID', 
    type: 'string', 
    source: '全局变量',
    description: '当前运行的唯一标识符'
  },
  { 
    id: 'chat_history', 
    label: '对话历史', 
    type: 'string', 
    source: '全局变量', 
    description: '包含所有对话内容的完整历史记录'
  },
  
  // 输入节点输出
  { 
    id: 'user_input', 
    label: '用户输入', 
    type: 'string', 
    source: '输入节点', 
    description: '用户在输入节点中输入的内容'
  },
  
  // 大模型节点输出
  { 
    id: 'llm_output', 
    label: '大模型输出', 
    type: 'string', 
    source: '大模型节点', 
    description: 'LLM节点的返回结果'
  },
  
  // 注意：代码节点的输出参数由用户自定义，不再预设 code_result
];

// Provider 组件
export const ParamPoolProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [params, setParams] = useState<Param[]>(defaultParams);
  const [references, setReferences] = useState<ParamReference[]>([]);
  const [changeEvents, setChangeEvents] = useState<ParamChangeEvent[]>([]);
  
  const listenersRef = useRef<Set<(event: ParamChangeEvent) => void>>(new Set());
  const paramsRef = useRef(params);
  const referencesRef = useRef(references);

  // 保持 ref 同步
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    referencesRef.current = references;
  }, [references]);

  // 定期更新时间相关的参数
  useEffect(() => {
    const interval = setInterval(() => {
      updateParam('current_time', { 
        value: new Date().toISOString(),
        lastUpdated: Date.now()
      });
    }, 1000); // 每秒更新一次

    return () => clearInterval(interval);
  }, []);

  // 添加参数
  const addParam = useCallback((param: Param) => {
    setParams((prev) => {
      // 如果参数已存在，先移除旧的
      const filtered = prev.filter((p) => p.id !== param.id);
      return [...filtered, { ...param, lastUpdated: Date.now() }];
    });
  }, []);

  // 移除参数
  const removeParam = useCallback((paramId: string) => {
    setParams((prev) => prev.filter((p) => p.id !== paramId));
    
    // 同时移除与该参数相关的所有引用
    setReferences((prev) => prev.filter(r => r.sourceParamId !== paramId));
  }, []);

  // 更新参数
  const updateParam = useCallback((paramId: string, updates: Partial<Param>) => {
    let oldValue: any = undefined;
    
    setParams((prev) =>
      prev.map((p) => {
        if (p.id === paramId) {
          oldValue = { ...p };
          return { ...p, ...updates, lastUpdated: Date.now() };
        }
        return p;
      })
    );

    // 如果值发生变化，触发变化事件
    if (updates.value !== undefined && oldValue) {
      const event: ParamChangeEvent = {
        paramId,
        oldValue: oldValue.value,
        newValue: updates.value,
        timestamp: Date.now(),
        source: updates.value?.source || 'external',
      };

      setChangeEvents(prev => [...prev.slice(-99), event]); // 保留最近100条事件
      
      // 通知所有监听器
      listenersRef.current.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[ParamPool] Listener error:', error);
        }
      });

      // 自动同步相关引用
      setTimeout(() => {
        syncReferencesForParam(paramId);
      }, 0);
    }
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

  // 添加引用关系
  const addReference = useCallback((
    referenceData: Omit<ParamReference, 'id' | 'createdAt' | 'updatedAt'>
  ): string => {
    const id = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const newReference: ParamReference = {
      ...referenceData,
      id,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    // 验证引用的合法性
    if (!validateReferenceInternal(newReference)) {
      console.warn('[ParamPool] Invalid reference:', newReference);
      return '';
    }

    setReferences((prev) => {
      // 检查是否已存在相同的引用
      const exists = prev.find(r => 
        r.sourceNodeId === newReference.sourceNodeId &&
        r.targetNodeId === newReference.targetNodeId &&
        r.targetParamName === newReference.targetParamName
      );
      
      if (exists) {
        // 更新现有引用
        return prev.map(r => r.id === exists.id ? { ...newReference, id: exists.id } : r);
      }
      
      return [...prev, newReference];
    });

    console.log('[ParamPool] Reference added:', newReference);
    return id;
  }, []);

  // 移除引用关系
  const removeReference = useCallback((referenceId: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== referenceId));
  }, []);

  // 移除节点的所有引用
  const removeReferencesByNode = useCallback((nodeId: string) => {
    setReferences((prev) => 
      prev.filter((r) => r.sourceNodeId !== nodeId && r.targetNodeId !== nodeId)
    );
  }, []);

  // 获取节点的所有引用
  const getReferencesByNode = useCallback((nodeId: string) => {
    return references.filter(r => r.targetNodeId === nodeId || r.sourceNodeId === nodeId);
  }, [references]);

  // 获取参数的所有引用
  const getReferencesForParam = useCallback((paramId: string) => {
    return references.filter(r => r.sourceParamId === paramId);
  }, [references]);

  // 更新引用关系
  const updateReference = useCallback((referenceId: string, updates: Partial<ParamReference>) => {
    setReferences((prev) =>
      prev.map((r) =>
        r.id === referenceId ? { ...r, ...updates, updatedAt: Date.now() } : r
      )
    );
  }, []);

  // 验证引用合法性（内部方法）
  const validateReferenceInternal = useCallback((reference: ParamReference): boolean => {
    // 检查被引用的参数是否存在
    const sourceParam = paramsRef.current.find(p => p.id === reference.sourceParamId);
    if (!sourceParam) {
      console.warn(`[ParamPool] Source param not found: ${reference.sourceParamId}`);
      return false;
    }

    // 检查是否自引用
    if (reference.sourceNodeId === reference.targetNodeId) {
      console.warn('[ParamPool] Self-reference detected');
      return false;
    }

    // 检查循环引用（简单检查）
    // 这里可以扩展更复杂的循环检测算法
    
    return true;
  }, []);

  // 公开的验证方法
  const validateReference = useCallback((reference: ParamReference): boolean => {
    return validateReferenceInternal(reference);
  }, [validateReferenceInternal]);

  // 更新参数值（带同步）
  const updateParamValue = useCallback((paramId: string, value: any, source?: string) => {
    const updates: Partial<Param> = { value };
    if (source) {
      updates.source = source;
    }
    updateParam(paramId, updates);
  }, [updateParam]);

  // 同步指定节点的引用
  const syncReferences = useCallback((sourceNodeId: string) => {
    const nodeRefs = referencesRef.current.filter(r => r.sourceNodeId === sourceNodeId);
    
    nodeRefs.forEach(ref => {
      const sourceParam = paramsRef.current.find(p => p.id === ref.sourceParamId);
      if (sourceParam && sourceParam.value !== undefined) {
        console.log(`[ParamPool] Syncing ${ref.targetParamName} from ${ref.sourceParamId}:`, sourceParam.value);
        // 这里可以触发目标节点的重新计算或更新
      }
    });
  }, []);

  // 同步特定参数的所有引用
  const syncReferencesForParam = useCallback((paramId: string) => {
    const paramRefs = referencesRef.current.filter(r => r.sourceParamId === paramId && r.isActive);
    
    if (paramRefs.length > 0) {
      console.log(`[ParamPool] Syncing ${paramRefs.length} references for param:`, paramId);
      
      // 触发自定义事件，让组件可以监听并响应
      const customEvent = new CustomEvent('paramSync', {
        detail: { paramId, references: paramRefs }
      });
      window.dispatchEvent(customEvent);
    }
  }, []);

  // 添加变化监听器
  const addChangeListener = useCallback((listener: (event: ParamChangeEvent) => void) => {
    listenersRef.current.add(listener);
  }, []);

  // 移除变化监听器
  const removeChangeListener = useCallback((listener: (event: ParamChangeEvent) => void) => {
    listenersRef.current.delete(listener);
  }, []);

  // 导出引用关系
  const exportReferences = useCallback((): string => {
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      params: paramsRef.current.map(p => ({
        id: p.id,
        label: p.label,
        type: p.type,
        source: p.source,
      })),
      references: referencesRef.current,
    };
    
    return JSON.stringify(exportData, null, 2);
  }, []);

  // 导入引用关系
  const importReferences = useCallback((jsonString: string): boolean => {
    try {
      const data = JSON.parse(jsonString);
      
      if (!data.version || !data.references) {
        throw new Error('Invalid format');
      }

      // 导入引用关系
      const importedRefs: ParamReference[] = data.references.map((ref: any) => ({
        ...ref,
        id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: true,
      }));

      setReferences(prev => [...prev, ...importedRefs]);
      
      console.log(`[ParamPool] Imported ${importedRefs.length} references`);
      return true;
    } catch (error) {
      console.error('[ParamPool] Import failed:', error);
      return false;
    }
  }, []);

  // 清除所有引用
  const clearAllReferences = useCallback(() => {
    setReferences([]);
  }, []);

  // 获取活跃引用数量
  const getActiveReferencesCount = useCallback(() => {
    return referencesRef.current.filter(r => r.isActive).length;
  }, []);

  return (
    <ParamPoolContext.Provider
      value={{
        params,
        references,
        changeEvents,
        
        // 参数管理方法
        addParam,
        removeParam,
        updateParam,
        getParamsBySource,
        getParamById,
        
        // 引用关系管理方法
        addReference,
        removeReference,
        removeReferencesByNode,
        getReferencesByNode,
        getReferencesForParam,
        updateReference,
        validateReference,
        
        // 值更新和同步方法
        updateParamValue,
        syncReferences,
        
        // 监听器管理
        addChangeListener,
        removeChangeListener,
        
        // 导入/导出功能
        exportReferences,
        importReferences,
        
        // 批量操作
        clearAllReferences,
        getActiveReferencesCount,
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

// Hook：专门用于监听参数变化
export const useParamChangeListener = (callback: (event: ParamChangeEvent) => void) => {
  const { addChangeListener, removeChangeListener } = useParamPool();
  
  useEffect(() => {
    addChangeListener(callback);
    return () => {
      removeChangeListener(callback);
    };
  }, [callback, addChangeListener, removeChangeListener]);
};

export default ParamPoolContext;
