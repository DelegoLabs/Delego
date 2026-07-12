export interface PublishResult {
  channel: string;
  delivered: boolean;
  attempts: number;
  error?: string;
}

export interface RedisClient {
  publish(channel: string, message: string): Promise<number>;
}
