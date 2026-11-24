/** Read a required server environment variable, failing loudly when it is missing */
export const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value === "") throw new Error(`Missing environment variable ${name}`);

  return value;
};
