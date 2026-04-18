export interface DefaultPipelineStage {
  name: string;
  icon: string;
  stage_order: number;
  has_gate: boolean;
}

export const DEFAULT_PIPELINE_STAGES: ReadonlyArray<DefaultPipelineStage> = [
  { stage_order: 1, name: 'Backlog',     icon: 'inbox',            has_gate: false },
  { stage_order: 2, name: 'Refinement',  icon: 'sparkles',         has_gate: false },
  { stage_order: 3, name: 'Ready',       icon: 'check-circle',     has_gate: true  },
  { stage_order: 4, name: 'In Progress', icon: 'play',             has_gate: false },
  { stage_order: 5, name: 'Code Review', icon: 'git-pull-request', has_gate: true  },
  { stage_order: 6, name: 'QA',          icon: 'flask',            has_gate: false },
  { stage_order: 7, name: 'Staging',     icon: 'layers',           has_gate: true  },
  { stage_order: 8, name: 'Released',    icon: 'rocket',           has_gate: false },
  { stage_order: 9, name: 'Done',        icon: 'archive',          has_gate: false },
];
