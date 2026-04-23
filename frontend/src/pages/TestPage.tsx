import { FC } from 'react';

const TestPage: FC = () => {
  console.log('TestPage rendering');
  return (
    <div style={{ 
      padding: '40px', 
      background: '#f0f2f5', 
      minHeight: '100vh',
      textAlign: 'center'
    }}>
      <h1 style={{ color: '#1890ff' }}>测试页面</h1>
      <p>如果你能看到这个页面，说明React应用正常运行！</p>
    </div>
  );
};

export default TestPage;
