/**
 * Keep the image-model selection in one place so generation, local edits and
 * the layers experiment always use the same rendering engine. Read the value
 * at request time: PM2 can then switch models without rebuilding the bundle.
 */
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst";

export function imageModel() {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}
