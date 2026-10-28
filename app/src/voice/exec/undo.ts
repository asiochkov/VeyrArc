import {
  archiveQuit, clearMood, deleteEvent, deleteGoal, deleteGoalStep, deleteHabit, logGoalTask, logHabit, logMood, logWater,
  renameGoalStep, restoreGoalStep, restoreQuit, saveDayNote, saveDiary, saveEvent, saveOath, setEventDone, undoRelapseOp, updateGoal, updateHabit, updateQuit,
} from '../../state/actions';
import { restoreLocal } from '../../pages/today/WeeklyReview';
import { usePrefs, type Prefs } from '../prefs';
import type { UndoOp } from './types';

/**
 * Brings one change back (ТЗ 5.3 UndoOp, 6.10.1). Every op is plain data, so the journal can keep it across reloads;
 * everything goes through state/actions.ts (H5): the offline queue, the rollback and the sync work as for a tap.
 * Ops of a batch are applied in reverse order.
 */
export function applyUndo(op: UndoOp): void {
  switch (op.t) {
    case 'habit.log': return logHabit(op.habitId, op.prev?.value ?? 0, op.prev?.done ?? false, op.day);
    case 'mood': return op.prev == null ? clearMood(op.day) : logMood(op.prev - 1, op.day);
    case 'water': return logWater(op.prev, op.day);
    case 'note': return saveDayNote(op.day, op.prev);
    case 'event.save': return saveEvent(op.row, op.wasNew);
    case 'event.delete': return deleteEvent(op.id);
    case 'event.done': return setEventDone(op.id, op.prev);
    case 'habit.create': return deleteHabit(op.id);
    case 'habit.patch': return updateHabit(op.id, op.prev as never);
    case 'goal.create': return deleteGoal(op.id);
    case 'goal.patch': return updateGoal(op.id, op.prev as never);
    case 'step.add': { deleteGoalStep(op.id); return; }
    case 'step.restore': return restoreGoalStep(op.row);
    case 'step.rename': return renameGoalStep(op.id, op.prev);
    case 'goal.task': return logGoalTask(op.goalId, op.taskId, op.prev, op.day);
    case 'quit.add': { archiveQuit(op.id, true); return; }
    case 'quit.patch': return updateQuit(op.id, op.prev as never);
    case 'quit.archive': { if (!op.prev && op.row) restoreQuit(op.row); else archiveQuit(op.id, true); return; }
    case 'relapse.undo': return undoRelapseOp(op);
    case 'diary': return saveDiary(op.goalId, op.day, op.prev ?? '', () => {}, () => {});
    case 'oath': return saveOath(op.arcId, op.prev ?? '');
    case 'local': return restoreLocal(op.key, op.prev);
    case 'prefs': return usePrefs.getState().set({ [op.key]: op.prev } as Partial<Prefs>);
    case 'batch': { for (const o of [...op.ops].reverse()) applyUndo(o); return; }
  }
}
