import { useCallback, useRef, useState, useEffect, type FC } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Connection,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  Node,
  Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Layout, Button, Space, message, Input, Tooltip, Spin, Badge } from 'antd';
import {
  SaveOutlined,
  PlayCircleOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  CompressOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PauseOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { workflowApi, api } from '../api';
import type { Workflow } from '../types';
import NodeConfigPanel from '../components/NodeConfig';
import { ParamPoolProvider, useParamPool } from '../contexts/ParamPoolContext';
import WorkflowPreview, { type NodeExecutionStatus } from '../components/WorkflowPreview';

const { Header, Content, Sider } = Layout;

interface WorkflowEditorProps {
  workflow?: Workflow | null;
  onBack?: () => void;
  readOnly?: boolean;
  autoOpenPreview?: boolean;
}

// ========== 节点类型配置 ==========
interface NodeTypeConfig {
  type: string;
  label: string;
  icon: string;
  color: string;
  category: 'high' | 'low' | 'boundary';
  sceneTag: string;
  tooltip: string;
}

const NODE_TYPES: NodeTypeConfig[] = [
  { type: 'input', label: '输入', icon: '📥', color: '#1890ff', category: 'high', sceneTag: '数据输入', tooltip: '接收用户输入，支持文本、数字等多种类型' },
  { type: 'llm', label: '大模型', icon: '🤖', color: '#722ed1', category: 'high', sceneTag: '对话 / 推理', tooltip: '调用大语言模型进行对话或推理' },
  { type: 'condition', label: '条件分支', icon: '🔀', color: '#fa8c16', category: 'high', sceneTag: '逻辑判断', tooltip: '根据条件表达式进行分支跳转' },
  { type: 'output', label: '输出', icon: '📤', color: '#eb2f96', category: 'high', sceneTag: '结果输出', tooltip: '生成最终输出，支持模板渲染' },
  { type: 'code', label: '代码', icon: '💻', color: '#13c2c2', category: 'low', sceneTag: '自定义处理', tooltip: '执行 Python 代码进行自定义处理' },
  { type: 'rag', label: '知识库检索', icon: '📚', color: '#2f54eb', category: 'low', sceneTag: '知识问答', tooltip: '从绑定的知识库中检索信息' },
  { type: 'start', label: '开始', icon: '🚀', color: '#52c41a', category: 'boundary', sceneTag: '流程起点', tooltip: '工作流的起始节点' },
  { type: 'end', label: '结束', icon: '🏁', color: '#ff4d4f', category: 'boundary', sceneTag: '流程终点', tooltip: '工作流的结束节点' },
];

const getNodeConfig = (type: string) => NODE_TYPES.find(n => n.type === type) || NODE_TYPES[0];

// ========== 带执行状态的节点组件 ==========
interface NodeProps {
  data: any;
  executionStatus?: NodeExecutionStatus;
  isBreakpoint?: boolean;
  onToggleBreakpoint?: () => void;
}

const BaseNode = ({ type, children, isConfigured, executionStatus, isBreakpoint, onToggleBreakpoint }: any) => {
  const config = getNodeConfig(type);
  const [isHovered, setIsHovered] = useState(false);

  // 根据执行状态确定样式
  const getStatusStyles = () => {
    switch (executionStatus) {
      case 'running':
        return {
          border: `2px solid ${config.color}`,
          boxShadow: `0 0 0 4px ${config.color}20, 0 0 20px ${config.color}40`,
          animation: 'nodePulse 2s ease-in-out infinite',
        };
      case 'success':
        return {
          border: `2px solid #52c41a`,
          boxShadow: `0 2px 8px #52c41a30`,
        };
      case 'failed':
        return {
          border: `2px solid #ff4d4f`,
          boxShadow: `0 2px 8px #ff4d4f30`,
        };
      default:
        return {
          border: isConfigured
            ? `2px solid ${config.color}`
            : `2px dashed ${isHovered ? config.color : '#d9d9d9'}`,
          boxShadow: isHovered
            ? `0 4px 16px ${config.color}30`
            : '0 1px 3px rgba(0,0,0,0.06)',
        };
    }
  };

  const statusStyles = getStatusStyles();

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px 14px',
        background: type === 'start' || type === 'end' ? config.color : '#fff',
        color: type === 'start' || type === 'end' ? 'white' : '#1f2937',
        borderRadius: '10px',
        minWidth: type === 'start' || type === 'end' ? '100px' : '140px',
        textAlign: 'center',
        transition: 'all 0.3s ease',
        position: 'relative',
        ...statusStyles,
      }}
    >
      {/* 执行状态指示器 */}
      {executionStatus === 'running' && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          zIndex: 10,
        }}>
          <Spin size="small" />
        </div>
      )}
      {executionStatus === 'success' && (
        <CheckCircleOutlined style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          color: '#52c41a',
          fontSize: '16px',
          background: '#fff',
          borderRadius: '50%',
          zIndex: 10,
        }} />
      )}
      {executionStatus === 'failed' && (
        <Tooltip title="执行失败">
          <ExclamationCircleOutlined style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            color: '#ff4d4f',
            fontSize: '16px',
            background: '#fff',
            borderRadius: '50%',
            zIndex: 10,
          }} />
        </Tooltip>
      )}

      {/* 配置状态指示器（仅在非运行状态显示） */}
      {!executionStatus && isConfigured && type !== 'start' && type !== 'end' && (
        <CheckCircleOutlined
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            color: '#52c41a',
            fontSize: '16px',
            background: '#fff',
            borderRadius: '50%',
          }}
        />
      )}
      {!executionStatus && !isConfigured && type !== 'start' && type !== 'end' && (
        <Tooltip title="点击右侧面板配置节点">
          <ExclamationCircleOutlined
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              color: '#faad14',
              fontSize: '16px',
              background: '#fff',
              borderRadius: '50%',
            }}
          />
        </Tooltip>
      )}

      {/* 断点标记 */}
      {onToggleBreakpoint && (
        <div
          onClick={(e) => { e.stopPropagation(); onToggleBreakpoint(); }}
          style={{
            position: 'absolute',
            top: '-8px',
            left: '-8px',
            cursor: 'pointer',
            zIndex: 10,
            opacity: isHovered || isBreakpoint ? 1 : 0,
            transition: 'opacity 0.2s',
          }}
        >
          <PauseOutlined
            style={{
              color: isBreakpoint ? '#ff4d4f' : '#bfbfbf',
              fontSize: '14px',
              background: '#fff',
              borderRadius: '50%',
              padding: '2px',
            }}
          />
        </div>
      )}

      {children}
    </div>
  );
};

const StartNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => (
  <BaseNode type="start" isConfigured={true} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
    <Handle type="source" position={Position.Bottom} style={{ background: '#52c41a', width: '10px', height: '10px' }} />
    <div style={{ fontWeight: 600, fontSize: '14px' }}>🚀 {data.label || '开始'}</div>
  </BaseNode>
);

const InputNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => (
  <BaseNode type="input" isConfigured={!!data.inputType} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
    <Handle type="target" position={Position.Top} style={{ background: '#1890ff', width: '10px', height: '10px' }} />
    <div style={{ fontWeight: 600, color: '#1890ff', fontSize: '14px' }}>📥 {data.label || '输入'}</div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#1890ff', width: '10px', height: '10px' }} />
  </BaseNode>
);

const LLMNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => (
  <BaseNode type="llm" isConfigured={!!data.model} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
    <Handle type="target" position={Position.Top} style={{ background: '#722ed1', width: '10px', height: '10px' }} />
    <div style={{ fontWeight: 600, color: '#722ed1', fontSize: '14px' }}>🤖 {data.label || '大模型'}</div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#722ed1', width: '10px', height: '10px' }} />
  </BaseNode>
);

const ConditionNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => {
  const conditions = data.conditions || [];
  return (
    <BaseNode type="condition" isConfigured={conditions.length > 0} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
      <Handle type="target" position={Position.Top} style={{ background: '#fa8c16', width: '10px', height: '10px' }} />
      <div style={{ fontWeight: 600, color: '#fa8c16', fontSize: '14px', marginBottom: '6px' }}>
        🔀 {data.label || '条件分支'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {conditions.map((cond: any, index: number) => (
          <div key={cond?.id || `cond_${index}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '2px 6px', background: '#fff7e6', borderRadius: '4px', fontSize: '11px'
          }}>
            <span style={{ color: '#fa8c16' }}>条件{index + 1}</span>
            <Handle type="source" position={Position.Right} id={cond?.id || `cond_${index}`}
              style={{ background: '#fa8c16', width: '8px', height: '8px', position: 'relative', right: '-6px' }} />
          </div>
        ))}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '2px 6px', background: '#f5f5f5', borderRadius: '4px', fontSize: '11px'
        }}>
          <span style={{ color: '#999' }}>默认</span>
          <Handle type="source" position={Position.Right} id="default"
            style={{ background: '#999', width: '8px', height: '8px', position: 'relative', right: '-6px' }} />
        </div>
      </div>
    </BaseNode>
  );
};

const CodeNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => (
  <BaseNode type="code" isConfigured={!!data.code} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
    <Handle type="target" position={Position.Top} style={{ background: '#13c2c2', width: '10px', height: '10px' }} />
    <div style={{ fontWeight: 600, color: '#13c2c2', fontSize: '14px' }}>💻 {data.label || '代码'}</div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#13c2c2', width: '10px', height: '10px' }} />
  </BaseNode>
);

const RAGNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => (
  <BaseNode type="rag" isConfigured={!!data.kbId} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
    <Handle type="target" position={Position.Top} style={{ background: '#2f54eb', width: '10px', height: '10px' }} />
    <div style={{ fontWeight: 600, color: '#2f54eb', fontSize: '14px' }}>📚 {data.label || '知识库检索'}</div>
    {data.kbName && <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{data.kbName}</div>}
    <Handle type="source" position={Position.Bottom} style={{ background: '#2f54eb', width: '10px', height: '10px' }} />
  </BaseNode>
);

const OutputNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => (
  <BaseNode type="output" isConfigured={!!data.template} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
    <Handle type="target" position={Position.Top} style={{ background: '#eb2f96', width: '10px', height: '10px' }} />
    <div style={{ fontWeight: 600, color: '#eb2f96', fontSize: '14px' }}>📤 {data.label || '输出'}</div>
    <Handle type="source" position={Position.Bottom} style={{ background: '#eb2f96', width: '10px', height: '10px' }} />
  </BaseNode>
);

const EndNode = ({ data, executionStatus, isBreakpoint, onToggleBreakpoint }: NodeProps) => (
  <BaseNode type="end" isConfigured={true} executionStatus={executionStatus} isBreakpoint={isBreakpoint} onToggleBreakpoint={onToggleBreakpoint}>
    <Handle type="target" position={Position.Top} style={{ background: '#ff4d4f', width: '10px', height: '10px' }} />
    <div style={{ fontWeight: 600, fontSize: '14px' }}>🏁 {data.label || '结束'}</div>
  </BaseNode>
);

// ========== 左侧组件面板 ==========
const DraggableNodeItem = ({ config, onAdd }: { config: NodeTypeConfig; onAdd: (type: string) => void }) => {
  const [isHovered, setIsHovered] = useState(false);

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', config.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  const isBoundary = config.category === 'boundary';
  const isHigh = config.category === 'high';

  return (
    <Tooltip title={config.tooltip} placement="right">
      <div
        draggable
        onDragStart={onDragStart}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: isBoundary ? '8px 12px' : '10px 12px',
          marginBottom: '6px',
          background: isHigh ? '#f6ffed' : '#fff',
          border: isHovered ? `1.5px solid ${config.color}` : '1.5px solid transparent',
          borderRadius: '8px',
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          transition: 'all 0.25s ease',
          boxShadow: isHovered ? `0 2px 8px ${config.color}25` : '0 1px 2px rgba(0,0,0,0.04)',
          transform: isHovered ? 'translateX(3px)' : 'translateX(0)',
          minHeight: isBoundary ? '36px' : '52px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <span style={{ fontSize: '20px', lineHeight: 1 }}>{config.icon}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontWeight: 600, color: '#1f2937', fontSize: '13px', lineHeight: 1.3 }}>{config.label}</span>
            {!isBoundary && (
              <span style={{ fontSize: '11px', color: '#8c8c8c', lineHeight: '1.2' }}>{config.sceneTag}</span>
            )}
          </div>
        </div>
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined style={{ color: config.color, fontSize: '14px' }} />}
          onClick={(e) => { e.stopPropagation(); onAdd(config.type); }}
          style={{ padding: '2px 4px', minWidth: 'auto', height: 'auto' }}
        />
      </div>
    </Tooltip>
  );
};

// ========== 主画布组件 ==========
const FlowCanvas = ({
  workflow, readOnly, workflowName, setWorkflowName, onBack, onSave, autoOpenPreview = false,
}: any) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { addParam } = useParamPool();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isInitializedRef = useRef(false);
  const hasUserInteractionRef = useRef(false);
  const isDirtyRef = useRef(false);
  const lastSavedSnapshotRef = useRef('');
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const workflowNameRef = useRef(workflowName);
  const onSaveRef = useRef(onSave);
  const isSavingRef = useRef(false);

  // 运行模式状态
  const [isRunningMode, setIsRunningMode] = useState(false);
  const [nodeExecutionStatuses, setNodeExecutionStatuses] = useState<Record<string, NodeExecutionStatus>>({});
  const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set());
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedNodeForData, setSelectedNodeForData] = useState<string | null>(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { workflowNameRef.current = workflowName; }, [workflowName]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // 初始化数据
  useEffect(() => {
    if (workflow?.graphData) {
      setNodes(workflow.graphData.nodes || []);
      setEdges(workflow.graphData.edges || []);
      setWorkflowName(workflow.workflowName);
    } else {
      setNodes([
        { id: 'start', type: 'start', position: { x: 250, y: 50 }, data: { label: '开始' } },
        { id: 'end', type: 'end', position: { x: 250, y: 400 }, data: { label: '结束' } },
      ]);
      setEdges([]);
    }
    isInitializedRef.current = true;
  }, [workflow?.workflowId, setNodes, setEdges, setWorkflowName]);

  const handleFitView = () => {
    fitView({ padding: 0.2, duration: 800 });
  };

  // 自动保存
  const autoSave = useCallback(async () => {
    if (readOnly || isSavingRef.current || !isDirtyRef.current) return;
    const graphData = { nodes: nodesRef.current, edges: edgesRef.current };
    const snapshot = JSON.stringify({ workflowName: workflowNameRef.current, graphData });
    if (snapshot === lastSavedSnapshotRef.current) { isDirtyRef.current = false; return; }

    isSavingRef.current = true; setIsSaving(true);
    try {
      await onSaveRef.current(workflowNameRef.current, graphData);
      lastSavedSnapshotRef.current = snapshot; isDirtyRef.current = false;
    } catch (error) { console.error('自动保存失败:', error); }
    finally { isSavingRef.current = false; setIsSaving(false); }
  }, [readOnly]);

  useEffect(() => {
    if (readOnly) return;
    if (!isInitializedRef.current || !hasUserInteractionRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    isDirtyRef.current = true;
    autoSaveTimerRef.current = setTimeout(() => autoSave(), 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [nodes, edges, workflowName, readOnly, autoSave]);

  const handleNodesChangeWithInteraction = useCallback((changes: any) => {
    const hasMeaningfulChange = Array.isArray(changes)
      ? changes.some((c: any) => c.type !== 'select' && c.type !== 'dimensions') : true;
    if (hasMeaningfulChange) hasUserInteractionRef.current = true;
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleEdgesChangeWithInteraction = useCallback((changes: any) => {
    const hasMeaningfulChange = Array.isArray(changes)
      ? changes.some((c: any) => c.type !== 'select') : true;
    if (hasMeaningfulChange) hasUserInteractionRef.current = true;
    onEdgesChange(changes);
  }, [onEdgesChange]);

  // 页面关闭前保存
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!readOnly && isDirtyRef.current) {
        e.preventDefault(); e.returnValue = '';
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        const graphData = { nodes, edges };
        const blob = new Blob([JSON.stringify({ workflowName, graphData })], { type: 'application/json' });
        navigator.sendBeacon?.(`${(api.defaults.baseURL || '').replace('/api', '')}/api/workflow/${workflow?.workflowId || 'draft'}`, blob);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [readOnly, nodes, edges, workflowName, workflow?.workflowId]);

  const onConnect = useCallback((params: Connection) => {
    hasUserInteractionRef.current = true;
    setEdges((eds) => addEdge({
      ...params,
      animated: true,
      type: 'smoothstep',
      style: { stroke: params.sourceHandle === 'default' ? '#bfbfbf' : '#52c41a', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    }, eds));
  }, [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;
    const position = screenToFlowPosition({
      x: event.clientX - (reactFlowWrapper.current?.getBoundingClientRect().left || 0),
      y: event.clientY - (reactFlowWrapper.current?.getBoundingClientRect().top || 0),
    });
    addNodeAtPosition(type, position);
  }, [screenToFlowPosition]);

  const addNodeAtPosition = (type: string, position: { x: number; y: number }) => {
    const config = getNodeConfig(type);
    const newNode = {
      id: `${type}_${Date.now()}`,
      type,
      position,
      data: { label: config.label },
    };
    hasUserInteractionRef.current = true;
    setNodes((nds) => nds.concat(newNode));
  };

  const handleAddNode = (type: string) => {
    const centerX = reactFlowWrapper.current ? reactFlowWrapper.current.clientWidth / 2 : 300;
    const centerY = reactFlowWrapper.current ? reactFlowWrapper.current.clientHeight / 2 : 200;
    const position = screenToFlowPosition({ x: centerX, y: centerY });
    position.x += (Math.random() - 0.5) * 60;
    position.y += (Math.random() - 0.5) * 60;
    addNodeAtPosition(type, position);
    message.success(`已添加「${getNodeConfig(type).label}」节点`);
  };

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (isRunningMode) {
      // 运行模式下点击节点查看数据
      setSelectedNodeForData(node.id);
    } else {
      // 编辑模式下点击节点配置
      setSelectedNode(node);
    }
  }, [isRunningMode]);

  const handleUpdateNode = useCallback((nodeId: string, newData: any) => {
    hasUserInteractionRef.current = true;
    setNodes((nds) => nds.map((node) => {
      if (node.id === nodeId) return { ...node, data: { ...node.data, ...newData } };
      return node;
    }));
    setSelectedNode((prev) => {
      if (prev && prev.id === nodeId) return { ...prev, data: { ...prev.data, ...newData } };
      return prev;
    });
  }, [setNodes]);

  const handleSave = async () => {
    try {
      const graphData = { nodes, edges };
      await onSave(workflowName, graphData);
      lastSavedSnapshotRef.current = JSON.stringify({ workflowName, graphData });
      isDirtyRef.current = false;
      message.success('保存成功');
    } catch (error) {
      message.error('保存失败');
    }
  };

  // 运行相关
  useEffect(() => { if (autoOpenPreview) setPreviewVisible(true); }, [autoOpenPreview]);

  const handleDemo = () => {
    setPreviewVisible(true);
    setIsRunningMode(true);
    // 重置所有节点状态
    setNodeExecutionStatuses({});
    setSelectedNodeForData(null);
  };

  const handleStop = () => {
    setIsRunningMode(false);
    setNodeExecutionStatuses({});
    setSelectedNodeForData(null);
  };

  const handleNodeStatusChange = useCallback((nodeId: string, status: NodeExecutionStatus) => {
    setNodeExecutionStatuses(prev => ({ ...prev, [nodeId]: status }));
  }, []);

  const handleNodeClickFromPreview = useCallback((nodeId: string) => {
    setSelectedNodeForData(nodeId);
    // 高亮画布上的节点
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
    }
  }, [nodes]);

  const toggleBreakpoint = useCallback((nodeId: string) => {
    setBreakpoints(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  // 收集节点参数到参数池
  useEffect(() => {
    nodes.forEach(node => {
      if (node.type === 'input') {
        addParam({
          id: `user_input_${node.id}`,
          label: `用户输入 (来自${node.data?.label || '输入'})`,
          type: (node.data.inputType === 'number' ? 'number' : 'string') as any,
          source: '输入节点',
          description: `来自${node.data?.label || '输入'}节点`,
        });
      }
      if (node.type === 'llm') {
        addParam({
          id: `llm_output_${node.id}`,
          label: `大模型输出 (来自${node.data?.label || '大模型'})`,
          type: 'string',
          source: '大模型节点',
          description: `来自${node.data?.label || '大模型'}节点`,
        });
      }
      if (node.type === 'code') {
        (node.data?.outputVars || []).forEach((outputVar: any) => {
          if (outputVar.name) {
            addParam({
              id: outputVar.name,
              label: `${outputVar.name} (来自${node.data?.label || '代码节点'})`,
              type: (outputVar.type?.toLowerCase() || 'object') as any,
              source: '代码节点',
              description: `代码节点输出参数`,
            });
          }
        });
      }
      if (node.type === 'rag') {
        const outputVar = node.data?.outputVar || 'retrieved_result';
        addParam({
          id: outputVar,
          label: `${outputVar} (来自${node.data?.label || '知识库检索'})`,
          type: 'object',
          source: '知识库检索',
          description: `RAG 检索结果`,
        });
      }
    });
  }, [nodes, addParam]);

  // 自定义节点组件，注入执行状态
  const nodeTypeComponents = {
    start: (props: any) => <StartNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
    input: (props: any) => <InputNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
    llm: (props: any) => <LLMNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
    condition: (props: any) => <ConditionNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
    code: (props: any) => <CodeNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
    rag: (props: any) => <RAGNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
    output: (props: any) => <OutputNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
    end: (props: any) => <EndNode {...props} executionStatus={nodeExecutionStatuses[props.id]} isBreakpoint={breakpoints.has(props.id)} onToggleBreakpoint={() => toggleBreakpoint(props.id)} />,
  };

  // 根据执行状态更新连线样式
  const getEdgeStyle = (edge: Edge) => {
    const sourceStatus = nodeExecutionStatuses[edge.source];
    const targetStatus = nodeExecutionStatuses[edge.target];

    if (targetStatus === 'running') {
      return { stroke: '#1890ff', strokeWidth: 3, animation: 'edgeFlow 1s linear infinite' };
    }
    if (sourceStatus === 'success' && (targetStatus === 'success' || targetStatus === 'idle')) {
      return { stroke: '#52c41a', strokeWidth: 2 };
    }
    if (sourceStatus === 'failed' || targetStatus === 'failed') {
      return { stroke: '#ff4d4f', strokeWidth: 2 };
    }
    return { stroke: '#bfbfbf', strokeWidth: 1, strokeDasharray: '5,5' };
  };

  const highFreqNodes = NODE_TYPES.filter(n => n.category === 'high');
  const lowFreqNodes = NODE_TYPES.filter(n => n.category === 'low');
  const boundaryNodes = NODE_TYPES.filter(n => n.category === 'boundary');

  return (
    <Layout style={{ height: '100vh' }}>
      {/* 顶部工具栏 */}
      <Header style={{
        display: 'flex', alignItems: 'center', background: '#001529',
        padding: '0 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 100,
      }}>
        {onBack && (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ color: 'white', marginRight: 12 }} />
        )}
        {readOnly ? (
          <div style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{workflowName}</div>
        ) : (
          <Input value={workflowName}
            onChange={(e) => { hasUserInteractionRef.current = true; setWorkflowName(e.target.value); }}
            style={{ width: 280, background: 'transparent', border: 'none', color: 'white', fontSize: 18, fontWeight: 'bold' }}
            placeholder="工作流名称" />
        )}

        {/* 运行模式指示器 */}
        {isRunningMode && (
          <Badge
            status="processing"
            text={<span style={{ color: '#52c41a', fontWeight: 600 }}>运行模式</span>}
            style={{ marginLeft: 16 }}
          />
        )}

        <Space style={{ marginLeft: 'auto' }} size="middle">
          {!readOnly && (
            <Tooltip title={isDirtyRef.current ? '有未保存的更改' : '已自动保存'}>
              <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} loading={isSaving}>
                {isSaving ? '保存中' : isDirtyRef.current ? '保存' : '已保存'}
              </Button>
            </Tooltip>
          )}

          {isRunningMode ? (
            <Button
              icon={<StopOutlined />}
              danger
              onClick={handleStop}
              style={{ color: '#ff4d4f', borderColor: '#ff4d4f' }}
            >
              停止
            </Button>
          ) : (
            <Button icon={<PlayCircleOutlined />} type="primary" ghost onClick={handleDemo}
              style={{ color: '#40a9ff', borderColor: '#40a9ff' }}>运行</Button>
          )}

          <Button icon={<CompressOutlined />} onClick={handleFitView}
            style={{ color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}>
            居中
          </Button>
        </Space>
      </Header>

      <Layout>
        {/* 左侧组件面板 */}
        <Sider width={200} style={{ background: '#fafafa', borderRight: '1px solid #e8e8e8', padding: '12px', overflow: 'auto' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#1f2937', fontWeight: 600, fontSize: '14px' }}>组件库</h4>

          {/* 高频组件 */}
          <div style={{ marginBottom: '8px' }}>
            {highFreqNodes.map(config => (
              <DraggableNodeItem key={config.type} config={config} onAdd={handleAddNode} />
            ))}
          </div>

          {/* 低频组件 */}
          <div style={{ marginBottom: '8px', paddingTop: '8px', borderTop: '1px dashed #e8e8e8' }}>
            {lowFreqNodes.map(config => (
              <DraggableNodeItem key={config.type} config={config} onAdd={handleAddNode} />
            ))}
          </div>

          {/* 边界组件 */}
          <div style={{ paddingTop: '8px', borderTop: '1px dashed #e8e8e8' }}>
            {boundaryNodes.map(config => (
              <DraggableNodeItem key={config.type} config={config} onAdd={handleAddNode} />
            ))}
          </div>
        </Sider>

        {/* 画布区域 */}
        <Content style={{ background: '#f5f7fa', position: 'relative' }}>
          <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges.map(edge => ({
                ...edge,
                style: getEdgeStyle(edge),
                animated: nodeExecutionStatuses[edge.target] === 'running',
              }))}
              onNodesChange={handleNodesChangeWithInteraction}
              onEdgesChange={handleEdgesChangeWithInteraction}
              onConnect={onConnect}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypeComponents}
              fitView
              snapToGrid
              snapGrid={[15, 15]}
              nodesDraggable={!isRunningMode}
              nodesConnectable={!isRunningMode}
              elementsSelectable={true}
              defaultEdgeOptions={{
                type: 'smoothstep',
                animated: true,
                style: { strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
              }}
            >
              <Background gap={20} size={1} color="#e8e8e8" style={{ opacity: 0.5 }} />
              <Controls style={{ bottom: 80, left: 16 }} />
              <MiniMap
                style={{ bottom: 16, right: 16, background: 'rgba(255,255,255,0.9)', borderRadius: 8 }}
                nodeStrokeWidth={3}
                nodeColor={(n) => {
                  const status = nodeExecutionStatuses[n.id];
                  if (status === 'success') return '#52c41a';
                  if (status === 'failed') return '#ff4d4f';
                  if (status === 'running') return '#1890ff';
                  return getNodeConfig(n.type || '').color;
                }}
                maskColor="rgba(0,0,0,0.05)"
              />
            </ReactFlow>
          </div>

          {/* CSS 动画 */}
          <style>{`
            @keyframes nodePulse {
              0%, 100% { box-shadow: 0 0 0 4px rgba(24, 144, 255, 0.1), 0 0 20px rgba(24, 144, 255, 0.2); }
              50% { box-shadow: 0 0 0 8px rgba(24, 144, 255, 0.15), 0 0 30px rgba(24, 144, 255, 0.3); }
            }
            @keyframes edgeFlow {
              0% { stroke-dashoffset: 0; }
              100% { stroke-dashoffset: -20; }
            }
          `}</style>
        </Content>

        {/* 右侧属性面板 */}
        <Sider width={340} style={{ background: '#fff', borderLeft: '1px solid #e8e8e8', overflow: 'auto' }}>
          {isRunningMode ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>▶️</div>
              <h4 style={{ color: '#1f2937', marginBottom: '8px', fontWeight: 600 }}>运行模式</h4>
              <p style={{ color: '#8c8c8c', fontSize: '14px', marginBottom: '24px' }}>
                点击画布上的节点查看执行数据
              </p>
              <div style={{ padding: '16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '8px', textAlign: 'left' }}>
                <p style={{ margin: '0 0 8px 0', color: '#52c41a', fontWeight: 600, fontSize: '13px' }}>💡 提示</p>
                <p style={{ margin: 0, color: '#4b5563', fontSize: '13px', lineHeight: '1.6' }}>
                  右侧运行面板显示详细日志和进度。点击节点可查看输入/输出数据。
                </p>
              </div>
            </div>
          ) : (
            <NodeConfigPanel selectedNode={selectedNode} onUpdateNode={handleUpdateNode} />
          )}
        </Sider>
      </Layout>

      <WorkflowPreview
        visible={previewVisible}
        onClose={() => {
          setPreviewVisible(false);
          setIsRunningMode(false);
          setNodeExecutionStatuses({});
        }}
        nodes={nodes}
        edges={edges}
        workflowName={workflowName}
        isRunningMode={isRunningMode}
        onRunningModeChange={setIsRunningMode}
        onNodeStatusChange={handleNodeStatusChange}
        onNodeClick={handleNodeClickFromPreview}
        selectedNodeId={selectedNodeForData}
      />
    </Layout>
  );
};

// ========== 主组件 ==========
const WorkflowEditor: FC<WorkflowEditorProps> = ({ workflow: initialWorkflow, onBack, readOnly = false, autoOpenPreview = false }) => {
  const [workflow, setWorkflow] = useState<Workflow | null>(initialWorkflow || null);
  const [workflowName, setWorkflowName] = useState(initialWorkflow?.workflowName || '新工作流');

  const handleSave = async (name: string, graphData: any) => {
    try {
      if (workflow) {
        await workflowApi.update(workflow.workflowId, { workflowName: name, graphData });
        message.success('工作流已更新！');
      } else {
        const newWorkflow = await workflowApi.create({ workflowName: name, graphData });
        setWorkflow(newWorkflow);
        message.success('工作流已创建！');
      }
    } catch (error) {
      message.error('保存失败');
      throw error;
    }
  };

  return (
    <ParamPoolProvider>
      <ReactFlowProvider>
        <FlowCanvas
          workflow={workflow}
          readOnly={readOnly}
          workflowName={workflowName}
          setWorkflowName={setWorkflowName}
          onBack={onBack}
          onSave={handleSave}
          autoOpenPreview={autoOpenPreview}
        />
      </ReactFlowProvider>
    </ParamPoolProvider>
  );
};

export default WorkflowEditor;
