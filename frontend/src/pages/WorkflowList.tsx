import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Space, 
  Popconfirm, 
  Modal, 
  Form, 
  Input, 
  message, 
  Tag,
  Card
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  PlayCircleOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { workflowApi } from '../api';
import type { Workflow } from '../types';

interface WorkflowListProps {
  onEdit: (workflow: Workflow) => void;
  onView: (workflow: Workflow) => void;
}

const WorkflowList: React.FC<WorkflowListProps> = ({ onEdit, onView }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      console.log('Fetching workflows...');
      const data = await workflowApi.list();
      console.log('Workflows data:', data);
      setWorkflows(data || []);
    } catch (error: any) {
      console.error('Fetch error:', error);
      message.error('获取工作流列表失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      await workflowApi.create(values);
      message.success('创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      fetchWorkflows();
    } catch (error) {
      message.error('创建失败');
    }
  };

  const handleDelete = async (workflowId: string) => {
    try {
      await workflowApi.delete(workflowId);
      message.success('删除成功');
      fetchWorkflows();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleDemo = async (workflow: Workflow) => {
    try {
      await workflowApi.demo(workflow.workflowId, {});
      message.success('演示已启动');
    } catch (error) {
      message.error('演示启动失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, string> = {
      draft: 'default',
      published: 'success',
      disabled: 'error'
    };
    const labelMap: Record<string, string> = {
      draft: '草稿',
      published: '已发布',
      disabled: '已禁用'
    };
    return <Tag color={statusMap[status] || 'default'}>{labelMap[status] || status}</Tag>;
  };

  const columns = [
    {
      title: '工作流名称',
      dataIndex: 'workflowName',
      key: 'workflowName',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: getStatusTag,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Workflow) => (
        <Space size="small">
          <Button 
            type="link" 
            icon={<EyeOutlined />} 
            onClick={() => onView(record)}
          >
            查看
          </Button>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => onEdit(record)}
          >
            编辑
          </Button>
          <Button 
            type="link" 
            icon={<PlayCircleOutlined />} 
            onClick={() => handleDemo(record)}
          >
            演示
          </Button>
          <Popconfirm
            title="确定要删除这个工作流吗？"
            onConfirm={() => handleDelete(record.workflowId)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <h2>工作流列表</h2>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => setCreateModalVisible(true)}
          >
            新建工作流
          </Button>
        </div>
        <Table 
          columns={columns} 
          dataSource={workflows} 
          rowKey="workflowId"
          loading={loading}
        />
      </Card>

      <Modal
        title="新建工作流"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item
            name="workflowName"
            label="工作流名称"
            rules={[{ required: true, message: '请输入工作流名称' }]}
          >
            <Input placeholder="请输入工作流名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入描述" rows={3} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
              <Button onClick={() => setCreateModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WorkflowList;
