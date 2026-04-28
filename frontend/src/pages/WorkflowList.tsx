import { useState, useEffect, useRef, type FC } from 'react';
import {
  Table,
  Button,
  Space,
  Popconfirm,
  Modal,
  Form,
  Input,
  message,
  Card,
  Row,
  Col,
  Statistic,
  Skeleton,
  Empty,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  BookOutlined,
  NodeIndexOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { workflowApi } from '../api';
import type { Workflow } from '../types';

interface WorkflowListProps {
  onEdit: (workflow: Workflow) => void;
  onView: (workflow: Workflow) => void;
  onDemo: (workflow: Workflow) => void;
}

const WorkflowList: FC<WorkflowListProps> = ({ onEdit, onView, onDemo }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchWorkflows = async () => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    try {
      const data = await workflowApi.list();
      // 检查组件是否仍然挂载（请求未被取消）
      if (!abortController.signal.aborted) {
        setWorkflows(data || []);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('请求已取消');
        return;
      }
      if (!abortController.signal.aborted) {
        message.error('获取工作流列表失败: ' + (error.message || '未知错误'));
      }
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchWorkflows();
    // 组件卸载时取消请求
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCreate = async (values: { workflowName: string; description?: string }) => {
    try {
      await workflowApi.create(values);
      message.success('创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      fetchWorkflows();
    } catch (error: any) {
      message.error('创建失败: ' + (error.response?.data?.detail || error.message || '未知错误'));
    }
  };

  const handleDelete = async (workflowId: string) => {
    try {
      await workflowApi.delete(workflowId);
      message.success('删除成功');
      fetchWorkflows();
    } catch (error: any) {
      message.error('删除失败: ' + (error.response?.data?.detail || error.message || '未知错误'));
    }
  };

  const handleDemo = async (workflow: Workflow) => {
    onDemo(workflow);
  };

  const getNodeCount = (workflow: Workflow) => {
    return workflow.graphData?.nodes?.length || 0;
  };

  const getEdgeCount = (workflow: Workflow) => {
    return workflow.graphData?.edges?.length || 0;
  };

  const columns = [
    {
      title: '工作流名称',
      dataIndex: 'workflowName',
      key: 'workflowName',
      render: (text: string, record: Workflow) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1f2937', fontSize: '14px' }}>{text}</div>
          {record.description && (
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: '节点数',
      key: 'nodeCount',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: Workflow) => (
        <span style={{ color: '#1890ff', fontWeight: 600 }}>
          <NodeIndexOutlined style={{ marginRight: '4px' }} />
          {getNodeCount(record)}
        </span>
      ),
    },
    {
      title: '连接数',
      key: 'edgeCount',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: Workflow) => (
        <span style={{ color: '#722ed1', fontWeight: 600 }}>
          <BranchesOutlined style={{ marginRight: '4px' }} />
          {getEdgeCount(record)}
        </span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (time: string) => (
        <span style={{ color: '#6b7280', fontSize: '13px' }}>
          <ClockCircleOutlined style={{ marginRight: '4px' }} />
          {new Date(time).toLocaleString()}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: Workflow) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => onView(record)}
              style={{ color: '#1890ff' }}
            />
          </Tooltip>
          <Tooltip title="编辑工作流">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
              style={{ color: '#52c41a' }}
            />
          </Tooltip>
          <Tooltip title="运行演示">
            <Button
              type="text"
              icon={<PlayCircleOutlined />}
              onClick={() => handleDemo(record)}
              style={{ color: '#722ed1' }}
            />
          </Tooltip>
          <Tooltip title="删除工作流">
            <Popconfirm
              title="确定要删除这个工作流吗？"
              description="删除后不可恢复，请谨慎操作。"
              onConfirm={() => handleDelete(record.workflowId)}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const totalNodes = workflows.reduce((sum, w) => sum + getNodeCount(w), 0);
  const totalEdges = workflows.reduce((sum, w) => sum + getEdgeCount(w), 0);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 页面标题区域 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title">
          <RocketOutlined style={{ marginRight: '12px', color: '#1890ff' }} />
          工作流管理
        </h1>
        <p className="page-subtitle">创建、管理和运行您的 AI 工作流</p>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={8}>
          <Card className="quick-access-card" bodyStyle={{ padding: '20px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280', fontSize: '14px' }}>工作流总数</span>}
              value={workflows.length}
              prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontSize: '28px', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="quick-access-card" bodyStyle={{ padding: '20px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280', fontSize: '14px' }}>节点总数</span>}
              value={totalNodes}
              prefix={<NodeIndexOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="quick-access-card" bodyStyle={{ padding: '20px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280', fontSize: '14px' }}>连接总数</span>}
              value={totalEdges}
              prefix={<BranchesOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1', fontSize: '28px', fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 工作流列表 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ThunderboltOutlined style={{ color: '#1890ff' }} />
            <span style={{ fontWeight: 600, fontSize: '16px' }}>工作流列表</span>
          </div>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
            size="middle"
          >
            新建工作流
          </Button>
        }
        style={{ marginBottom: '24px' }}
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : workflows.length === 0 ? (
          <Empty
            image={<FileTextOutlined style={{ fontSize: '64px', color: '#d1d5db' }} />}
            description={
              <div>
                <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '8px' }}>暂无工作流</p>
                <p style={{ color: '#9ca3af', fontSize: '14px' }}>点击上方按钮创建您的第一个工作流</p>
              </div>
            }
          />
        ) : (
          <Table
            columns={columns}
            dataSource={workflows}
            rowKey="workflowId"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        )}
      </Card>

      {/* 使用提示区域 */}
      <Card className="tips-card" bodyStyle={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <BookOutlined style={{ fontSize: '24px', color: '#52c41a', marginTop: '2px' }} />
          <div>
            <h4 style={{ margin: '0 0 8px 0', color: '#1f2937', fontWeight: 600 }}>使用提示</h4>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#4b5563', lineHeight: '1.8' }}>
              <li>点击「新建工作流」创建自定义的 AI 处理流程</li>
              <li>拖拽式节点编辑器支持输入、大模型、代码、知识库检索等多种节点</li>
              <li>在「知识库」模块中上传文档，可在工作流中使用 RAG 检索节点</li>
              <li>使用「运行演示」功能快速测试工作流效果</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* 新建工作流模态框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusOutlined style={{ color: '#1890ff' }} />
            新建工作流
          </div>
        }
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        width={520}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ marginTop: '16px' }}>
          <Form.Item
            name="workflowName"
            label="工作流名称"
            rules={[{ required: true, message: '请输入工作流名称' }]}
          >
            <Input placeholder="请输入工作流名称" size="large" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入描述（可选）" rows={3} showCount maxLength={200} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setCreateModalVisible(false)} size="large">
                取消
              </Button>
              <Button type="primary" htmlType="submit" size="large" icon={<PlusOutlined />}>
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WorkflowList;
