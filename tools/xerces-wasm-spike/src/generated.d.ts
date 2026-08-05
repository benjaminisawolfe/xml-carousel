declare module '*xerces-spike.mjs' {
  const createModule: (
    options?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  export default createModule;
}
