import { useEffect, useCallback, useState, type FC } from 'react';
import { Form, Input, Select, Button, Card, Divider, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Node } from 'reactflow';
import ParamSelect from '../ParamSelect';
import { useParamPool } from '../../contexts/ParamPoolContext';

const { TextArea } = Input;
const { Option } = Select;

// API 基础 URL
const API_BASE_URL = (import.meta as ImportMeta).env.VITE_BACKEND_URL || 'http://localhost:8001';

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: any) => void;
}

// 开始节点配置
const StartNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(node.data);
  }, [node, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_, allValues) => onUpdate(allValues)}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>
      <Form.Item label="描述" name="description">
        <TextArea rows={3} placeholder="输入节点描述（可选）" />
      </Form.Item>
    </Form>
  );
};

// 输入节点配置
const InputNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    // 初始化 varName（如果未设置）
    const varName = `user_input_${node.id}`;
    form.setFieldsValue({
      ...node.data,
      varName: node.data?.varName || varName,
    });
  }, [node, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_, allValues) => onUpdate(allValues)}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>
      {/* 隐藏的 varName 字段，用于后端识别变量名 */}
      <Form.Item name="varName" hidden>
        <Input />
      </Form.Item>
      <Form.Item>
        <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <strong>参数名:</strong> user_input_{node.id}<br/>
          <span style={{ color: '#666' }}>此节点的输出可通过变量 user_input_{node.id} 引用</span>
        </div>
      </Form.Item>
      <Form.Item label="输入提示" name="placeholder">
        <Input placeholder="输入提示信息" />
      </Form.Item>
      <Form.Item label="输入类型" name="inputType" initialValue="text">
        <Select>
          <Option value="text">文本</Option>
          <Option value="number">数字</Option>
          <Option value="textarea">多行文本</Option>
          <Option value="select">下拉选择</Option>
        </Select>
      </Form.Item>
      <Form.Item label="是否必填" name="required" initialValue={false}>
        <Select>
          <Option value={true}>是</Option>
          <Option value={false}>否</Option>
        </Select>
      </Form.Item>
      <Form.Item label="默认值" name="defaultValue">
        <Input placeholder="输入默认值（可选）" />
      </Form.Item>
    </Form>
  );
};

// 大模型节点配置
const LLMNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();
  const { params } = useParamPool();

  useEffect(() => {
    // 初始化 outputVar（如果未设置）
    const outputVar = `llm_output_${node.id}`;
    form.setFieldsValue({
      ...node.data,
      outputVar: node.data?.outputVar || outputVar,
    });
  }, [node, form]);

  // 插入参数到Prompt模板
  const insertParam = (paramId: string) => {
    const currentPrompt = form.getFieldValue('promptTemplate') || '';
    const newPrompt = currentPrompt + `{{${paramId}}}`;
    form.setFieldsValue({ promptTemplate: newPrompt });
    onUpdate({ ...form.getFieldsValue(), promptTemplate: newPrompt });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_, allValues) => onUpdate(allValues)}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>
      <Form.Item label="模型选择" name="model" initialValue="Qwen3-32B-FP8">
        <Select>
          <Option value="Qwen3-32B-FP8">Qwen3-32B-FP8</Option>
          <Option value="gpt-4">GPT-4</Option>
          <Option value="gpt-3.5-turbo">GPT-3.5 Turbo</Option>
          <Option value="claude-3-opus">Claude 3 Opus</Option>
          <Option value="claude-3-sonnet">Claude 3 Sonnet</Option>
        </Select>
      </Form.Item>
      <Form.Item label="温度 (Temperature)" name="temperature" initialValue={0.7}>
        <Input type="number" min={0} max={2} step={0.1} />
      </Form.Item>
      <Form.Item label="最大Token数" name="maxTokens" initialValue={2000}>
        <Input type="number" min={100} max={8000} step={100} />
      </Form.Item>
      
      <Divider orientation="left">高级配置</Divider>
      
      <Form.Item 
        label="启用思考功能" 
        name="enableThinking" 
        initialValue={true}
        extra="关闭后将禁用模型的思考过程，直接输出结果"
      >
        <Select>
          <Option value={true}>启用</Option>
          <Option value={false}>禁用</Option>
        </Select>
      </Form.Item>
      
      <Form.Item 
        label="在对话中显示输出" 
        name="showOutput" 
        initialValue={true}
        extra="关闭后LLM节点的输出将不在对话界面中显示"
      >
        <Select>
          <Option value={true}>显示</Option>
          <Option value={false}>隐藏</Option>
        </Select>
      </Form.Item>
      
      <Divider orientation="left">提示词配置</Divider>
      
      <Form.Item label="系统提示词" name="systemPrompt">
        <TextArea rows={4} placeholder="输入系统提示词（可选）" />
      </Form.Item>
      
      <Form.Item label="插入参数">
        <Select
          placeholder="选择参数插入到Prompt模板"
          onChange={insertParam}
          style={{ width: '100%' }}
          allowClear
        >
          {params.map((param) => (
            <Option key={param.id} value={param.id}>
              {param.label} ({param.id})
            </Option>
          ))}
        </Select>
      </Form.Item>
      
      <Form.Item label="Prompt模板" name="promptTemplate" rules={[{ required: true }]}>
        <TextArea 
          rows={6} 
          placeholder="输入Prompt模板，使用 {{变量名}} 引用上下文变量，或从上方选择参数自动插入" 
        />
      </Form.Item>
      
      {/* 隐藏的 outputVar 字段，用于后端识别变量名 */}
      <Form.Item name="outputVar" hidden>
        <Input />
      </Form.Item>
      
      <Form.Item>
        <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <strong>参数名:</strong> llm_output_{node.id}<br/>
          <span style={{ color: '#666' }}>此节点的输出可通过变量 llm_output_{node.id} 引用</span>
        </div>
      </Form.Item>
    </Form>
  );
};

// 条件分支节点配置
const ConditionNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(node.data);
  }, [node, form]);

  const conditions = Form.useWatch('conditions', form) || [];

  const addCondition = () => {
    const currentConditions = form.getFieldValue('conditions') || [];
    form.setFieldsValue({
      conditions: [
        ...currentConditions,
        {
          id: `cond_${Date.now()}`,
          variable: '',
          operator: 'equals',
          value: '',
        },
      ],
    });
  };

  const removeCondition = (index: number) => {
    const currentConditions = form.getFieldValue('conditions') || [];
    form.setFieldsValue({
      conditions: currentConditions.filter((_: any, i: number) => i !== index),
    });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_, allValues) => onUpdate(allValues)}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>

      <Divider orientation="left">条件配置</Divider>
      <p style={{ color: '#666', fontSize: '12px', marginBottom: '16px' }}>
        已配置 {conditions.length} 个条件，将生成 {conditions.length + 1} 个分支（包含默认分支）
      </p>

      <Form.List name="conditions">
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }, index) => (
              <Card
                key={key}
                size="small"
                title={`条件 ${index + 1}`}
                extra={
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      remove(index);
                      removeCondition(index);
                    }}
                  />
                }
                style={{ marginBottom: '12px' }}
              >
                <Form.Item
                  {...restField}
                  name={[name, 'variable']}
                  label="选择变量"
                  rules={[{ required: true, message: '请选择变量' }]}
                >
                  <ParamSelect placeholder="选择要比较的参数" />
                </Form.Item>

                <Form.Item
                  {...restField}
                  name={[name, 'operator']}
                  label="操作符"
                  initialValue="equals"
                >
                  <Select>
                    <Option value="equals">等于</Option>
                    <Option value="notEquals">不等于</Option>
                    <Option value="greaterThan">大于</Option>
                    <Option value="lessThan">小于</Option>
                    <Option value="greaterThanOrEqual">大于等于</Option>
                    <Option value="lessThanOrEqual">小于等于</Option>
                    <Option value="contains">包含</Option>
                    <Option value="notContains">不包含</Option>
                    <Option value="startsWith">开头是</Option>
                    <Option value="endsWith">结尾是</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  {...restField}
                  name={[name, 'value']}
                  label="目标值"
                  rules={[{ required: true, message: '请输入目标值' }]}
                >
                  <Input placeholder="输入比较值" />
                </Form.Item>
              </Card>
            ))}

            <Button
              type="dashed"
              onClick={() => {
                add();
                addCondition();
              }}
              block
              icon={<PlusOutlined />}
            >
              添加条件
            </Button>
          </>
        )}
      </Form.List>

      <Divider />

      <Card size="small" title="默认分支" style={{ background: '#f5f5f5' }}>
        <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>
          当所有条件都不满足时，将执行默认分支
        </p>
      </Card>
    </Form>
  );
};

// 代码节点配置
const CodeNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();
  const { addReference, removeReference } = useParamPool();

  useEffect(() => {
    form.setFieldsValue(node.data);
  }, [node, form]);

  const inputVars = Form.useWatch('inputVars', form) || [];

  const addInputVar = () => {
    const currentVars = form.getFieldValue('inputVars') || [];
    form.setFieldsValue({
      inputVars: [
        ...currentVars,
        { name: `arg${currentVars.length + 1}`, sourceType: '输入' },
      ],
    });
  };

  const removeInputVar = (index: number) => {
    const currentVars = form.getFieldValue('inputVars') || [];

    // 如果有引用关系，同时移除
    if (currentVars[index]?.referenceId) {
      removeReference(currentVars[index].referenceId);
    }

    form.setFieldsValue({
      inputVars: currentVars.filter((_: any, i: number) => i !== index),
    });
  };

  // 处理参数类型变化
  const handleSourceTypeChange = useCallback((index: number, sourceType: string) => {
    const currentVars = form.getFieldValue('inputVars') || [];
    if (currentVars[index]) {
      currentVars[index].sourceType = sourceType;
      
      // 如果切换到"输入"类型，清除引用信息
      if (sourceType === '输入') {
        delete currentVars[index].referenceId;
        delete currentVars[index].referencedParamId;
      }
      
      form.setFieldsValue({ inputVars: [...currentVars] });
      onUpdate(form.getFieldsValue());
    }
  }, [form, onUpdate]);

  // 处理引用参数变化
  const handleReferencedParamChange = useCallback((index: number, referencedParamId: string) => {
    const currentVars = form.getFieldValue('inputVars') || [];
    if (!currentVars[index]) return;

    currentVars[index].referencedParamId = referencedParamId;

    // 如果是引用类型，创建或更新引用关系（参数名保持用户自定义）
    if (currentVars[index]?.sourceType === '引用' && referencedParamId && node.id) {
      if (!currentVars[index].referenceId) {
        const refId = addReference({
          sourceNodeId: 'context',
          sourceParamId: referencedParamId,
          targetNodeId: node.id,
          targetParamName: currentVars[index].name || `arg${index + 1}`,
          sourceType: 'reference',
          isActive: true,
        });
        currentVars[index].referenceId = refId;
      }
    }

    form.setFieldsValue({ inputVars: [...currentVars] });
    onUpdate(form.getFieldsValue());
  }, [form, addReference, node.id, onUpdate]);

  const addOutputVar = () => {
    const currentVars = form.getFieldValue('outputVars') || [];
    form.setFieldsValue({
      outputVars: [
        ...currentVars,
        { name: `result${currentVars.length + 1}`, type: 'String' },
      ],
    });
  };

  const removeOutputVar = (index: number) => {
    const currentVars = form.getFieldValue('outputVars') || [];
    form.setFieldsValue({
      outputVars: currentVars.filter((_: any, i: number) => i !== index),
    });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_, allValues) => onUpdate(allValues)}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>
      <Form.Item label="编程语言" name="language" initialValue="python">
        <Select>
          <Option value="python">Python</Option>
          <Option value="javascript">JavaScript</Option>
        </Select>
      </Form.Item>

      <Divider orientation="left">入参</Divider>
      
      <Form.List name="inputVars">
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }, index) => {
              const currentVar = inputVars[index];
              const isReference = currentVar?.sourceType === '引用';
              
              return (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <Row gutter={[8, 8]} align="middle">
                    {/* 参数名输入框 */}
                    <Col span={10}>
                      <Form.Item
                        {...restField}
                        name={[name, 'name']}
                        rules={[{ required: true, message: '请输入参数名' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input 
                          placeholder={isReference ? "输入函数入参名（如 user_text）" : "输入参数名"}
                        />
                      </Form.Item>
                    </Col>

                    {/* 参数类型选择 */}
                    <Col span={6}>
                      <Form.Item
                        {...restField}
                        name={[name, 'sourceType']}
                        initialValue="输入"
                        style={{ marginBottom: 0 }}
                      >
                        <Select onChange={(value) => handleSourceTypeChange(index, value)}>
                          <Option value="输入">输入</Option>
                          <Option value="引用">引用</Option>
                        </Select>
                      </Form.Item>
                    </Col>

                    {/* 引用参数选择下拉框（仅当类型为"引用"时显示） */}
                    {isReference ? (
                      <Col span={6}>
                        <Form.Item
                          {...restField}
                          name={[name, 'referencedParamId']}
                          rules={[{ required: true, message: '请选择参数' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <ParamSelect 
                            placeholder="选择上文参数"
                            onChange={(value) => handleReferencedParamChange(index, value)}
                          />
                        </Form.Item>
                      </Col>
                    ) : null}

                    {/* 删除按钮 */}
                    <Col span={isReference ? 2 : 8}>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          remove(index);
                          removeInputVar(index);
                        }}
                        style={{ width: '100%' }}
                      />
                    </Col>
                  </Row>
                </div>
              );
            })}
            
            <Button
              type="dashed"
              onClick={() => {
                add();
                addInputVar();
              }}
              block
              icon={<PlusOutlined />}
              style={{ marginTop: fields.length > 0 ? 8 : 0 }}
            >
              添加参数
            </Button>
          </>
        )}
      </Form.List>

      <Divider orientation="left">执行代码</Divider>

      <Form.Item label="代码" name="code" rules={[{ required: true }]}>
        <TextArea 
          rows={10} 
          placeholder={`def main(arg1: str, arg2: str) -> dict:\n    # 在此编写你的代码\n    return {'result1': arg1, 'result2': arg2}`}
        />
      </Form.Item>

      <Divider orientation="left">出参</Divider>
      
      <Form.List name="outputVars">
        {(fields, { add, remove }) => (
          <>
            {fields.map(({ key, name, ...restField }, index) => (
              <Row key={key} gutter={8} style={{ marginBottom: '8px' }}>
                <Col span={12}>
                  <Form.Item
                    {...restField}
                    name={[name, 'name']}
                    rules={[{ required: true, message: '请输入参数名' }]}
                  >
                    <Input placeholder="参数名" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    {...restField}
                    name={[name, 'type']}
                    initialValue="String"
                  >
                    <Select>
                      <Option value="String">String</Option>
                      <Option value="Number">Number</Option>
                      <Option value="Boolean">Boolean</Option>
                      <Option value="Object">Object</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={4}>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      remove(index);
                      removeOutputVar(index);
                    }}
                  />
                </Col>
              </Row>
            ))}
            <Button
              type="dashed"
              onClick={() => {
                add();
                addOutputVar();
              }}
              block
              icon={<PlusOutlined />}
            >
              添加新的参数
            </Button>
          </>
        )}
      </Form.List>

      <Form.Item>
        <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <strong>参数传递说明:</strong><br/>
          <span style={{ color: '#666' }}>
            代码返回值会按你在上方配置的“出参名”写入上下文变量，后续节点可直接通过参数下拉进行引用。
          </span>
        </div>
      </Form.Item>

      <Form.Item 
        label="在对话中显示输出" 
        name="showOutput" 
        initialValue={false}
        extra="关闭后代码节点的输出将不在对话界面中显示，但仍会保存到变量中供后续节点使用"
      >
        <Select>
          <Option value={true}>显示</Option>
          <Option value={false}>隐藏</Option>
        </Select>
      </Form.Item>

      <Form.Item label="超时时间(秒)" name="timeout" initialValue={30}>
        <Input type="number" min={1} max={300} />
      </Form.Item>
    </Form>
  );
};

// 输出节点配置
const OutputNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(node.data);
  }, [node, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_, allValues) => onUpdate(allValues)}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>
      <Form.Item label="输出格式" name="format" initialValue="text">
        <Select>
          <Option value="text">纯文本</Option>
          <Option value="json">JSON</Option>
          <Option value="markdown">Markdown</Option>
        </Select>
      </Form.Item>
      <Form.Item label="选择输出参数" name="outputParam">
        <ParamSelect placeholder="选择要输出的参数" style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="输出模板" name="template">
        <TextArea rows={6} placeholder="输入输出模板，使用 {{变量名}} 引用上下文变量" />
      </Form.Item>
    </Form>
  );
};

// RAG 知识库检索节点配置
const RAGNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();
  const [kbs, setKbs] = useState<any[]>([]);
  const { params } = useParamPool();

  useEffect(() => {
    form.setFieldsValue({
      label: node.data?.label || '知识库检索',
      userQuestionVar: node.data?.userQuestionVar || 'user_input',
      kbId: node.data?.kbId,
      outputVar: node.data?.outputVar || 'retrieved_result',
      retrievalMode: node.data?.retrievalMode || 'hybrid',
      topK: node.data?.topK ?? 6,
      candidateK: node.data?.candidateK ?? 20,
      denseWeight: node.data?.denseWeight ?? 0.5,
      sparseWeight: node.data?.sparseWeight ?? 0.5,
      minScore: node.data?.minScore ?? 0.6,
      enableRerank: node.data?.enableRerank ?? false,
      maxChars: node.data?.maxChars ?? 15000,
      showOutput: node.data?.showOutput ?? true,
      ...node.data,
    });
  }, [node, form]);

  useEffect(() => {
    // 加载知识库列表
    fetch(`${API_BASE_URL}/api/kb`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setKbs(data);
      })
      .catch(() => {});
  }, []);

  const handleValuesChange = (_: any, allValues: any) => {
    const selectedKb = kbs.find(k => k.kb_id === allValues.kbId);
    onUpdate({
      ...allValues,
      kbName: selectedKb?.name || '',
    });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={handleValuesChange}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>

      <Divider orientation="left">检索设置</Divider>

      <Form.Item label="用户问题变量" name="userQuestionVar" rules={[{ required: true }]}>
        <Select placeholder="选择用户问题来源变量">
          {params.filter(p => p.type === 'string').map(p => (
            <Option key={p.id} value={p.id}>{p.label}</Option>
          ))}
          <Option value="user_input">user_input (用户输入)</Option>
        </Select>
      </Form.Item>

      <Form.Item label="检索知识库" name="kbId" rules={[{ required: true }]}>
        <Select placeholder="选择知识库">
          {kbs.map(kb => (
            <Option key={kb.kb_id} value={kb.kb_id}>{kb.name}</Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item label="输出变量名" name="outputVar" rules={[{ required: true }]}>
        <Input placeholder="retrieved_result" />
      </Form.Item>

      <Form.Item 
        label="在对话中显示输出" 
        name="showOutput" 
        initialValue={true}
        extra="关闭后检索结果将不在对话界面中显示，仅保存到变量供后续节点使用"
      >
        <Select>
          <Option value={true}>显示</Option>
          <Option value={false}>隐藏</Option>
        </Select>
      </Form.Item>

      <Divider orientation="left">高级检索配置</Divider>

      <Form.Item label="检索模式" name="retrievalMode" initialValue="hybrid">
        <Select>
          <Option value="hybrid">混合检索 (dense + sparse)</Option>
          <Option value="dense_only">仅向量检索</Option>
          <Option value="sparse_only">仅关键词检索</Option>
        </Select>
      </Form.Item>

      <Form.Item label="引用 TopN" name="topK" initialValue={6}>
        <Input type="number" min={1} max={20} />
      </Form.Item>

      <Form.Item label="候选集大小" name="candidateK" initialValue={20}>
        <Input type="number" min={1} max={50} />
      </Form.Item>

      <Form.Item label="最低相关度" name="minScore" initialValue={0.6}>
        <Input type="number" min={0} max={1} step={0.05} />
      </Form.Item>

      <Form.Item label="检索器权重 (dense / sparse)" style={{ marginBottom: 0 }}>
        <Row gutter={8}>
          <Col span={12}>
            <Form.Item name="denseWeight" initialValue={0.5}>
              <Input type="number" min={0} max={1} step={0.1} addonBefore="Dense" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sparseWeight" initialValue={0.5}>
              <Input type="number" min={0} max={1} step={0.1} addonBefore="Sparse" />
            </Form.Item>
          </Col>
        </Row>
      </Form.Item>

      <Form.Item label="检索结果重排" name="enableRerank" initialValue={false}>
        <Select>
          <Option value={true}>启用</Option>
          <Option value={false}>禁用</Option>
        </Select>
      </Form.Item>

      <Form.Item label="最多引用字符数" name="maxChars" initialValue={15000}>
        <Input type="number" min={1000} max={50000} step={1000} />
      </Form.Item>

      <Form.Item>
        <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <strong>输出说明:</strong><br/>
          <span style={{ color: '#666' }}>
            检索结果将保存到指定的输出变量中，包含文档片段、来源、相关度得分等信息。
          </span>
        </div>
      </Form.Item>
    </Form>
  );
};

// 结束节点配置
const EndNodeConfig: FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(node.data);
  }, [node, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={(_, allValues) => onUpdate(allValues)}
    >
      <Form.Item label="节点名称" name="label" rules={[{ required: true }]}>
        <Input placeholder="输入节点名称" />
      </Form.Item>
      <Form.Item label="结束状态" name="status" initialValue="success">
        <Select>
          <Option value="success">成功</Option>
          <Option value="failed">失败</Option>
        </Select>
      </Form.Item>
      <Form.Item label="返回数据" name="returnData">
        <TextArea rows={4} placeholder="输入返回数据模板（可选）" />
      </Form.Item>
    </Form>
  );
};

// 主配置面板组件
const NodeConfigPanel: FC<NodeConfigPanelProps> = ({ selectedNode, onUpdateNode }) => {
  if (!selectedNode) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>👆</div>
        <h4 style={{ color: '#1f2937', marginBottom: '8px', fontWeight: 600 }}>点击画布上的任意节点</h4>
        <p style={{ color: '#8c8c8c', fontSize: '14px', marginBottom: '24px' }}>在这里配置它的参数</p>
        <div style={{ padding: '16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '8px', textAlign: 'left' }}>
          <p style={{ margin: '0 0 8px 0', color: '#52c41a', fontWeight: 600, fontSize: '13px' }}>💡 快速上手</p>
          <p style={{ margin: 0, color: '#4b5563', fontSize: '13px', lineHeight: '1.6' }}>
            试试点击「大模型」节点，配置你的对话模型和提示词模板
          </p>
        </div>
      </div>
    );
  }

  const handleUpdate = (data: any) => {
    onUpdateNode(selectedNode.id, data);
  };

  const renderConfigForm = () => {
    switch (selectedNode.type) {
      case 'start':
        return <StartNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      case 'input':
        return <InputNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      case 'llm':
        return <LLMNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      case 'condition':
        return <ConditionNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      case 'code':
        return <CodeNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      case 'output':
        return <OutputNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      case 'end':
        return <EndNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      case 'rag':
        return <RAGNodeConfig node={selectedNode} onUpdate={handleUpdate} />;
      default:
        return <div style={{ padding: '20px', color: '#999' }}>未知节点类型</div>;
    }
  };

  const getNodeTypeName = (type: string | undefined) => {
    const names: Record<string, string> = {
      start: '开始节点',
      input: '输入节点',
      llm: '大模型节点',
      condition: '条件分支',
      code: '代码节点',
      output: '输出节点',
      end: '结束节点',
    };
    return names[type || ''] || '未知节点';
  };

  return (
    <div style={{ padding: '16px' }}>
      <Card title={`${getNodeTypeName(selectedNode.type)} 配置`} size="small" style={{ marginBottom: '16px' }}>
        <p style={{ color: '#666', fontSize: '12px', marginBottom: '16px' }}>
          节点ID: {selectedNode.id}
        </p>
      </Card>
      {renderConfigForm()}
    </div>
  );
};

export default NodeConfigPanel;
