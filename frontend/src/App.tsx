import { useState } from 'react';
import { ConfigProvider, Layout, App as AntdApp, Menu, Badge } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ProjectOutlined, DatabaseOutlined, GithubOutlined, SettingOutlined } from '@ant-design/icons';
import WorkflowList from './pages/WorkflowList';
import WorkflowEditor from './pages/WorkflowEditor';
import KnowledgeBaseManager from './pages/KnowledgeBaseManager';
import ErrorBoundary from './components/ErrorBoundary';
import type { Workflow } from './types/index';

type ViewMode = 'list' | 'edit' | 'view' | 'demo' | 'kb';

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('list');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  const handleEdit = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setCurrentView('edit');
  };

  const handleView = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setCurrentView('view');
  };

  const handleDemo = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setCurrentView('demo');
  };

  const handleBack = () => {
    setSelectedWorkflow(null);
    setCurrentView('list');
  };

  const menuItems = [
    { key: 'list', icon: <ProjectOutlined />, label: '工作流' },
    { key: 'kb', icon: <DatabaseOutlined />, label: '知识库' },
  ];

  const renderHeader = () => (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #001529 0%, #002140 100%)',
        padding: '0 24px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
          marginRight: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
          }}
        >
          <ProjectOutlined />
        </div>
        <span>AI 工作流搭建系统</span>
      </div>
      <Menu
        theme="dark"
        mode="horizontal"
        selectedKeys={[currentView]}
        items={menuItems}
        onClick={({ key }) => setCurrentView(key as ViewMode)}
        style={{ flex: 1, background: 'transparent' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Badge dot color="#52c41a">
          <SettingOutlined style={{ color: 'rgba(255,255,255,0.65)', fontSize: '18px', cursor: 'pointer' }} />
        </Badge>
        <GithubOutlined
          style={{ color: 'rgba(255,255,255,0.65)', fontSize: '18px', cursor: 'pointer' }}
          onClick={() => window.open('https://github.com', '_blank')}
        />
      </div>
    </Layout.Header>
  );

  return (
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <ErrorBoundary>
          {currentView === 'list' && (
            <Layout style={{ height: '100vh', overflow: 'hidden' }}>
              {renderHeader()}
              <Layout.Content
                style={{
                  background: '#f5f7fa',
                  overflow: 'auto',
                  padding: '0',
                }}
              >
                <WorkflowList onEdit={handleEdit} onView={handleView} onDemo={handleDemo} />
              </Layout.Content>
            </Layout>
          )}
          {currentView === 'kb' && (
            <Layout style={{ height: '100vh', overflow: 'hidden' }}>
              {renderHeader()}
              <Layout.Content
                style={{
                  background: '#f5f7fa',
                  overflow: 'auto',
                  padding: '0',
                }}
              >
                <KnowledgeBaseManager />
              </Layout.Content>
            </Layout>
          )}
          {(currentView === 'edit' || currentView === 'view' || currentView === 'demo') && (
            <WorkflowEditor
              workflow={selectedWorkflow}
              onBack={handleBack}
              readOnly={currentView === 'view'}
              autoOpenPreview={currentView === 'demo'}
            />
          )}
        </ErrorBoundary>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
