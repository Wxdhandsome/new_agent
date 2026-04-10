import React, { useState } from 'react';
import { ConfigProvider, Layout, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import WorkflowList from './pages/WorkflowList';
import WorkflowEditor from './pages/WorkflowEditor';
import type { Workflow } from './types/index';

type ViewMode = 'list' | 'edit' | 'view';

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('list');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  console.log('App rendering, currentView:', currentView);

  const handleEdit = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setCurrentView('edit');
  };

  const handleView = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setCurrentView('view');
  };

  const handleBack = () => {
    setSelectedWorkflow(null);
    setCurrentView('list');
  };

  return (
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        {currentView === 'list' && (
          <Layout style={{ height: '100vh' }}>
            <Layout.Header style={{ display: 'flex', alignItems: 'center', background: '#001529', padding: '0 24px' }}>
              <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>
                AI 工作流搭建系统
              </div>
            </Layout.Header>
            <Layout.Content style={{ background: '#f0f2f5' }}>
              <WorkflowList onEdit={handleEdit} onView={handleView} />
            </Layout.Content>
          </Layout>
        )}
        {(currentView === 'edit' || currentView === 'view') && (
          <WorkflowEditor 
            workflow={selectedWorkflow} 
            onBack={handleBack}
            readOnly={currentView === 'view'}
          />
        )}
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
