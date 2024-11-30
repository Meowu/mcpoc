import { spawn } from "node:child_process";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";

export class MCPClient {
  private process: ReturnType<typeof spawn>;

  constructor(private readonly server: string) {
    this.process = spawn("node", [server], {
      stdio: ["pipe", "pipe", process.stderr],
    });

    // Log errors from the MCP process
    this.process.on("error", (error) => {
      console.error("Failed to spawn MCP server:", error.message);
    });

    this.process.on("exit", (code) => {
      console.log(`MCP server exited with code ${code}`);
    });
  }

  async start() {
   
    this.process.stdout?.on("data", (data) => {
      const { result } = JSON.parse(data)
      let text = ''
      if (result?.content) {
        const {content} = result
        text = JSON.stringify(JSON.parse(content.text), null, 2);
      } else {
        text = JSON.stringify(result, null, 2);
      }
      console.log(`MCP server sent data:\n${text}`);
    });

    this.process.stderr?.on("data", (data) => {
      console.error(`MCP server sent error:\n${data}`);
    });
  }

  async sendMessage(message: JSONRPCMessage): Promise<void> {
    this.process.stdin?.write(serializeMessage(message));
  }

  async listTools(): Promise<void> {
    const msg: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
     };

    this.sendMessage(msg);
   }

   async callTool(name: string, args: Record<string, unknown> = {}): Promise<void> {
    const msg: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 2,
      method: `tools/call`,
      params: {
        name,
       arguments: args,
      },
     };
     this.sendMessage(msg);
   }
}

async function main() {
  const client = new MCPClient("build/index.js");
  client.start();
  client.listTools();
  client.callTool('get_forecast', { city: 'Shenzhen' });
}

main()