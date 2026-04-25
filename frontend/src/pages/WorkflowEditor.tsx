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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Layout, Button, Space, message, Input } from 'antd';
import { SaveOutlined, PlayCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { workflowApi } from '../api';
import type { Workflow } from '../types';
import NodeConfigPanel from '../components/NodeConfig';
import { ParamPoolProvider, useParamPool } from '../contexts/ParamPoolContext';
import WorkflowPreview from '../components/WorkflowPreview';

const { Header, Content, Sider } = Layout;

interface WorkflowEditorProps {
  workflow?: Workflow | null;
  onBack?: () => void;
  readOnly?: boolean;
  autoOpenPreview?: boolean;
}

// 节点类型定义（用于React Flow）
const nodeTypeMap = {
  start: 'start',
  input: 'input',
  llm: 'llm',
  condition: 'condition',
  code: 'code',
  rag: 'rag',
  output: 'output',
  end: 'end',
};

// 节点组件 - 开始节点
const StartNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#52c41a', 
      color: 'white', 
      borderRadius: '8px', 
      minWidth: '120px', 
      textAlign: 'center',
      border: '2px solid #52c41a'
    }}>
      <Handle type="source" position={Position.Bottom} style={{ background: '#52c41a' }} />
      <div style={{ fontWeight: 'bold' }}>🚀 {data.label || '开始'}</div>
    </div>
  );
};

// 节点组件 - 输入节点
const InputNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#fff', 
      border: '2px solid #1890ff', 
      borderRadius: '8px', 
      minWidth: '140px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#1890ff' }} />
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>📥 {data.label || '输入'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#1890ff' }} />
    </div>
  );
};

// 节点组件 - 大模型节点
const LLMNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#fff', 
      border: '2px solid #722ed1', 
      borderRadius: '8px', 
      minWidth: '140px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#722ed1' }} />
      <div style={{ fontWeight: 'bold', color: '#722ed1' }}>🤖 {data.label || '大模型'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#722ed1' }} />
    </div>
  );
};

// 节点组件 - 条件分支节点
const ConditionNode = ({ data }: any) => {
  const conditions = data.conditions || [];
  // const totalBranches = conditions.length + 1; // 条件分支 + 默认分支 (暂不使用)

  return (
    <div style={{ 
      padding: '10px', 
      background: '#fff', 
      border: '2px solid #fa8c16', 
      borderRadius: '8px', 
      minWidth: '180px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#fa8c16' }} />
      <div style={{ fontWeight: 'bold', color: '#fa8c16', marginBottom: '8px' }}>
        🔀 {data.label || '条件分支'}
      </div>
      
      {/* 动态生成条件分支连接点 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
        {conditions.map((cond: any, index: number) => (
          <div key={cond?.id || `cond_${index}`} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            padding: '2px 4px',
            background: '#fff7e6',
            borderRadius: '4px',
            fontSize: '11px'
          }}>
            <span style={{ color: '#fa8c16' }}>条件{index + 1}</span>
            <Handle 
              type="source" 
              position={Position.Right} 
              id={cond?.id || `cond_${index}`}
              style={{ 
                background: '#fa8c16', 
                width: '8px', 
                height: '8px',
                position: 'relative',
                right: '-4px'
              }} 
            />
          </div>
        ))}
        
        {/* 默认分支 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '2px 4px',
          background: '#f5f5f5',
          borderRadius: '4px',
          fontSize: '11px'
        }}>
          <span style={{ color: '#999' }}>默认</span>
          <Handle 
            type="source" 
            position={Position.Right} 
            id="default"
            style={{ 
              background: '#999', 
              width: '8px', 
              height: '8px',
              position: 'relative',
              right: '-4px'
            }} 
          />
        </div>
      </div>
    </div>
  );
};

// 节点组件 - 代码节点
const CodeNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#fff', 
      border: '2px solid #13c2c2', 
      borderRadius: '8px', 
      minWidth: '140px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#13c2c2' }} />
      <div style={{ fontWeight: 'bold', color: '#13c2c2' }}>💻 {data.label || '代码'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#13c2c2' }} />
    </div>
  );
};

// 节点组件 - RAG 知识库检索节点
const RAGNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#fff', 
      border: '2px solid #2f54eb', 
      borderRadius: '8px', 
      minWidth: '160px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#2f54eb' }} />
      <div style={{ fontWeight: 'bold', color: '#2f54eb' }}>📚 {data.label || '知识库检索'}</div>
      {data.kbName && (
        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
          {data.kbName}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#2f54eb' }} />
    </div>
  );
};

// 节点组件 - 输出节点
const OutputNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#fff', 
      border: '2px solid #eb2f96', 
      borderRadius: '8px', 
      minWidth: '140px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#eb2f96' }} />
      <div style={{ fontWeight: 'bold', color: '#eb2f96' }}>📤 {data.label || '输出'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#eb2f96' }} />
    </div>
  );
};

// 节点组件 - 结束节点
const EndNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#ff4d4f', 
      color: 'white', 
      borderRadius: '8px', 
      minWidth: '120px', 
      textAlign: 'center',
      border: '2px solid #ff4d4f'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#ff4d4f' }} />
      <div style={{ fontWeight: 'bold' }}>🏁 {data.label || '结束'}</div>
    </div>
  );
};

const nodeTypeComponents = {
  start: StartNode,
  input: InputNode,
  llm: LLMNode,
  condition: ConditionNode,
  code: CodeNode,
  rag: RAGNode,
  output: OutputNode,
  end: EndNode,
};

// 侧边栏可拖拽节点组件
const DraggableNode = ({ type, label, icon, color }: { type: string; label: string; icon: string; color: string }) => {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        padding: '12px',
        marginBottom: '8px',
        background: '#fff',
        border: `2px solid ${color}`,
        borderRadius: '8px',
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f0f0f0';
        e.currentTarget.style.transform = 'translateX(4px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#fff';
        e.currentTarget.style.transform = 'translateX(0)';
      }}
    >
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <span style={{ fontWeight: 500, color }}>{label}</span>
    </div>
  );
};

// React Flow 画布组件
const FlowCanvas = ({
  workflow,
  readOnly,
  workflowName,
  setWorkflowName,
  onBack,
  onSave,
  autoOpenPreview = false,
}: any) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { project } = useReactFlow();
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

  // 同步 ref 值
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    workflowNameRef.current = workflowName;
  }, [workflowName]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // 初始化数据
  useEffect(() => {
    if (workflow?.graphData) {
      setNodes(workflow.graphData.nodes || []);
      setEdges(workflow.graphData.edges || []);
      setWorkflowName(workflow.workflowName);
    } else {
      // 默认添加开始和结束节点
      setNodes([
        {
          id: 'start',
          type: 'start',
          position: { x: 250, y: 50 },
          data: { label: '开始' },
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 250, y: 400 },
          data: { label: '结束' },
        },
      ]);
      setEdges([]);
    }
    // 标记初始化完成
    isInitializedRef.current = true;
  }, [workflow?.workflowId, setNodes, setEdges, setWorkflowName]);

  // 使用 ref 来跟踪保存状态，避免循环依赖
  const isSavingRef = useRef(false);

  // 自动保存功能 - 仅在有实质变更(dirty)时保存
  const autoSave = useCallback(async () => {
    if (readOnly || isSavingRef.current || !isDirtyRef.current) return;

    const graphData = { nodes: nodesRef.current, edges: edgesRef.current };
    const snapshot = JSON.stringify({
      workflowName: workflowNameRef.current,
      graphData,
    });

    // 快照未变化则不保存，避免“过一会儿自动保存一次”
    if (snapshot === lastSavedSnapshotRef.current) {
      isDirtyRef.current = false;
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSaveRef.current(workflowNameRef.current, graphData);
      lastSavedSnapshotRef.current = snapshot;
      isDirtyRef.current = false;
      console.log('自动保存成功');
    } catch (error) {
      console.error('自动保存失败:', error);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [readOnly]);

  // 监听节点、边、名称变化，触发自动保存
  useEffect(() => {
    if (readOnly) return;

    // 只有在初始化完成后且有用户交互时才触发自动保存
    if (!isInitializedRef.current || !hasUserInteractionRef.current) {
      return;
    }

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 设置新的定时器，10秒后自动保存（减少保存频率）
    autoSaveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 10000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
    // 注意：不将 autoSave 加入依赖数组，避免循环触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, workflowName, readOnly]);

  // 标记用户交互的回调包装器
  const handleNodesChangeWithInteraction = useCallback((changes: any) => {
    // 忽略纯选中类变化，避免无实质改动也触发自动保存
    const hasMeaningfulChange = Array.isArray(changes)
      ? changes.some((c: any) => c.type !== 'select' && c.type !== 'dimensions')
      : true;

    if (hasMeaningfulChange) {
      hasUserInteractionRef.current = true;
      isDirtyRef.current = true;
    }

    onNodesChange(changes);
  }, [onNodesChange]);

  const handleEdgesChangeWithInteraction = useCallback((changes: any) => {
    const hasMeaningfulChange = Array.isArray(changes)
      ? changes.some((c: any) => c.type !== 'select')
      : true;

    if (hasMeaningfulChange) {
      hasUserInteractionRef.current = true;
      isDirtyRef.current = true;
    }

    onEdgesChange(changes);
  }, [onEdgesChange]);

  // 页面关闭前保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!readOnly && autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSave();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [autoSave, readOnly]);

  const onConnect = useCallback(
    (params: Connection) => {
      hasUserInteractionRef.current = true;
      isDirtyRef.current = true;
      setEdges((eds) => addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = project({
        x: event.clientX - (reactFlowWrapper.current?.getBoundingClientRect().left || 0),
        y: event.clientY - (reactFlowWrapper.current?.getBoundingClientRect().top || 0),
      });

      const newNode = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: { label: getNodeLabel(type) },
      };

      hasUserInteractionRef.current = true;
      isDirtyRef.current = true;
      setNodes((nds) => nds.concat(newNode));
    },
    [project, setNodes]
  );

  const getNodeLabel = (type: string) => {
    const labels: Record<string, string> = {
      start: '开始',
      input: '输入',
      llm: '大模型',
      condition: '条件分支',
      code: '代码',
      rag: '知识库检索',
      output: '输出',
      end: '结束',
    };
    return labels[type] || '节点';
  };

  // 收集节点参数到参数池
  useEffect(() => {
    // 收集节点参数
    nodes.forEach(node => {
      // 输入节点：每个输入节点有独立的参数
      if (node.type === 'input') {
        const paramType = node.data.inputType === 'number' ? 'number' : 'string';
        const nodeLabel = node.data?.label || '输入';
        addParam({
          id: `user_input_${node.id}`,
          label: `用户输入 (来自${nodeLabel})`,
          type: paramType as any,
          source: '输入节点',
          description: `来自${nodeLabel}节点 (ID: ${node.id})`,
        });
      }

      // 大模型节点：每个大模型节点有独立的参数
      if (node.type === 'llm') {
        const nodeLabel = node.data?.label || '大模型';
        addParam({
          id: `llm_output_${node.id}`,
          label: `大模型输出 (来自${nodeLabel})`,
          type: 'string',
          source: '大模型节点',
          description: `来自${nodeLabel}节点 (ID: ${node.id})`,
        });
      }
      
      // 代码节点：收集用户自定义的输出参数
      if (node.type === 'code') {
        const outputVars = node.data?.outputVars || [];
        outputVars.forEach((outputVar: any) => {
          if (outputVar.name) {
            addParam({
              id: outputVar.name,
              label: `${outputVar.name} (来自${node.data?.label || '代码节点'})`,
              type: (outputVar.type?.toLowerCase() || 'object') as any,
              source: '代码节点',
              description: `代码节点 ${node.data?.label || node.id} 的输出参数`,
            });
          }
        });
      }

      // RAG 节点：收集检索结果参数
      if (node.type === 'rag') {
        const outputVar = node.data?.outputVar || 'retrieved_result';
        addParam({
          id: outputVar,
          label: `${outputVar} (来自${node.data?.label || '知识库检索'})`,
          type: 'object',
          source: '知识库检索',
          description: `RAG 节点 ${node.data?.label || node.id} 的检索结果`,
        });
      }
    });
  }, [nodes, addParam]);

  const handleSave = async () => {
    try {
      const graphData = { nodes, edges };
      await onSave(workflowName, graphData);
      lastSavedSnapshotRef.current = JSON.stringify({ workflowName, graphData });
      isDirtyRef.current = false;
    } catch (error) {
      message.error('保存失败');
    }
  };

  // 节点点击事件
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // 更新节点数据
  const handleUpdateNode = useCallback((nodeId: string, newData: any) => {
    hasUserInteractionRef.current = true;
    isDirtyRef.current = true;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, ...newData },
          };
        }
        return node;
      })
    );
    // 更新选中的节点
    setSelectedNode((prev) => {
      if (prev && prev.id === nodeId) {
        return { ...prev, data: { ...prev.data, ...newData } };
      }
      return prev;
    });
  }, [setNodes]);

  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    if (autoOpenPreview) {
      setPreviewVisible(true);
    }
  }, [autoOpenPreview]);

  const handleDemo = () => {
    setPreviewVisible(true);
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', background: '#001529', padding: '0 24px' }}>
        {onBack && (
          <Button 
            type="text" 
            icon={<ArrowLeftOutlined />} 
            onClick={onBack}
            style={{ color: 'white', marginRight: 16 }}
          />
        )}
        {readOnly ? (
          <div style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>
            {workflowName}
          </div>
        ) : (
          <Input
            value={workflowName}
            onChange={(e) => {
              hasUserInteractionRef.current = true;
              isDirtyRef.current = true;
              setWorkflowName(e.target.value);
            }}
            style={{ width: 300, background: 'transparent', border: 'none', color: 'white', fontSize: 20, fontWeight: 'bold' }}
            placeholder="工作流名称"
          />
        )}
        <Space style={{ marginLeft: 'auto' }}>
          {!readOnly && (
            <Button 
              icon={<SaveOutlined />} 
              type="primary" 
              onClick={handleSave}
              loading={isSaving}
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
          )}
          <Button icon={<PlayCircleOutlined />} onClick={handleDemo}>演示</Button>
        </Space>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: '#f5f5f5', borderRight: '1px solid #e8e8e8', padding: '16px' }}>
          <h3 style={{ marginBottom: '16px', color: '#333' }}>组件库</h3>
          <div style={{ marginTop: '16px' }}>
            <DraggableNode type="start" label="开始节点" icon="🚀" color="#52c41a" />
            <DraggableNode type="input" label="输入节点" icon="📥" color="#1890ff" />
            <DraggableNode type="llm" label="大模型节点" icon="🤖" color="#722ed1" />
            <DraggableNode type="condition" label="条件分支" icon="🔀" color="#fa8c16" />
            <DraggableNode type="code" label="代码节点" icon="💻" color="#13c2c2" />
            <DraggableNode type="rag" label="知识库检索" icon="📚" color="#2f54eb" />
            <DraggableNode type="output" label="输出节点" icon="📤" color="#eb2f96" />
            <DraggableNode type="end" label="结束节点" icon="🏁" color="#ff4d4f" />
          </div>
          <div style={{ marginTop: '24px', padding: '12px', background: '#fff', borderRadius: '8px', fontSize: '12px', color: '#666' }}>
            <p style={{ margin: 0 }}>💡 提示：拖拽组件到画布</p>
          </div>
        </Sider>
        <Content style={{ background: '#f0f2f5' }}>
          <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChangeWithInteraction}
              onEdgesChange={handleEdgesChangeWithInteraction}
              onConnect={onConnect}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypeComponents}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
        </Content>
        <Sider width={320} style={{ background: '#fff', borderLeft: '1px solid #e8e8e8', overflow: 'auto' }}>
          <NodeConfigPanel selectedNode={selectedNode} onUpdateNode={handleUpdateNode} />
        </Sider>
      </Layout>
      <WorkflowPreview
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        nodes={nodes}
        edges={edges}
        workflowName={workflowName}
      />
    </Layout>
  );
};

// 主组件
const WorkflowEditor: FC<WorkflowEditorProps> = ({ workflow: initialWorkflow, onBack, readOnly = false, autoOpenPreview = false }) => {
  const [workflow, setWorkflow] = useState<Workflow | null>(initialWorkflow || null);
  const [workflowName, setWorkflowName] = useState(initialWorkflow?.workflowName || '新工作流');

  const handleSave = async (name: string, graphData: any) => {
    try {
      if (workflow) {
        // 更新已有工作流
        await workflowApi.update(workflow.workflowId, {
          workflowName: name,
          graphData,
        });
        message.success('工作流已更新！');
      } else {
        // 创建新工作流
        const newWorkflow = await workflowApi.create({
          workflowName: name,
          graphData,
        });
        // 保存新工作流到状态，以便后续可以更新
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
