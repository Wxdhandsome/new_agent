import React from 'react';
import { Select, Tooltip } from 'antd';
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

  // 按来源分组
  const groupedParams = filteredParams.reduce((acc, param) => {
    if (!acc[param.source]) {
      acc[param.source] = [];
    }
    acc[param.source].push(param);
    return acc;
  }, {} as Record<string, typeof params>);

  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      style={{ width: '100%', ...style }}
      showSearch
      optionFilterProp="children"
    >
      {Object.entries(groupedParams).map(([source, sourceParams]) => (
        <Select.OptGroup key={source} label={source}>
          {sourceParams.map((param) => (
            <Option key={param.id} value={param.id}>
              <Tooltip title={`${param.description || ''} (类型: ${param.type})`}>
                <span>
                  {param.label}
                  <span style={{ color: '#999', fontSize: '12px', marginLeft: '4px' }}>
                    ({param.type})
                  </span>
                </span>
              </Tooltip>
            </Option>
          ))}
        </Select.OptGroup>
      ))}
    </Select>
  );
};

export default ParamSelect;
