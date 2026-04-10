import React, { useCallback, useRef, useState, useEffect } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Layout, Button, Space, message, Input } from 'antd';
import { PlusOutlined, SaveOutlined, PlayCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { workflowApi } from '../api';
import type { Workflow } from '../types';

const { Header, Content, Sider } = Layout;

interface SimpleWorkflowEditorProps {
  workflow?: Workflow | null;
  onBack?: () => void;
}

const StartNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#52c41a', 
      color: 'white', 
      borderRadius: '8px', 
      minWidth: '120px', 
      textAlign: 'center' 
    }}>
      <Handle type="source" position={Position.Bottom} />
      {data.label || '开始'}
    </div>
  );
};

const EndNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#ff4d4f', 
      color: 'white', 
      borderRadius: '8px', 
      minWidth: '120px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} />
      {data.label || '结束'}
    </div>
  );
};

const DefaultNode = ({ data }: any) => {
  return (
    <div style={{ 
      padding: '10px', 
      background: '#e6f7ff', 
      border: '2px solid #1890ff', 
      borderRadius: '8px', 
      minWidth: '120px', 
      textAlign: 'center' 
    }}>
      <Handle type="target" position={Position.Top} />
      {data.label || '节点'}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  default: DefaultNode,
};

const initialNodes = [
  {
    id: '1',
    type: 'start',
    position: { x: 250, y: 20 },
    data: { label: '开始' },
  },
  {
    id: '2',
    type: 'default',
    position: { x: 250, y: 120 },
    data: { label: '处理节点' },
  },
  {
    id: '3',
    type: 'end',
    position: { x: 250, y: 220 },
    data: { label: '结束' },
  },
];

const initialEdges = [
  { 
    id: 'e1-2', 
    source: '1', 
    target: '2', 
    animated: true, 
    markerEnd: { type: MarkerType.ArrowClosed } 
  },
  { 
    id: 'e2-3', 
    source: '2', 
    target: '3', 
    animated: true, 
    markerEnd: { type: MarkerType.ArrowClosed } 
  },
];

const SimpleWorkflowEditor: React.FC<SimpleWorkflowEditorProps> = ({ workflow, onBack }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [workflowName, setWorkflowName] = useState(workflow?.workflowName || '新工作流');

  useEffect(() => {
    if (workflow?.graphData) {
      setNodes(workflow.graphData.nodes || []);
      setEdges(workflow.graphData.edges || []);
      setWorkflowName(workflow.workflowName);
    }
  }, [workflow, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      markerEnd: { type: MarkerType.ArrowClosed } 
    }, eds)),
    [setEdges]
  );

  const handleAddNode = () => {
    const newNode = {
      id: `node_${Date.now()}`,
      type: 'default',
      position: { x: 250, y: 150 },
      data: { label: '新节点' },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleSave = async () => {
    try {
      const graphData = { nodes, edges };
      if (workflow) {
        await workflowApi.update(workflow.workflowId, {
          workflowName,
          graphData,
        });
        message.success('工作流已更新！');
      } else {
        await workflowApi.create({
          workflowName,
          graphData,
        });
        message.success('工作流已保存！');
      }
    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleDemo = async () => {
    if (!workflow) {
      message.warning('请先保存工作流');
      return;
    }
    try {
      await workflowApi.demo(workflow.workflowId, {});
      message.success('演示已启动！');
    } catch (error) {
      message.error('演示启动失败');
    }
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
        <Input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          style={{ width: 300, background: 'transparent', border: 'none', color: 'white', fontSize: 20, fontWeight: 'bold' }}
          placeholder="工作流名称"
        />
        <Space style={{ marginLeft: 'auto' }}>
          <Button icon={<PlusOutlined />} onClick={handleAddNode}>添加节点</Button>
          <Button icon={<SaveOutlined />} type="primary" onClick={handleSave}>保存</Button>
          <Button icon={<PlayCircleOutlined />} type="success" onClick={handleDemo}>演示</Button>
        </Space>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}>
          <div style={{ padding: '16px' }}>
            <h3>组件库</h3>
            <div style={{ marginTop: '16px' }}>
              <div style={{ padding: '8px', marginBottom: '8px', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer' }}>开始节点</div>
              <div style={{ padding: '8px', marginBottom: '8px', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer' }}>输入节点</div>
              <div style={{ padding: '8px', marginBottom: '8px', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer' }}>大模型节点</div>
              <div style={{ padding: '8px', marginBottom: '8px', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer' }}>条件分支节点</div>
              <div style={{ padding: '8px', marginBottom: '8px', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer' }}>代码节点</div>
              <div style={{ padding: '8px', marginBottom: '8px', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer' }}>输出节点</div>
              <div style={{ padding: '8px', marginBottom: '8px', background: '#f0f0f0', borderRadius: '4px', cursor: 'pointer' }}>结束节点</div>
            </div>
          </div>
        </Sider>
        <Content style={{ background: '#f0f2f5' }}>
          <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              nodeTypes={nodeTypes}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
        </Content>
        <Sider width={300} style={{ background: '#fff', borderLeft: '1px solid #f0f0f0' }}>
          <div style={{ padding: '16px' }}>
            <h3>节点配置</h3>
            <div style={{ marginTop: '16px', color: '#999' }}>请选择一个节点进行配置</div>
          </div>
        </Sider>
      </Layout>
    </Layout>
  );
};

export default SimpleWorkflowEditor;
