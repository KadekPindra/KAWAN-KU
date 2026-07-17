export type Cycle = string;
export type Week = string;

export type Trend = 'new' | 'improving' | 'flat' | 'worsening';
export type NeedSource = 'member' | 'community';
export type NeedStatus = 'open' | 'filled' | 'expired';
export type InviteState = 'shown' | 'claimed' | 'declined' | 'ignored' | 'closed';
export type RiskSource = 'risk_item' | 'self_referral';
export type Effort = 'low' | 'medium' | 'high';
export type Anchor = 1 | 2 | 3;

export interface Person {
  id: string;
  teamId: string;
  displayName: string;
  slackUserId: string | null;
  joinedAt: Date;
  interests: string[];
  optedIn: boolean;
  riskConsent: boolean;
}

export interface Screening {
  id: string;
  teamId: string;
  personId: string;
  cycle: Cycle;
  q1: Anchor | null;
  q2: Anchor | null;
  q3: Anchor | null;
  ucla3Score: number | null;
  lonely: boolean | null;
  deliveredAt: Date | null;
  answeredAt: Date | null;
  createdAt: Date;
}

export interface DetectionState {
  teamId: string;
  personId: string;
  cycle: Cycle;
  lonely: boolean;
  lonelyStreak: number;
  trend: Trend;
  flagged: boolean;
  clinicalSuggest: boolean;
}

export interface ParsedNeed {
  activity: string;
  skill: string;
  slots: number;
  when: string;
  location: string;
  effort: Effort;
}

export interface InviteCopy {
  problem: string;
  needFramed: string;
  claimLabel: string;
}

export interface Need {
  id: string;
  teamId: string;
  source: NeedSource;
  rawText: string;
  parsed: ParsedNeed | null;
  slotsTotal: number;
  slotsOpen: number;
  week: Week;
  status: NeedStatus;
  createdAt: Date;
}

export interface Pool {
  id: string;
  needId: string;
  week: Week;
  memberIds: string[];
  skewedIds: string[];
}

export interface Invite {
  id: string;
  poolId: string;
  personId: string;
  needId: string;
  deliveredAt: Date | null;
  state: InviteState;
  claimedAt: Date | null;
}

export interface Outcome {
  id: string;
  inviteId: string;
  personId: string;
  needId: string;
  showedUp: boolean | null;
  createdAt: Date;
}

export interface RiskEvent {
  id: string;
  personId: string;
  cycle: Cycle;
  source: RiskSource;
  handedOffAt: Date | null;
  createdAt: Date;
}

export interface InstitutionMetrics {
  teamId: string;
  period: string;
  respondedCount: number | null;
  lonelyCount: number | null;
  invitesSent: number | null;
  claimRate: number | null;
  avgUcla3: number | null;
}
