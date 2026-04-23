import { useState, useEffect, type FC } from 'react';
import {
  Table, Button, Space, Card, message, Modal, Form, Input, Upload, Tabs, Popconfirm,
  Collapse, Tag, Slider, Switch, Select, Row, Col, Descriptions, Tooltip
} from 'antd';
import {
  PlusOutlined, UploadOutlined, DeleteOutlined, FileTextOutlined, DatabaseOutlined,
  SearchOutlined, EditOutlined, ExperimentOutlined, CopyOutlined, InfoCircleOutlined
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

  // 召回检索相关状态
  const [recallQuery, setRecallQuery] = useState('');
  const [recallLoading, setRecallLoading] = useState(false);
  const [recallResults, setRecallResults] = useState<RecallResult | null>(null);
  const [recallMode, setRecallMode] = useState('hybrid');
  const [recallTopK, setRecallTopK] = useState(6);
  const [recallCandidateK, setRecallCandidateK] = useState(30);
  const [recallDenseWeight, setRecallDenseWeight] = useState(0.7);
  const [recallMinScore, setRecallMinScore] = useState(0.5);
  const [recallEnableRerank, setRecallEnableRerank] = useState(false);

  // 编辑知识库相关
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

  // ── 知识库 CRUD ──

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

  // ── 文档管理 ──

  const handleUpload = async (values: any) => {
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

  // ── RAG 检索测试 ──

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

  // ── 表格列定义 ──

  const kbColumns = [
    { title: '知识库名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '文档数', dataIndex: 'docCount', key: 'docCount', width: 80 },
    { title: '分块数', dataIndex: 'chunkCount', key: 'chunkCount', width: 80 },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: any, record: KnowledgeBase) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => { setSelectedKb(record.kbId); setActiveTab('docs'); }}>
            文档
          </Button>
          <Button type="link" size="small" icon={<ExperimentOutlined />} onClick={() => { setSelectedKb(record.kbId); setRecallPanelVisible(true); setActiveTab('docs'); }}>
            检索测试
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditKbClick(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除该知识库？删除后不可恢复" onConfirm={() => handleDeleteKb(record.kbId)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const docColumns = [
    { title: '文件名', dataIndex: 'filename', key: 'filename' },
    { title: '大小 (KB)', key: 'size', render: (_: any, r: DocumentItem) => Math.round(r.fileSize / 1024) },
    { title: '分块数', dataIndex: 'chunkCount', key: 'chunkCount', width: 80 },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: DocumentItem) => (
        <Popconfirm title="确定删除该文档？" onConfirm={() => handleDeleteDoc(record.docId)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  // 获取选中知识库名称
  const selectedKbName = kbs.find(k => k.kbId === selectedKb)?.name || '';
  const selectedKbInfo = kbs.find(k => k.kbId === selectedKb);

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'kbs',
              label: <span><DatabaseOutlined /> 知识库管理</span>,
              children: (
                <>
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                    <h3>知识库列表</h3>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                      新建知识库
                    </Button>
                  </div>
                  <Table columns={kbColumns} dataSource={kbs} rowKey="kbId" loading={loading} />
                </>
              ),
            },
            {
              key: 'docs',
              label: <span><FileTextOutlined /> 文档 & 检索</span>,
              children: (
                <>
                  <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>
                      {selectedKb ? `当前知识库: ${selectedKbName}` : '请从左侧选择一个知识库'}
                    </h3>
                    <Space>
                      {selectedKb && (
                        <>
                          <Button icon={<ExperimentOutlined />} onClick={() => setRecallPanelVisible(!recallPanelVisible)} type={recallPanelVisible ? 'primary' : 'default'}>
                            {recallPanelVisible ? '隐藏检索测试' : '显示检索测试'}
                          </Button>
                          <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>
                            上传文档
                          </Button>
                        </>
                      )}
                      {!selectedKb && (
                        <Button onClick={() => setActiveTab('kbs')}>返回知识库列表</Button>
                      )}
                    </Space>
                  </div>

                  {/* 知识库信息摘要 */}
                  {selectedKbInfo && (
                    <Card size="small" style={{ marginBottom: '16px', background: '#f6f8fa' }}>
                      <Row gutter={[24, 8]}>
                        <Col span={6}>
                          <span style={{ color: '#666' }}>文档数：</span>
                          <strong>{selectedKbInfo.docCount}</strong>
                        </Col>
                        <Col span={6}>
                          <span style={{ color: '#666' }}>总分块数：</span>
                          <strong>{selectedKbInfo.chunkCount}</strong>
                        </Col>
                        <Col span={6}>
                          <span style={{ color: '#666' }}>分块大小：</span>
                          <strong>{selectedKbInfo.chunkSize}</strong>
                        </Col>
                        <Col span={6}>
                          <span style={{ color: '#666' }}>重叠长度：</span>
                          <strong>{selectedKbInfo.chunkOverlap}</strong>
                        </Col>
                      </Row>
                    </Card>
                  )}

                  {/* ── RAG 召回检索测试面板 ── */}
                  {recallPanelVisible && selectedKb && (
                    <Card
                      size="small"
                      title={
                        <Space>
                          <SearchOutlined />
                          <span>RAG 检索测试</span>
                          <Tooltip title="在当前选中的知识库中执行向量/关键词混合检索，验证索引质量和召回效果">
                            <InfoCircleOutlined style={{ color: '#999' }} />
                          </Tooltip>
                        </Space>
                      }
                      style={{ marginBottom: '16px', borderLeft: '4px solid #2f54eb' }}
                      extra={
                        <Tag color="#2f54eb">{selectedKbName}</Tag>
                      }
                    >
                      <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        {/* 查询输入区 */}
                        <Space.Compact style={{ width: '100%' }}>
                          <Input
                            placeholder="输入要检索的问题或关键词..."
                            value={recallQuery}
                            onChange={(e) => setRecallQuery(e.target.value)}
                            onPressEnter={handleRecallSearch}
                            allowClear
                            size="large"
                            style={{ flex: 1 }}
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

                        {/* 高级参数折叠面板 */}
                        <Collapse ghost size="small">
                          <Collapse.Panel header="高级检索参数" key="advanced">
                            <Row gutter={[16, 12]}>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666' }}>检索模式</div>
                                <Select value={recallMode} onChange={setRecallMode} style={{ width: '100%' }} size="small">
                                  <Select.Option value="hybrid">混合检索 (dense + sparse)</Select.Option>
                                  <Select.Option value="dense_only">仅向量检索 (dense)</Select.Option>
                                  <Select.Option value="sparse_only">仅关键词检索 (sparse)</Select.Option>
                                </Select>
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666' }}>引用 TopN</div>
                                <Slider min={1} max={20} value={recallTopK} onChange={setRecallTopK} size="small" marks={{ 1: '1', 6: '6', 10: '10', 20: '20' }} />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666' }}>候选集大小</div>
                                <Slider min={10} max={50} value={recallCandidateK} onChange={setRecallCandidateK} size="small" marks={{ 10: '10', 30: '30', 50: '50' }} />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                                  Dense 权重 ({recallDenseWeight.toFixed(1)})
                                </div>
                                <Slider min={0} max={1} step={0.1} value={recallDenseWeight} onChange={setRecallDenseWeight} size="small" />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '4px', fontSize: '13px', color: '#666' }}>最低相关度 ({recallMinScore.toFixed(2)})</div>
                                <Slider min={0} max={1} step={0.05} value={recallMinScore} onChange={setRecallMinScore} size="small" />
                              </Col>
                              <Col span={8}>
                                <div style={{ marginBottom: '8px', fontSize: '13px', color: '#666' }}>重排序</div>
                                <Switch checked={recallEnableRerank} onChange={setRecallEnableRerank} size="small" />
                                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#999' }}>{recallEnableRerank ? '已启用' : '已禁用'}</span>
                              </Col>
                            </Row>
                          </Collapse.Panel>
                        </Collapse>

                        {/* 检索结果展示 */}
                        {recallResults && (
                          <div>
                            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>
                                <strong>检索结果</strong> — 共找到 <Tag color="blue">{recallResults.total ?? recallResults.items?.length}</Tag> 条匹配
                                {recallResults.totalChars > 0 && <Tag color="green">{recallResults.totalChars} 字符</Tag>}
                              </span>
                              {recallResults.query && (
                                <span style={{ fontSize: '12px', color: '#999' }}>查询: "{recallResults.query}"</span>
                              )}
                            </div>

                            {(!recallResults.items || recallResults.items.length === 0) ? (
                              <div style={{ textAlign: 'center', padding: '30px', background: '#fafafa', borderRadius: '8px', color: '#999' }}>
                                未找到匹配的结果，请尝试调整查询词或降低最低相关度阈值
                              </div>
                            ) : (
                              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {recallResults.items.map((item, index: number) => (
                                  <Card
                                    key={index}
                                    size="small"
                                    style={{ marginBottom: '8px', borderLeft: `3px solid ${item.score > 0.8 ? '#52c41a' : item.score > 0.6 ? '#faad14' : '#ff4d4f'}` }}
                                    hoverable
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                      <Space>
                                        <Tag color="blue">#{index + 1}</Tag>
                                        <span style={{ fontWeight: 500 }}>{item.source || '未知文档'}</span>
                                        <Tag color="processing">chunk_{item.chunkIndex}</Tag>
                                      </Space>
                                      <Space>
                                        <Tag
                                          color={item.fusedScore > 0.8 ? 'green' : item.fusedScore > 0.6 ? 'orange' : 'red'}
                                          style={{ margin: 0 }}
                                        >
                                          相关度: {(item.fusedScore * 100).toFixed(1)}%
                                        </Tag>
                                        <Button
                                          type="text"
                                          size="small"
                                          icon={<CopyOutlined />}
                                          onClick={() => copyToClipboard(item.content)}
                                        />
                                      </Space>
                                    </div>
                                    <div
                                      style={{
                                        padding: '10px',
                                        background: '#f9f9f9',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        lineHeight: '1.7',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        maxHeight: '200px',
                                        overflow: 'auto',
                                        color: '#333',
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

                        {/* 空状态提示 */}
                        {!recallResults && !recallLoading && (
                          <div style={{ textAlign: 'center', padding: '20px', color: '#bbb' }}>
                            <SearchOutlined style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.3 }} />
                            <p>输入查询内容并点击"检索"按钮开始测试知识库的召回效果</p>
                          </div>
                        )}
                      </Space>
                    </Card>
                  )}

                  {/* 文档列表 */}
                  {selectedKb ? (
                    <Table columns={docColumns} dataSource={documents} rowKey="docId" loading={loading} />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                      <DatabaseOutlined style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }} />
                      <p>请先切换到「知识库管理」Tab 选择一个知识库</p>
                    </div>
                  )}
                </>
              ),
            },
          ]}
        />

        {/* ── 创建知识库弹窗 ── */}
        <Modal title="新建知识库" open={createModalVisible} onCancel={() => setCreateModalVisible(false)} footer={null}>
          <Form form={form} onFinish={handleCreateKb} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入知识库名称' }]}>
              <Input placeholder="请输入知识库名称" maxLength={100} showCount />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea placeholder="请输入描述（可选）" rows={3} maxLength={500} showCount />
            </Form.Item>
            <Form.Item name="chunk_size" label="分块大小（token）" initialValue={800} extra="文本切分时的最大字符数，建议 500-1500">
              <Input type="number" min={100} max={2000} />
            </Form.Item>
            <Form.Item name="chunk_overlap" label="分块重叠（token）" initialValue={100} extra="相邻分块之间的重叠字符数，保持上下文连续性">
              <Input type="number" min={0} max={1000} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">创建</Button>
                <Button onClick={() => setCreateModalVisible(false)}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        {/* ── 编辑知识库弹窗 ── */}
        <Modal title="编辑知识库" open={editModalVisible} onCancel={() => { setEditModalVisible(false); setEditingKb(null); }} footer={null}>
          <Form form={editForm} onFinish={handleEditKbSubmit} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入知识库名称' }]}>
              <Input placeholder="请输入知识库名称" maxLength={100} showCount />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea placeholder="请输入描述（可选）" rows={3} maxLength={500} showCount />
            </Form.Item>
            <Form.Item name="chunk_size" label="分块大小（token）" extra="修改后对新上传的文档生效">
              <Input type="number" min={100} max={2000} />
            </Form.Item>
            <Form.Item name="chunk_overlap" label="分块重叠（token）" extra="修改后对新上传的文档生效">
              <Input type="number" min={0} max={1000} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">保存</Button>
                <Button onClick={() => { setEditModalVisible(false); setEditingKb(null); }}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        {/* ── 上传文档弹窗 ── */}
        <Modal title="上传文档" open={uploadModalVisible} onCancel={() => { setUploadModalVisible(false); setFileList([]); }} footer={null}>
          <Form form={uploadForm} onFinish={handleUpload} layout="vertical">
            <Form.Item label="目标知识库">
              <Input value={selectedKbName} disabled />
            </Form.Item>
            <Form.Item label="上传文件" required>
              <Upload
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
              >
                <Button icon={<UploadOutlined />}>选择文件</Button>
              </Upload>
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">上传</Button>
                <Button onClick={() => { setUploadModalVisible(false); setFileList([]); }}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
};

export default KnowledgeBaseManager;
