/// <reference types="vite/client" />

declare module "*.css" {
  const content: string;
  export default content;
}

declare module "bootstrap/dist/css/bootstrap.min.css";
declare module "gifenc";
declare module "utif";