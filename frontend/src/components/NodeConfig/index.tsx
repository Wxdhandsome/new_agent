import React, { useEffect } from 'react';
import { Form, Input, Select, Button, Space, Card, Divider, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Node } from 'reactflow';
import ParamSelect from '../ParamSelect';
import { useParamPool } from '../../contexts/ParamPoolContext';

const { TextArea } = Input;
const { Option } = Select;

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onUpdateNode: (nodeId: string, data: any) => void;
}

// 开始节点配置
const StartNodeConfig: React.FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
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
const InputNodeConfig: React.FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
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
      <Form.Item>
        <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <strong>参数名:</strong> user_input<br/>
          <span style={{ color: '#666' }}>此节点的输出将自动保存到 user_input 变量</span>
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
const LLMNodeConfig: React.FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
  const [form] = Form.useForm();
  const { params } = useParamPool();

  useEffect(() => {
    form.setFieldsValue(node.data);
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
      
      <Form.Item>
        <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <strong>参数名:</strong> llm_output<br/>
          <span style={{ color: '#666' }}>此节点的输出将自动保存到 llm_output 变量</span>
        </div>
      </Form.Item>
    </Form>
  );
};

// 条件分支节点配置
const ConditionNodeConfig: React.FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
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
const CodeNodeConfig: React.FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
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
      <Form.Item label="编程语言" name="language" initialValue="python">
        <Select>
          <Option value="python">Python</Option>
          <Option value="javascript">JavaScript</Option>
        </Select>
      </Form.Item>

      <Divider orientation="left">输入参数</Divider>
      <Form.Item label="选择输入参数" name="inputParams">
        <ParamSelect placeholder="选择要使用的参数" />
      </Form.Item>

      <Form.Item label="代码" name="code" rules={[{ required: true }]}>
        <TextArea rows={10} placeholder="输入代码，使用 context 对象访问上下文数据" />
      </Form.Item>

      <Form.Item>
        <div style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <strong>参数名:</strong> code_result<br/>
          <span style={{ color: '#666' }}>此节点的输出将自动保存到 code_result 变量</span>
        </div>
      </Form.Item>

      <Form.Item label="超时时间(秒)" name="timeout" initialValue={30}>
        <Input type="number" min={1} max={300} />
      </Form.Item>
    </Form>
  );
};

// 输出节点配置
const OutputNodeConfig: React.FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
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
        <ParamSelect placeholder="选择要输出的参数" />
      </Form.Item>
      <Form.Item label="输出模板" name="template">
        <TextArea rows={6} placeholder="输入输出模板，使用 {{变量名}} 引用上下文变量" />
      </Form.Item>
    </Form>
  );
};

// 结束节点配置
const EndNodeConfig: React.FC<{ node: Node; onUpdate: (data: any) => void }> = ({ node, onUpdate }) => {
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
const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ selectedNode, onUpdateNode }) => {
  if (!selectedNode) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
        <p>请选择一个节点进行配置</p>
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
      default:
        return <div style={{ padding: '20px', color: '#999' }}>未知节点类型</div>;
    }
  };

  const getNodeTypeName = (type: string) => {
    const names: Record<string, string> = {
      start: '开始节点',
      input: '输入节点',
      llm: '大模型节点',
      condition: '条件分支',
      code: '代码节点',
      output: '输出节点',
      end: '结束节点',
    };
    return names[type] || '未知节点';
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
