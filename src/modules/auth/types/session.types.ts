export interface SessionMeta {
  deviceInfo?: string | null;
  ipAddress?: string | null;
}

export interface ActiveSessionDto {
  id: number;
  deviceInfo: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}
