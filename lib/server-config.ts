export function openAIKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

export function roboflowKey() {
  return process.env.ROBOFLOW_API_KEY?.trim() || "";
}
