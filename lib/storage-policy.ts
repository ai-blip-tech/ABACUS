export const GENERATION_RETENTION_DAYS = 30;
export const GENERATION_IMAGE_DELETED_MESSAGE = "Изображение удалено по политике хранения";

const GENERATED_IMAGE_KEY = /^tenants\/[^/]+\/users\/[^/]+\/generations\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

export function isEligibleGenerationOutput(row: { output_key: string; content_type: string }) {
  return row.content_type === "image/webp" && GENERATED_IMAGE_KEY.test(row.output_key);
}
