import { Command } from "commander";

const program = new Command();

program
  .name("trade")
  .description("Trading CLI tool for OpenClaw AI agents")
  .version("0.1.0");

program.parse();
