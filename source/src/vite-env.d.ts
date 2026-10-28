/// <reference types="vite/client" />

declare module '*.ink?raw' {
  const source: string;
  export default source;
}
