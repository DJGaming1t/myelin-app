/** Layout-only geometry. No scheduling or task state belongs in this module. */
export function dayMapSheetLayout(height: number, topInset: number, bottomInset: number, fontScale = 1) {
  const usableHeight = Math.max(320, height - topInset);
  const dockClearance = 80 + Math.max(bottomInset, 12);
  const previewHeight = 212 + Math.round(Math.max(0, Math.min(fontScale, 1.6) - 1) * 80);
  const expandedSheetTop = Math.max(0, Math.min(166, Math.max(123, usableHeight * .23), usableHeight - dockClearance - 260));
  const collapsedSheetTop = Math.max(expandedSheetTop + 80, usableHeight - dockClearance - previewHeight);
  return {
    dockClearance, collapsedSheetTop, expandedSheetTop,
    expandDistance: collapsedSheetTop - expandedSheetTop,
    heroStageHeight: Math.max(48, collapsedSheetTop - 202),
  };
}
