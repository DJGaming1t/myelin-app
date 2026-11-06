import { PlanBlock, TodayPlan } from './planner';

// A short focus session must fit real remaining capacity and have a topic.
// It never changes the daily budget, task estimate, or normal focus length.
export function shortSession(plan: TodayPlan): PlanBlock | null {
  if (plan.remainingBudgetMinutes < 5) return null;
  const block = plan.blocks.find(
    (item) => item.focusable && (item.topicId || item.taskId),
  );
  if (!block) return null;
  const minutes = Math.min(10, block.minutes, plan.remainingBudgetMinutes);
  return minutes >= 5 ? { ...block, mode: 'study', minutes } : null;
}
