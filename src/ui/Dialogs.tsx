// The open modal dialog. Each dialog is in src/ui/dialogs.

import { useStore } from "../state/store";
import { AiSettingsDialog } from "./dialogs/AiSettingsDialog";
import { NewGameDialog } from "./dialogs/NewGameDialog";
import { ReportDialog } from "./dialogs/ReportDialog";
import { RecoveryDialog, UnsavedDialog, UpdateDialog } from "./dialogs/SessionDialogs";
import { SettingsDialog } from "./dialogs/SettingsDialog";
import { LogDialog, ReanalyzeDialog, TimerDialog, TsumegoDialog } from "./dialogs/ToolDialogs";

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  if (dialog === "unsaved") return <UnsavedDialog />;
  if (dialog === "recovery") return <RecoveryDialog />;
  if (dialog === "reanalyze") return <ReanalyzeDialog />;
  if (dialog === "report") return <ReportDialog />;
  if (dialog === "timer") return <TimerDialog />;
  if (dialog === "tsumego") return <TsumegoDialog />;
  if (dialog === "newgame") return <NewGameDialog />;
  if (dialog === "settings") return <SettingsDialog />;
  if (dialog === "ai") return <AiSettingsDialog />;
  if (dialog === "log") return <LogDialog />;
  if (dialog === "update") return <UpdateDialog />;
  return null;
}
