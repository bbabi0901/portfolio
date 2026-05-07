import "server-only";
import { listAvailableModels, type ModelId } from "./models";

export function listAvailableModelIds(): ModelId[] {
  return listAvailableModels().map((m) => m.id);
}
