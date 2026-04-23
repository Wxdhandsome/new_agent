import { useState } from 'react';
import { ConfigProvider, Layout, App as AntdApp, Menu } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ProjectOutlined, DatabaseOutlined } from '@ant-design/icons';
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

  return (
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <ErrorBoundary>
        {currentView === 'list' && (
          <Layout style={{ height: '100vh' }}>
            <Layout.Header style={{ display: 'flex', alignItems: 'center', background: '#001529', padding: '0 24px' }}>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginRight: '40px' }}>
                AI 工作流搭建系统
              </div>
              <Menu
                theme="dark"
                mode="horizontal"
                selectedKeys={[currentView]}
                items={menuItems}
                onClick={({ key }) => setCurrentView(key as ViewMode)}
                style={{ flex: 1, background: 'transparent' }}
              />
            </Layout.Header>
            <Layout.Content style={{ background: '#f0f2f5' }}>
              <WorkflowList onEdit={handleEdit} onView={handleView} onDemo={handleDemo} />
            </Layout.Content>
          </Layout>
        )}
        {currentView === 'kb' && (
          <Layout style={{ height: '100vh' }}>
            <Layout.Header style={{ display: 'flex', alignItems: 'center', background: '#001529', padding: '0 24px' }}>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', marginRight: '40px' }}>
                AI 工作流搭建系统
              </div>
              <Menu
                theme="dark"
                mode="horizontal"
                selectedKeys={[currentView]}
                items={menuItems}
                onClick={({ key }) => setCurrentView(key as ViewMode)}
                style={{ flex: 1, background: 'transparent' }}
              />
            </Layout.Header>
            <Layout.Content style={{ background: '#f0f2f5' }}>
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
