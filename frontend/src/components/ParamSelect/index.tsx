import React from 'react';
import { Select, Tag, Space } from 'antd';
import { useParamPool } from '../../contexts/ParamPoolContext';

const { Option } = Select;

interface ParamSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  filterType?: 'string' | 'number' | 'boolean' | 'object' | 'all';
  style?: React.CSSProperties;
}

// 来源排序权重
const sourceOrder: Record<string, number> = {
  '全局变量': 1,
  '输入节点': 2,
  '大模型节点': 3,
  '代码节点': 4,
  '其他': 99,
};

// 类型对应的颜色
const typeColors: Record<string, string> = {
  string: 'blue',
  number: 'green',
  boolean: 'orange',
  object: 'purple',
  datetime: 'cyan',
};

const ParamSelect: React.FC<ParamSelectProps> = ({
  value,
  onChange,
  disabled = false,
  placeholder = '选择要使用的参数',
  filterType = 'all',
  style,
}) => {
  const { params } = useParamPool();

  // 根据类型过滤参数
  const filteredParams =
    filterType === 'all'
      ? params
      : params.filter((p) => p.type === filterType || p.type === 'object');

  // 按来源分组并排序
  const groupedParams = filteredParams.reduce((acc, param) => {
    const source = param.source || '其他';
    if (!acc[source]) {
      acc[source] = [];
    }
    acc[source].push(param);
    return acc;
  }, {} as Record<string, typeof params>);

  // 按权重排序来源
  const sortedSources = Object.entries(groupedParams).sort((a, b) => {
    const orderA = sourceOrder[a[0]] || 99;
    const orderB = sourceOrder[b[0]] || 99;
    return orderA - orderB;
  });

  // 自定义下拉框渲染
  const dropdownRender = (menu: React.ReactElement) => (
    <div style={{ maxHeight: '400px', overflow: 'auto' }}>
      {menu}
    </div>
  );

  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      style={{ width: '100%', ...style }}
      showSearch
      optionFilterProp="children"
      dropdownRender={dropdownRender}
      popupMatchSelectWidth={false}
      dropdownStyle={{ minWidth: '280px', maxWidth: '400px' }}
    >
      {sortedSources.map(([source, sourceParams]) => (
        <Select.OptGroup 
          key={source} 
          label={
            <span style={{ 
              fontWeight: 600, 
              color: '#262626',
              fontSize: '13px',
              padding: '4px 0'
            }}>
              {source}
            </span>
          }
        >
          {sourceParams.map((param) => (
            <Option key={param.id} value={param.id}>
              <Space direction="vertical" size={0} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span style={{ 
                    fontSize: '14px', 
                    color: '#262626',
                    maxWidth: '180px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {param.label}
                  </span>
                  <Tag 
                    color={typeColors[param.type] || 'default'}
                    style={{ fontSize: '11px', margin: 0 }}
                  >
                    {param.type}
                  </Tag>
                </Space>
                <span style={{ 
                  fontSize: '12px', 
                  color: '#8c8c8c',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '250px'
                }}>
                  ID: {param.id}
                  {param.description && ` · ${param.description}`}
                </span>
              </Space>
            </Option>
          ))}
        </Select.OptGroup>
      ))}
    </Select>
  );
};

export default ParamSelect;
