// resume-route.js の型(TypeScript のテストから使うため)。
export const LIST_PARAM: string;
export function wantsList(search: string): boolean;
export interface ResumableRequest {
  id: string;
  status: string;
  helpers: ReadonlyArray<{ userId: string; arrivedAt: string | null }>;
}
export function resumePageFor(
  request: ResumableRequest | null,
  userId: string,
  options?: { seenFinishIds?: ReadonlyArray<string> },
): string | null;
