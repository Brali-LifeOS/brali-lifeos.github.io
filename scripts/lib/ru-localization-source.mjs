import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from "./localization-source.mjs";

// Backward-compatible RU facade. The localization system now has one canonical
// authoring-source implementation for every human-interface locale. Keeping the
// old function name avoids breaking legacy RU checks while preventing the
// Russian pipeline from drifting to a second definition of source truth.
export { localizationSourceSnapshot };

export async function loadRussianLocalizationAuthoringIndex(root = process.cwd()) {
  return loadLocalizationAuthoringIndex(root);
}
