// face-check.js の型(TypeScript のテストから使うため)。
export interface MatchOptions {
  readonly order: number;
  readonly multiplier: number;
  readonly min: number;
  readonly max: number;
}
export interface LivenessChallenge {
  readonly id: "blink" | "turn-left" | "turn-right" | "open-mouth";
  readonly label: string;
  readonly gestures: readonly string[];
}
export interface MatchResult {
  readonly kind: "match" | "mismatch" | "no-face";
  readonly where: "id" | "selfie" | null;
  readonly similarity: number;
}
export interface ChallengeProgress {
  readonly index: number;
  readonly streak: number;
}
export const FACE_MATCH_THRESHOLD: number;
export const MATCH_OPTIONS: MatchOptions;
export const LIVENESS_CHALLENGES: readonly LivenessChallenge[];
export const MOUTH_OPEN_PERCENT: number;
export const CHALLENGE_FRAMES_REQUIRED: number;
export function isEmbedding(value: unknown): value is number[];
export function faceSimilarity(a: unknown, b: unknown, options?: MatchOptions): number;
export function judgeFaceMatch(
  idEmbedding: number[] | null,
  selfieEmbedding: number[] | null,
  threshold?: number,
): MatchResult;
export function describeMatch(result: MatchResult): string;
export function pickChallenges(random?: () => number, count?: number): LivenessChallenge[];
export function isChallengeMet(challenge: LivenessChallenge, gestures: readonly string[]): boolean;
export function advanceChallenge(
  progress: ChallengeProgress,
  challenges: readonly LivenessChallenge[],
  gestures: readonly string[],
): ChallengeProgress;
export function areChallengesDone(
  progress: ChallengeProgress,
  challenges: readonly LivenessChallenge[],
): boolean;
export function pickLargestFace<T extends { box: readonly [number, number, number, number] }>(
  faces: readonly T[],
): T | null;
export function buildVerifyPayload(
  userId: string,
  liveness: boolean,
): { userId: string; method: "face-match-demo"; liveness: boolean };
