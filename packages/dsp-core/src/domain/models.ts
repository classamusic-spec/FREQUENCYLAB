import type { Protocol } from '../protocol/schema.js';

/**
 * Domain models shared by storage, analysis and the UI.
 *
 * Everything the user creates is owned by the user (§74): each of these types
 * serialises to plain JSON and is included verbatim in the data export, so a
 * session history can leave the product without loss.
 */

export type ExperienceLevel = 'simple' | 'explorer' | 'lab';

export interface UserPreferences {
  experienceLevel: ExperienceLevel;
  reducedMotion: boolean;
  hapticsEnabled: boolean;
  /** Master output ceiling the user chose during calibration, 0..1. */
  comfortableOutputLevel: number;
  sampleRate: number;
  /** Opt-in. The core product never requires it. */
  biometricsEnabled: boolean;
  analyticsEnabled: boolean;
  theme: 'dark' | 'light' | 'system';
  onboardingCompletedAt?: string;
  calibrationCompletedAt?: string;
  defaultBinauralMode: 'offset' | 'centered';
  dspDebugEnabled: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  experienceLevel: 'simple',
  reducedMotion: false,
  hapticsEnabled: true,
  comfortableOutputLevel: 0.5,
  sampleRate: 48000,
  biometricsEnabled: false,
  analyticsEnabled: true,
  theme: 'dark',
  defaultBinauralMode: 'offset',
  dspDebugEnabled: false,
};

/** Outcomes a session can be rated on. `custom` metrics are user-defined. */
export type MetricKey = 'relaxation' | 'focus' | 'mood' | 'sleepiness' | 'stress' | string;

export const BUILT_IN_METRICS: Array<{ key: MetricKey; label: string; description: string }> = [
  { key: 'relaxation', label: 'Relaxation', description: 'How relaxed you felt afterwards.' },
  { key: 'focus', label: 'Focus', description: 'How clear and directed your attention felt.' },
  { key: 'mood', label: 'Mood', description: 'How your mood compared with before.' },
  { key: 'sleepiness', label: 'Sleepiness', description: 'How close to sleep you felt.' },
  { key: 'stress', label: 'Perceived stress', description: 'How much tension you noticed.' },
];

export interface SubjectiveRating {
  metric: MetricKey;
  /** 0..10, one decimal place. */
  value: number;
}

export type SessionEndReason =
  | 'completed'
  | 'stoppedByUser'
  | 'interrupted'
  | 'routeLost'
  | 'error';

export interface SessionMetrics {
  /** Seconds of audio actually rendered, excluding paused time. */
  playedSec: number;
  /** playedSec / protocol duration, 0..1. */
  adherence: number;
  pauseCount: number;
  /** Peak gain reduction the limiter applied during the session, in dB. */
  peakGainReductionDb: number;
  /** Render underruns reported by the audio backend. */
  underruns: number;
  outputRoute?: string;
  headphonesDetected?: boolean;
}

export interface BiometricSample {
  /** ISO timestamp. */
  at: string;
  kind: 'heartRate' | 'hrvSdnn' | 'respiratoryRate' | 'spo2';
  value: number;
  unit: string;
  source: string;
}

export interface BiometricSummary {
  preSessionHeartRate?: number;
  duringSessionHeartRate?: number;
  postSessionHeartRate?: number;
  preSessionHrv?: number;
  postSessionHrv?: number;
  respiratoryRate?: number;
  samples: BiometricSample[];
}

export interface Session {
  id: string;
  protocolId: string;
  protocolName: string;
  /** Fingerprint of the protocol as it ran, so history survives later edits. */
  protocolFingerprint: string;
  humanDna: string;
  dspVersion: string;
  startedAt: string;
  endedAt: string;
  plannedDurationSec: number;
  endReason: SessionEndReason;
  metrics: SessionMetrics;
  ratings: SubjectiveRating[];
  note?: string;
  /** Set when the session was part of an experiment. */
  experimentId?: string;
  /** Which arm ran. Written only once the experiment is unblinded. */
  experimentArm?: ExperimentArm;
  biometrics?: BiometricSummary;
  /** Snapshot of the protocol, so a session is reproducible for ever. */
  protocolSnapshot?: Protocol;
}

export type ExperimentArm = 'A' | 'B' | 'control';

export type ExperimentStatus = 'draft' | 'running' | 'complete' | 'abandoned';

export interface ExperimentAssignment {
  /** 0-based index of the session within the experiment. */
  index: number;
  /**
   * Commitment to the arm: SHA-256 of `experimentId:index:arm:salt`.
   * Stored alongside the sealed arm so a reveal can be verified rather than
   * trusted — an assignment cannot be rewritten after the fact.
   */
  commitment: string;
  /** The arm. Repositories must not expose this while the experiment is blind. */
  sealedArm: ExperimentArm;
  /** Set when the session for this assignment has been run. */
  sessionId?: string;
  completedAt?: string;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis?: string;
  status: ExperimentStatus;
  createdAt: string;
  updatedAt: string;
  /** Protocol ids for each arm. `control` is optional. */
  protocolA: string;
  protocolB: string;
  protocolControl?: string;
  /** Outcome measures the user will rate after every session. */
  metrics: MetricKey[];
  /** Target number of sessions per arm. */
  sessionsPerArm: number;
  blinded: boolean;
  /** Salt for the commitment scheme. Generated once, never changed. */
  salt: string;
  assignments: ExperimentAssignment[];
  /** Set when the user chose to unblind. Ratings before this are unbiased. */
  revealedAt?: string;
}

export interface SafetyEvent {
  id: string;
  at: string;
  kind:
    | 'routeLost'
    | 'headphonesMissing'
    | 'limiterEngaged'
    | 'highLevelWarning'
    | 'interruption'
    | 'underrun';
  detail: string;
  sessionId?: string;
}

export interface AiRequest {
  id: string;
  at: string;
  prompt: string;
  /** Protocol the assistant proposed. Never saved or run without review. */
  proposal?: Protocol;
  rationale?: string;
  /** Set when the request was declined on safety grounds. */
  declinedReason?: string;
  accepted: boolean;
}

export interface CommunityCreator {
  handle: string;
  displayName: string;
  followers: number;
}

export interface CommunityPost {
  id: string;
  protocolId: string;
  protocolFingerprint: string;
  creator: CommunityCreator;
  publishedAt: string;
  title: string;
  summary?: string;
  /** Aggregate counts supplied by the backend. Never fabricated on device. */
  sessionCount: number;
  ratingCount: number;
  averageRating: number;
  averageReportedOutcome?: { metric: MetricKey; value: number };
  forkCount: number;
  tags: string[];
}

export interface Favorite {
  protocolId: string;
  at: string;
}

export interface Follow {
  handle: string;
  at: string;
}

export interface Comment {
  id: string;
  postId: string;
  author: CommunityCreator;
  at: string;
  body: string;
}
