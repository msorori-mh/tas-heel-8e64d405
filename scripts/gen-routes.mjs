import {
  Generator,
  getConfig,
  physicalGetRouteNodes as getRouteNodes,
} from "@tanstack/router-generator";
const root = process.cwd();
const config = await getConfig({}, root);
const g = new Generator({ config, root, getRouteNodes });
await g.run();
console.log("routeTree generated");
