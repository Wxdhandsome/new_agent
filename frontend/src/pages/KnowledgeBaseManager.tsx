import { useState, useEffect, type FC } from 'react';
import {
  Table, Button, Space, Card, message, Modal, Form, Input, Upload, Tabs, Popconfirm,
  Collapse, Tag, Slider, Switch, Select, Row, Col, Tooltip, Statistic,
  Skeleton, Empty, Badge
} from 'antd';
import {
  PlusOutlined, UploadOutlined, DeleteOutlined, FileTextOutlined, DatabaseOutlined,
  SearchOutlined, EditOutlined, ExperimentOutlined, CopyOutlined, InfoCircleOutlined,
  BookOutlined, CloudUploadOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, InboxOutlined, BarChartOutlined
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { kbApi } from '../api';

interface KnowledgeBase {
  kbId: string;
  name: string;
  description?: string;
  chunkSize: number;
  chunkOverlap: number;
  docCount: number;
  chunkCount: number;
  createdAt?: string;
  updatedAt?: string;
}

interface DocumentItem {
  docId: string;
  kbId: string;
  filename: string;
  fileSize: number;
  chunkCount: number;
  createdAt?: string;
}

interface RecallResult {
  query: string;
  items: Array<{
    content: string;
    fusedScore: number;
    source: string;
    chunkIndex: number;
    denseScore: number;
    sparseScore: number;
    rerankScore: number | null;
  }>;
  total: number;
  avgSimilarity: number;
  totalChars: number;
}

const KnowledgeBaseManager: FC = () => {
  const [activeTab, setActiveTab] = useState('kbs');
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedKb, setSelectedKb] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [recallPanelVisible, setRecallPanelVisible] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [uploadForm] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const [recallQuery, setRecallQuery] = useState('');
  const [recallLoading, setRecallLoading] = useState(false);
  const [recallResults, setRecallResults] = useState<RecallResult | null>(null);
  const [recallMode, setRecallMode] = useState('hybrid');
  const [recallTopK, setRecallTopK] = useState(6);
  const [recallCandidateK, setRecallCandidateK] = useState(30);
  const [recallDenseWeight, setRecallDenseWeight] = useState(0.7);
  const [recallMinScore, setRecallMinScore] = useState(0.5);
  const [recallEnableRerank, setRecallEnableRerank] = useState(false);

  const [editingKb, setEditingKb] = useState<KnowledgeBase | null>(null);

  const fetchKbs = async () => {
    setLoading(true);
    try {
      const data = await kbApi.list();
      setKbs(Array.isArray(data) ? data : []);
    } catch (error) {
      message.error('获取知识库列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async (kbId: string) => {
    if (!kbId) return;
    setLoading(true);
    try {
      const data = await kbApi.getDocuments(kbId);
      setDocuments(data.items || []);
    } catch (error) {
      message.error('获取文档列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKbs();
  }, []);

  useEffect(() => {
    if (selectedKb) {
      fetchDocuments(selectedKb);
    }
  }, [selectedKb]);

  const handleCreateKb = async (values: any) => {
    try {
      await kbApi.create(values);
      message.success('知识库创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      fetchKbs();
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '创建失败');
    }
  };

  const handleEditKbClick = (record: KnowledgeBase) => {
    setEditingKb(record);
    editForm.setFieldsValue({
      name: record.name,
      description: record.description || '',
      chunk_size: record.chunkSize,
      chunk_overlap: record.chunkOverlap,
    });
    setEditModalVisible(true);
  };

  const handleEditKbSubmit = async (values: any) => {
    if (!editingKb) return;
    try {
      await kbApi.update(editingKb.kbId, values);
      message.success('知识库更新成功');
      setEditModalVisible(false);
      setEditingKb(null);
      editForm.resetFields();
      fetchKbs();
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '更新失败');
    }
  };

  const handleDeleteKb = async (kbId: string) => {
    try {
      await kbApi.delete(kbId);
      message.success('知识库删除成功');
      fetchKbs();
      if (selectedKb === kbId) {
        setSelectedKb('');
        setDocuments([]);
        setRecallPanelVisible(false);
        setRecallResults(null);
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleUpload = async (_values: any) => {
    if (!selectedKb || fileList.length === 0) {
      message.error('请选择知识库和文件');
      return;
    }
    const file = fileList[0].originFileObj;
    if (!file) return;

    try {
      const data = await kbApi.uploadDocument(selectedKb, file);
      message.success(`文档上传成功，共 ${data.indexedChunks || 0} 个分块`);
      setUploadModalVisible(false);
      setFileList([]);
      uploadForm.resetFields();
      fetchDocuments(selectedKb);
      fetchKbs();
    } catch (error: any) {
      message.error(error?.message || error?.response?.data?.detail || '上传失败');
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await kbApi.deleteDocument(docId);
      message.success('文档删除成功');
      fetchDocuments(selectedKb);
      fetchKbs();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleRecallSearch = async () => {
    if (!recallQuery.trim()) {
      message.warning('请输入查询内容');
      return;
    }
    if (!selectedKb) {
      message.warning('请先选择知识库');
      return;
    }

    setRecallLoading(true);
    setRecallResults(null);
    try {
      const result = await kbApi.recall(selectedKb, {
        query: recallQuery,
        retrievalMode: recallMode,
        topK: recallTopK,
        candidateK: recallCandidateK,
        denseWeight: recallDenseWeight,
        sparseWeight: parseFloat((1 - recallDenseWeight).toFixed(2)),
        minScore: recallMinScore,
        enableRerank: recallEnableRerank,
        maxChars: 15000,
      });
      setRecallResults(result as RecallResult);
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '检索失败，请检查后端服务和 Milvus 连接');
    } finally {
      setRecallLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  const totalDocs = kbs.reduce((sum, kb) => sum + kb.docCount, 0);
  const totalChunks = kbs.reduce((sum, kb) => sum + kb.chunkCount, 0);

  const kbColumns = [
    {
      title: '知识库名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: KnowledgeBase) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DatabaseOutlined style={{ color: '#1890ff' }} />
          <div>
            <div style={{ fontWeight: 600, color: '#1f2937' }}>{text}</div>
            {record.description && (
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{record.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '文档数',
      dataIndex: 'docCount',
      key: 'docCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <Badge count={count} style={{ backgroundColor: count > 0 ? '#1890ff' : '#d9d9d9' }} />
      ),
    },
    {
      title: '分块数',
      dataIndex: 'chunkCount',
      key: 'chunkCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <span style={{ color: count > 0 ? '#52c41a' : '#9ca3af', fontWeight: 600 }}>{count}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_: any, record: KnowledgeBase) => (
        <Space size="small">
          <Tooltip title="查看文档">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              onClick={() => { setSelectedKb(record.kbId); setActiveTab('docs'); }}
              style={{ color: '#1890ff' }}
            />
          </Tooltip>
          <Tooltip title="检索测试">
            <Button
              type="text"
              icon={<ExperimentOutlined />}
              onClick={() => { setSelectedKb(record.kbId); setRecallPanelVisible(true); setActiveTab('docs'); }}
              style={{ color: '#722ed1' }}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditKbClick(record)}
              style={{ color: '#52c41a' }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Popconfirm
              title="确定删除该知识库？"
              description="删除后不可恢复，关联的文档和向量数据将全部清除。"
              onConfirm={() => handleDeleteKb(record.kbId)}
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

  const docColumns = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </div>
      ),
    },
    {
      title: '大小',
      key: 'size',
      width: 120,
      render: (_: any, r: DocumentItem) => (
        <Tag color="blue">{Math.round(r.fileSize / 1024)} KB</Tag>
      ),
    },
    {
      title: '分块数',
      dataIndex: 'chunkCount',
      key: 'chunkCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <span style={{ color: count > 0 ? '#52c41a' : '#9ca3af', fontWeight: 600 }}>{count}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: DocumentItem) => (
        <Tooltip title="删除文档">
          <Popconfirm
            title="确定删除该文档？"
            description="删除后不可恢复。"
            onConfirm={() => handleDeleteDoc(record.docId)}
            okText="确定"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Tooltip>
      ),
    },
  ];

  const selectedKbName = kbs.find(k => k.kbId === selectedKb)?.name || '';
  const selectedKbInfo = kbs.find(k => k.kbId === selectedKb);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title">
          <DatabaseOutlined style={{ marginRight: '12px', color: '#1890ff' }} />
          知识库管理
        </h1>
        <p className="page-subtitle">管理文档和向量索引，支持 RAG 检索增强</p>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={8}>
          <Card className="quick-access-card" bodyStyle={{ padding: '20px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280', fontSize: '14px' }}>知识库总数</span>}
              value={kbs.length}
              prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontSize: '28px', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="quick-access-card" bodyStyle={{ padding: '20px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280', fontSize: '14px' }}>文档总数</span>}
              value={totalDocs}
              prefix={<FileTextOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card className="quick-access-card" bodyStyle={{ padding: '20px' }}>
            <Statistic
              title={<span style={{ color: '#6b7280', fontSize: '14px' }}>向量分块</span>}
              value={totalChunks}
              prefix={<BarChartOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1', fontSize: '28px', fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'kbs',
              label: (
                <span>
                  <DatabaseOutlined style={{ marginRight: '6px' }} />
                  知识库管理
                </span>
              ),
              children: (
                <>
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontWeight: 600, fontSize: '16px', color: '#1f2937' }}>
                        <BookOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                        知识库列表
                      </h3>
                    </div>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                      新建知识库
                    </Button>
                  </div>
                  {loading ? (
                    <Skeleton active paragraph={{ rows: 5 }} />
                  ) : kbs.length === 0 ? (
                    <Empty
                      image={<DatabaseOutlined style={{ fontSize: '64px', color: '#d1d5db' }} />}
                      description={
                        <div>
                          <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '8px' }}>暂无知识库</p>
                          <p style={{ color: '#9ca3af', fontSize: '14px' }}>点击上方按钮创建您的第一个知识库</p>
                        </div>
                      }
                    />
                  ) : (
                    <Table columns={kbColumns} dataSource={kbs} rowKey="kbId" loading={loading} />
                  )}
                </>
              ),
            },
            {
              key: 'docs',
              label: (
                <span>
                  <FileTextOutlined style={{ marginRight: '6px' }} />
                  文档 & 检索
                </span>
              ),
              children: (
                <>
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontWeight: 600, fontSize: '16px', color: '#1f2937' }}>
                        {selectedKb ? (
                          <>
                            <CheckCircleOutlined style={{ marginRight: '8px', color: '#52c41a' }} />
                            {selectedKbName}
                          </>
                        ) : (
                          <>
                            <InboxOutlined style={{ marginRight: '8px', color: '#9ca3af' }} />
                            请选择一个知识库
                          </>
                        )}
                      </h3>
                    </div>
                    <Space>
                      {selectedKb && (
                        <>
                          <Button
                            icon={<ExperimentOutlined />}
                            onClick={() => setRecallPanelVisible(!recallPanelVisible)}
                            type={recallPanelVisible ? 'primary' : 'default'}
                          >
                            {recallPanelVisible ? '隐藏检索' : '检索测试'}
                          </Button>
                          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>
                            上传文档
                          </Button>
                        </>
                      )}
                      {!selectedKb && (
                        <Button onClick={() => setActiveTab('kbs')}>返回列表</Button>
                      )}
                    </Space>
                  </div>

                  {selectedKbInfo && (
                    <Card size="small" style={{ marginBottom: '16px', background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)', border: '1px solid #bae0ff' }}>
                      <Row gutter={[24, 8]}>
                        <Col span={6}>
                          <Statistic title="文档数" value={selectedKbInfo.docCount} valueStyle={{ fontSize: '20px', color: '#1890ff' }} />
                        </Col>
                        <Col span={6}>
                          <Statistic title="总分块" value={selectedKbInfo.chunkCount} valueStyle={{ fontSize: '20px', color: '#52c41a' }} />
                        </Col>
                        <Col span={6}>
                          <Statistic title="分块大小" value={selectedKbInfo.chunkSize} suffix="token" valueStyle={{ fontSize: '20px', color: '#722ed1' }} />
                        </Col>
                        <Col span={6}>
                          <Statistic title="重叠长度" value={selectedKbInfo.chunkOverlap} suffix="token" valueStyle={{ fontSize: '20px', color: '#faad14' }} />
                        </Col>
                      </Row>
                    </Card>
                  )}

                  {recallPanelVisible && selectedKb && (
                    <Card
                      size="small"
                      title={
                        <Space>
                          <SearchOutlined style={{ color: '#1890ff' }} />
                          <span style={{ fontWeight: 600 }}>RAG 检索测试</span>
                          <Tooltip title="在当前选中的知识库中执行向量/关键词混合检索，验证索引质量和召回效果">
                            <InfoCircleOutlined style={{ color: '#999' }} />
                          </Tooltip>
                        </Space>
                      }
                      style={{ marginBottom: '16px', borderLeft: '4px solid #1890ff' }}
                      extra={<Tag color="blue">{selectedKbName}</Tag>}
                    >
                      <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Space.Compact style={{ width: '100%' }}>
                          <Input
                            placeholder="输入要检索的问题或关键词..."
                            value={recallQuery}
                            onChange={(e) => setRecallQuery(e.target.value)}
                            onPressEnter={handleRecallSearch}
                            allowClear
                            size="large"
                            style={{ flex: 1 }}
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                          />
                          <Button
                            type="primary"
                            icon={<SearchOutlined />}
                            loading={recallLoading}
                            onClick={handleRecallSearch}
                            size="large"
                          >
                            检索
                          </Button>
                        </Space.Compact>

                        <Collapse ghost size="small">
                          <Collapse.Panel header="高级检索参数" key="advanced">
                            <Row gutter={[16, 12]}>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666', fontWeight: 500 }}>检索模式</div>
                                <Select value={recallMode} onChange={setRecallMode} style={{ width: '100%' }} size="small">
                                  <Select.Option value="hybrid">混合检索 (dense + sparse)</Select.Option>
                                  <Select.Option value="dense_only">仅向量检索 (dense)</Select.Option>
                                  <Select.Option value="sparse_only">仅关键词检索 (sparse)</Select.Option>
                                </Select>
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666', fontWeight: 500 }}>引用 TopN</div>
                                <Slider min={1} max={20} value={recallTopK} onChange={setRecallTopK} marks={{ 1: '1', 6: '6', 10: '10', 20: '20' }} />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666', fontWeight: 500 }}>候选集大小</div>
                                <Slider min={10} max={50} value={recallCandidateK} onChange={setRecallCandidateK} marks={{ 10: '10', 30: '30', 50: '50' }} />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666', fontWeight: 500 }}>
                                  Dense 权重 ({recallDenseWeight.toFixed(1)})
                                </div>
                                <Slider min={0} max={1} step={0.1} value={recallDenseWeight} onChange={setRecallDenseWeight} />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666', fontWeight: 500 }}>最低相关度 ({recallMinScore.toFixed(2)})</div>
                                <Slider min={0} max={1} step={0.05} value={recallMinScore} onChange={setRecallMinScore} />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '8px', fontSize: '13px', color: '#666', fontWeight: 500 }}>重排序</div>
                                <Switch checked={recallEnableRerank} onChange={setRecallEnableRerank} size="small" />
                                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#999' }}>{recallEnableRerank ? '已启用' : '已禁用'}</span>
                              </Col>
                            </Row>
                          </Collapse.Panel>
                        </Collapse>

                        {recallResults && (
                          <div>
                            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>
                                <strong style={{ color: '#1f2937' }}>检索结果</strong>
                                <Tag color="blue" style={{ marginLeft: '8px' }}>{recallResults.total ?? recallResults.items?.length} 条匹配</Tag>
                                {recallResults.totalChars > 0 && <Tag color="green">{recallResults.totalChars} 字符</Tag>}
                              </span>
                              {recallResults.query && (
                                <span style={{ fontSize: '12px', color: '#999' }}>查询: "{recallResults.query}"</span>
                              )}
                            </div>

                            {(!recallResults.items || recallResults.items.length === 0) ? (
                              <div style={{ textAlign: 'center', padding: '30px', background: '#fafafa', borderRadius: '8px', color: '#999' }}>
                                <ExclamationCircleOutlined style={{ fontSize: '32px', marginBottom: '8px', color: '#d9d9d9' }} />
                                <p>未找到匹配的结果，请尝试调整查询词或降低最低相关度阈值</p>
                              </div>
                            ) : (
                              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {recallResults.items.map((item, index: number) => (
                                  <Card
                                    key={index}
                                    size="small"
                                    style={{
                                      marginBottom: '8px',
                                      borderLeft: `4px solid ${item.fusedScore > 0.8 ? '#52c41a' : item.fusedScore > 0.6 ? '#faad14' : '#ff4d4f'}`,
                                      transition: 'all 0.3s ease',
                                    }}
                                    hoverable
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                      <Space>
                                        <Tag color="blue">#{index + 1}</Tag>
                                        <span style={{ fontWeight: 600, color: '#1f2937' }}>{item.source || '未知文档'}</span>
                                        <Tag color="processing">chunk_{item.chunkIndex}</Tag>
                                      </Space>
                                      <Space>
                                        <Tag
                                          color={item.fusedScore > 0.8 ? 'green' : item.fusedScore > 0.6 ? 'orange' : 'red'}
                                          style={{ margin: 0, fontWeight: 600 }}
                                        >
                                          相关度: {(item.fusedScore * 100).toFixed(1)}%
                                        </Tag>
                                        <Tooltip title="复制内容">
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<CopyOutlined />}
                                            onClick={() => copyToClipboard(item.content)}
                                          />
                                        </Tooltip>
                                      </Space>
                                    </div>
                                    <div
                                      style={{
                                        padding: '12px',
                                        background: '#f9fafb',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        lineHeight: '1.7',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        maxHeight: '200px',
                                        overflow: 'auto',
                                        color: '#374151',
                                      }}
                                    >
                                      {item.content}
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {!recallResults && !recallLoading && (
                          <div style={{ textAlign: 'center', padding: '30px', color: '#bbb' }}>
                            <SearchOutlined style={{ fontSize: '40px', marginBottom: '8px', opacity: 0.3 }} />
                            <p>输入查询内容并点击"检索"按钮开始测试知识库的召回效果</p>
                          </div>
                        )}
                      </Space>
                    </Card>
                  )}

                  {selectedKb ? (
                    loading ? (
                      <Skeleton active paragraph={{ rows: 3 }} />
                    ) : documents.length === 0 ? (
                      <Empty
                        image={<InboxOutlined style={{ fontSize: '64px', color: '#d1d5db' }} />}
                        description={
                          <div>
                            <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '8px' }}>暂无文档</p>
                            <p style={{ color: '#9ca3af', fontSize: '14px' }}>点击"上传文档"按钮添加文档</p>
                          </div>
                        }
                      />
                    ) : (
                      <Table columns={docColumns} dataSource={documents} rowKey="docId" loading={loading} />
                    )
                  ) : (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                      <DatabaseOutlined style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.3, color: '#d1d5db' }} />
                      <p style={{ fontSize: '16px' }}>请先切换到「知识库管理」Tab 选择一个知识库</p>
                    </div>
                  )}
                </>
              ),
            },
          ]}
        />

        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlusOutlined style={{ color: '#1890ff' }} />
              新建知识库
            </div>
          }
          open={createModalVisible}
          onCancel={() => setCreateModalVisible(false)}
          footer={null}
          width={520}
        >
          <Form form={form} onFinish={handleCreateKb} layout="vertical" style={{ marginTop: '16px' }}>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入知识库名称' }]}>
              <Input placeholder="请输入知识库名称" maxLength={100} showCount size="large" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea placeholder="请输入描述（可选）" rows={3} maxLength={500} showCount />
            </Form.Item>
            <Form.Item name="chunk_size" label="分块大小（token）" initialValue={800} extra="文本切分时的最大字符数，建议 500-1500">
              <Input type="number" min={100} max={2000} size="large" />
            </Form.Item>
            <Form.Item name="chunk_overlap" label="分块重叠（token）" initialValue={100} extra="相邻分块之间的重叠字符数，保持上下文连续性">
              <Input type="number" min={0} max={1000} size="large" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setCreateModalVisible(false)} size="large">取消</Button>
                <Button type="primary" htmlType="submit" size="large" icon={<PlusOutlined />}>创建</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <EditOutlined style={{ color: '#52c41a' }} />
              编辑知识库
            </div>
          }
          open={editModalVisible}
          onCancel={() => { setEditModalVisible(false); setEditingKb(null); }}
          footer={null}
          width={520}
        >
          <Form form={editForm} onFinish={handleEditKbSubmit} layout="vertical" style={{ marginTop: '16px' }}>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入知识库名称' }]}>
              <Input placeholder="请输入知识库名称" maxLength={100} showCount size="large" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea placeholder="请输入描述（可选）" rows={3} maxLength={500} showCount />
            </Form.Item>
            <Form.Item name="chunk_size" label="分块大小（token）" extra="修改后对新上传的文档生效">
              <Input type="number" min={100} max={2000} size="large" />
            </Form.Item>
            <Form.Item name="chunk_overlap" label="分块重叠（token）" extra="修改后对新上传的文档生效">
              <Input type="number" min={0} max={1000} size="large" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => { setEditModalVisible(false); setEditingKb(null); }} size="large">取消</Button>
                <Button type="primary" htmlType="submit" size="large" icon={<CheckCircleOutlined />}>保存</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CloudUploadOutlined style={{ color: '#1890ff' }} />
              上传文档
            </div>
          }
          open={uploadModalVisible}
          onCancel={() => { setUploadModalVisible(false); setFileList([]); }}
          footer={null}
          width={520}
        >
          <Form form={uploadForm} onFinish={handleUpload} layout="vertical" style={{ marginTop: '16px' }}>
            <Form.Item label="目标知识库">
              <Input value={selectedKbName} disabled size="large" />
            </Form.Item>
            <Form.Item label="上传文件" required>
              <Upload.Dragger
                fileList={fileList}
                beforeUpload={(file) => {
                  const ext = file.name.split('.').pop()?.toLowerCase();
                  if (!['pdf', 'txt', 'md'].includes(ext || '')) {
                    message.error('仅支持 PDF / TXT / MD 文件');
                    return Upload.LIST_IGNORE;
                  }
                  setFileList([{ uid: file.uid, name: file.name, status: 'done', originFileObj: file }]);
                  return false;
                }}
                onRemove={() => setFileList([])}
                maxCount={1}
                style={{ padding: '20px' }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
                </p>
                <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
                <p className="ant-upload-hint">支持 PDF、TXT、MD 格式</p>
              </Upload.Dragger>
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => { setUploadModalVisible(false); setFileList([]); }} size="large">取消</Button>
                <Button type="primary" htmlType="submit" size="large" icon={<CloudUploadOutlined />}>上传</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
};

export default KnowledgeBaseManager;
