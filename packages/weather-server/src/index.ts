#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesResultSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import {
  WeatherData,
  isValidForecastArgs,
  ForecastDay,
  OpenWeatherResponse,
} from "./types.js";

dotenv.config();

const API_KEY = process.env.OPENWEATHER_API_KEY;

if (!API_KEY) {
  throw new Error("OPENWEATHER_API_KEY environment variable is required");
}

const API_CONFIG = {
  BASE_URL: "http://api.openweathermap.org/data/2.5",
  DEFAULT_CITY: "San Francisco",
  ENDPOINTS: {
    CURRENT: "weather",
    FORECAST: "forecast",
  },
} as const;

class WeatherServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: "custom-weather-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      params: {
        appid: API_KEY,
        units: "metric",
      },
    });

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit();
    });
  }

  private setupHandlers() {
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: `weather://${API_CONFIG.DEFAULT_CITY}/current`,
          name: `Current weather in ${API_CONFIG.DEFAULT_CITY}`,
          mimeType: "application/json",
          description:
            "Real-time weather data including temperature, conditions, humidity, and wind speed",
        },
      ],
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const city = API_CONFIG.DEFAULT_CITY;
        if (request.params.uri !== `weather://${city}/current`) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${request.params.uri}`
          );
        }

        try {
          const response = await this.axiosInstance.get<OpenWeatherResponse>(
            API_CONFIG.ENDPOINTS.CURRENT,
            { params: { q: city } }
          );
          const weatherData: WeatherData = {
            temperature: response.data.main.temp,
            conditions: response.data.weather[0].description,
            humidity: response.data.main.humidity,
            wind_speed: response.data.wind.speed,
            timestamp: new Date().toISOString(),
          };
          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: "application/json",
                text: JSON.stringify(weatherData, null, 2),
              },
            ],
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new McpError(
              ErrorCode.InternalError,
              `Weather API error: ${
                error.response?.data.message ?? error.message
              }`
            );
          }
          throw error;
        }
      }
    );
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_forecast",
          description: "Get weather forecast for a city",
          inputSchema: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "City name",
              },
              days: {
                type: "number",
                description: "Number of days (1-5)",
                minimum: 1,
                maximum: 5,
              },
            },
            required: ["city"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== "get_forecast") {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      if (!isValidForecastArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid forecast arguments"
        );
      }

      const city = request.params.arguments.city;
      const days = Math.min(request.params.arguments.days || 3, 5);

      try {
        const response = await this.axiosInstance.get<{
          list: OpenWeatherResponse[];
        }>(API_CONFIG.ENDPOINTS.FORECAST, {
          params: {
            q: city,
            cnt: days * 8,
          },
        });

        const forecasts: ForecastDay[] = [];
        for (let i = 0; i < response.data.list.length; i += 8) {
          const dayData = response.data.list[i];
          forecasts.push({
            date:
              dayData.dt_txt?.split(" ")[0] ??
              new Date().toISOString().split("T")[0],
            temperature: dayData.main.temp,
            conditions: dayData.weather[0].description,
          });
        }

        return {
          content: {
            mimeType: "application/json",
            text: JSON.stringify(forecasts, null, 2),
          },
        };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return {
            content: {
              mimeType: "text/plain",
              text: `Weather API error: ${
                error.response?.data.message ?? error.message
              }`,
            },
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Although this is just an informative message, we must log to stderr,
    // to avoid interfering with MCP communication that happens on stdout
    // ???
    console.error("Weather MCP server running on stdio");
  }
}

const server = new WeatherServer();
server.run().catch(console.error);
