export interface StrategyDoc {
  segment: string;
  subsegment: string;
  wantList: string;
  tenRequests: string;
  painQuestions: string;
  deepDesires: string;
  finalResult: string;
  triedBefore: string;
  threeKeyPains: string;
  mainAnnoying: string;
  createdAt: string;
}

export interface ProductDoc {
  type: 'main' | 'mini' | 'free';
  icon: string;
  label: string;
  name: string;
  description: string;
  price: string;
  duration: string;
}

export interface ProjectData {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  strategy: StrategyDoc;
  products: ProductDoc[];
}

export const PROJECTS_DATA: Record<string, ProjectData> = {};
