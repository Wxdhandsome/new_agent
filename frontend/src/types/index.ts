export interface WorkflowNodeData {
  label: string;
  [key: string]: any;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data: WorkflowNodeData;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Workflow {
  workflowId: string;
  workflowName: string;
  description?: string;
  status: 'draft' | 'published' | 'disabled';
  creator: string;
  creatorId: string;
  createTime: string;
  updateTime: string;
  graphData?: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
}

export interface WorkflowCreateRequest {
  workflowName: string;
  description?: string;
  graphData?: any;
}

export interface WorkflowUpdateRequest {
  graphData?: any;
  status?: string;
  workflowName?: string;
}
