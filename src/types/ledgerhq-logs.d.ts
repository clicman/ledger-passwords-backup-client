declare module '@ledgerhq/logs' {
  export function listen(callback: (log: any) => void): void;
} 