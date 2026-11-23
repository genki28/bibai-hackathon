// help-request-fields.js の型(TypeScript のテストから使うため)。
export function amountOf(value: string): "little" | "normal" | "lots";
export function toolsTextOf(
  items: ReadonlyArray<{ readonly label: string; readonly isChecked: boolean; readonly count: number }>,
): string;
