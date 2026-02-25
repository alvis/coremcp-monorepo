/** application implementation information exchanged during mcp initialization */
export interface AppInfo extends Record<string, string> {
  /** human-readable name of the mcp implementation */
  name: string;
  /** version string following semantic versioning */
  version: string;
}
