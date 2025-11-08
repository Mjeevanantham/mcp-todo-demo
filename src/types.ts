export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: any;
};
export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
};
export type ClientSession = {
  id: string;
  ws: import("ws").WebSocket;
  subscriptions: Set<string>;
  identity?: any;
};
