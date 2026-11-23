import { day } from "#/utils/day";
import { styleText } from "node:util";

const format = (type: string, message: string) => `${styleText("underline", day().format("YYYY-MM-DD HH:mm:ss"))} ${type} ${message}`;

export const logger = {
  info: (message: string): void => {
    console.info(format(styleText(["bgBlueBright", "black"], "INFO"), message));
  },

  error: (message: string, stack?: string): void => {
    console.error(format(styleText(["bgRed", "black"], "OUPS"), `${message}${stack !== undefined ? `\n${stack}` : ""}`));
  },

  warn: (message: string): void => {
    console.warn(format(styleText(["bgYellow", "black"], "WARN"), message));
  },
};
