import { ChildProcess, spawn } from "node:child_process";
import { serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import * as readline from "node:readline";
import inquirer from "inquirer";

export class FSClient {
  private process!: ChildProcess;
  private tools: string[] = [];
  constructor(
    private serverPath: string,
    private allowedDirecories: readonly string[] = []
  ) {
    this.process = spawn("node", [serverPath, ...allowedDirecories], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", process.stderr],
    });

    this.process.on("error", (error) => {
      console.error(`Failed to spawn MCP server: ${error.message}`);
    });

    this.process.on("exit", (code, signal) => {
      console.error(`MCP server exited with code ${code} and signal ${signal}`);
    });

    this.process.on("close", () => {
      console.log("MCP server closed");
    });
  }

  async start() {
    this.process.stdout?.on("data", async (data: Buffer) => {
      const response = JSON.parse(data.toString("utf-8"));
      // console.log("response: ", response);
      const { result } = response;
      if (Array.isArray(result.tools)) {
        this.tools = result.tools;
        const tools = result.tools.map(
          (tool: { name: string; description: string }) => tool.name
        );
        console.log(`MCP server available tools: ${tools}`);
        this.promptUserForSelection(this.tools)
      } else {
        const text = JSON.stringify(result, null, 2);
        console.log(`MCP server sent data: ${text}`);
        this.promptUserForSelection(this.tools)
      }
    });

    this.process.stderr?.on("data", (data) => {
      console.error(`MCP server sent error: ${data}`);
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.process.stdin?.write(serializeMessage(message));
  }

  async listTools() {
    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    };
    await this.send(message);
  }

  async callTool(name: string, args: Record<string, unknown> = {}) {
    const message: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    };
    this.send(message);
  }

  async promptUserForSelection(tools: string[]) {
    try {
      // 使用 inquirer 创建选择菜单
      const answers = await inquirer.prompt([
        {
          type: 'list', // 创建一个列表类型的选择菜单
          name: 'selectedTool',
          message: 'Select a tool to use:',
          choices: tools, // 使用工具列表填充选项
        },
      ]);
      const { selectedTool } = answers
      if (selectedTool === 'list_directory') {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name:'selectedPath',
            message: 'Enter a path to list:',
           },
         ]);
         console.log(`call: ${selectedTool}:${answer.selectedPath}`)
         this.callTool(selectedTool, { path: answer.selectedPath })
      } else {
        console.log(`You selected: ${answers.selectedTool}`);
      }
    } catch (error) {
      console.error('Error during user prompt:', error);
    }
  }
}

const main = async () => {
  const client = new FSClient("dist/index.js", ["src"]);
  client.start();
  client.listTools();
  setTimeout(() => {
    // client.callTool("list_directory", { path: "./src" });
  }, 200);
};

main();
