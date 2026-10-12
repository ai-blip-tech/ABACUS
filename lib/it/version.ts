export const ONO_CORE_VERSION = "2.0.0-preview" as const;
export const ONO_PROTOCOL_VERSION = "2.0-preview" as const;

export const onoV2Enabled = () => process.env.NEXT_PUBLIC_ONO_V2_ENABLED !== "false";
export const onoServerEnabled = () => process.env.ONO_V2_ENABLED !== "false";
